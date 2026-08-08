import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Mode, PaymentEventSource } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { LedgerService } from '../../../ledger/ledger.service'
import { captureSucceeded } from '../../../ledger/posting-rules'
import { OutboxService } from '../../../common/messaging/outbox.service'
import { isUniqueConstraintError } from '../../../common/idempotency/idempotency.types'
import type { ObservedFact } from '../gateways/provider.types'
import { decideFact } from './fact-decision'
import { CheckoutFinalizerService } from './checkout-finalizer.service'

/**
 * ==================================================================
 * Applying observed facts
 * ==================================================================
 *
 * One consumer, three producers. Webhooks, reconciliation sweeps and a
 * customer returning from a gateway all produce ObservedFacts and all
 * arrive here. Because the dedupe key is derived from the fact's content
 * rather than from how it travelled, the same fact delivered by all
 * three routes is applied exactly once.
 *
 * That is the property that makes the system correct when webhooks are
 * lost, and it only holds if nothing else is allowed to mutate payment
 * state from a provider signal.
 */

/** Facts that mean the money is secured and the order may exist. */
const SECURES_FUNDS = new Set(['attempt_authorized', 'attempt_captured'])

/** Facts that mean the payment will never complete. */
const RELEASES_FUNDS = new Set([
  'attempt_failed',
  'attempt_expired',
  'attempt_voided',
])

export type ApplyOutcome =
  | 'applied'
  | 'duplicate'
  | 'ignored'
  | 'recorded'
  | 'unmatched'

export interface ApplyResult {
  readonly outcome: ApplyOutcome
  readonly intentId: bigint | null
  readonly reason?: string
}

@Injectable()
export class PaymentFactApplier {
  private readonly logger = new Logger(PaymentFactApplier.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    private readonly finalizer: CheckoutFinalizerService,
  ) {}

  async applyMany(
    facts: readonly ObservedFact[],
    source: PaymentEventSource,
  ): Promise<ApplyResult[]> {
    const results: ApplyResult[] = []

    for (const fact of facts) {
      results.push(await this.apply(fact, source))
    }

    return results
  }

  /**
   * @param source which route delivered this fact. Recorded on the event
   * so the audit trail shows whether the webhook, the sweep or the
   * customer's return got there first.
   */
  async apply(
    fact: ObservedFact,
    source: PaymentEventSource,
  ): Promise<ApplyResult> {
    // The attempt is found by (account, gateway reference), which is
    // unique. Scoping to the account rather than the gateway is what
    // stops two stores sharing one provider account from colliding.
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        account_id: fact.accountId,
        gateway_reference: fact.gatewayReference,
      },
    })

    if (!attempt) {
      // Not an error: the provider may be faster than our own write, or
      // the reference may belong to a test intent that was purged. The
      // caller decides whether to retry later.
      this.logger.warn(
        `Unmatched fact ${fact.factType} for account ${fact.accountId} ref ${fact.gatewayReference}.`,
      )
      return { outcome: 'unmatched', intentId: null }
    }

    const intent = await this.prisma.paymentIntent.findFirst({
      where: { id: attempt.intent_id, store_id: attempt.store_id },
    })

    if (!intent) {
      throw new NotFoundException(
        `Attempt ${attempt.id} references a missing intent.`,
      )
    }

    const decision = decideFact({
      snapshot: {
        status: intent.status,
        capturedTotalMinor: intent.captured_total_minor,
        refundedTotalMinor: intent.refunded_total_minor,
      },
      amountMinor: intent.amount_minor,
      factType: fact.factType,
      cumulativeAmountMinor: fact.cumulativeAmountMinor,
      providerSequence: fact.providerSequence,
      occurredAt: fact.occurredAt,
    })

    if (decision.kind === 'ignore') {
      // Superseded facts are still stored. Dropping them loses the
      // evidence that would explain a disputed sequence later.
      await this.recordEvent(fact, intent.id, intent.store_id, intent.mode, {
        applied: false,
        supersededReason: decision.reason,
        source,
      })
      return {
        // A fact carrying nothing new is a duplicate, not a fault.
        outcome: decision.reason === 'already_applied' ? 'duplicate' : 'ignored',
        intentId: intent.id,
        reason: decision.reason,
      }
    }

    if (decision.kind === 'record_only') {
      await this.recordEvent(fact, intent.id, intent.store_id, intent.mode, {
        applied: false,
        supersededReason: 'not_actionable',
        source,
      })
      return { outcome: 'recorded', intentId: intent.id, reason: decision.note }
    }

    const now = new Date()

    try {
      await this.prisma.$transaction(
        async (tx) => {
        // The unique dedupe key on payment_events is the idempotency
        // guarantee. It is inserted first so a duplicate aborts the whole
        // transaction before anything else is written.
        await tx.paymentEvent.create({
          data: {
            intent_id: intent.id,
            store_id: intent.store_id,
            mode: intent.mode,
            event_type: fact.factType,
            dedupe_key: fact.dedupeKey,
            source,
            applied: true,
            payload_redacted: (fact.rawRedacted ??
              null) as Prisma.InputJsonValue,
            occurred_at: fact.occurredAt ?? now,
          },
        })

        // Optimistic concurrency: if another writer moved the intent
        // between the read and here, this matches nothing and the whole
        // transaction is abandoned.
        const updated = await tx.paymentIntent.updateMany({
          where: { id: intent.id, version: intent.version },
          data: {
            status: decision.intentStatus,
            captured_total_minor: decision.capturedTotalMinor,
            refunded_total_minor: decision.refundedTotalMinor,
            terminal_at: decision.terminal ? now : null,
            version: { increment: 1 },
          },
        })

        if (updated.count === 0) {
          throw new ConcurrentIntentUpdate(intent.id)
        }

        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: decision.attemptStatus,
            next_action_kind: 'none',
            gateway_payment_id:
              fact.refs?.gatewayPaymentId ?? attempt.gateway_payment_id,
          },
        })

        if (decision.newCaptureMinor !== null) {
          const beneficiaryId = await this.findBeneficiary(
            tx,
            intent.store_id,
            intent.mode,
            intent.currency,
          )

          const capture = await tx.capture.create({
            data: {
              intent_id: intent.id,
              attempt_id: attempt.id,
              store_id: intent.store_id,
              mode: intent.mode,
              amount_minor: decision.newCaptureMinor,
              currency: intent.currency,
              status: 'succeeded',
              gateway_capture_ref: fact.refs?.gatewayCaptureRef ?? null,
              captured_at: fact.occurredAt ?? now,
            },
            select: { id: true },
          })

          await tx.captureAllocation.create({
            data: {
              capture_id: capture.id,
              beneficiary_id: beneficiaryId,
              store_id: intent.store_id,
              mode: intent.mode,
              amount_minor: decision.newCaptureMinor,
              kind: 'revenue',
            },
          })

          // Money captured through a gateway lands in a receivable from
          // the provider, cleared later by the settlement.
          await this.ledger.post(tx, {
            storeId: intent.store_id,
            mode: intent.mode,
            currency: intent.currency,
            entryType: 'payment.captured.gateway',
            sourceKind: 'capture',
            sourceId: capture.id.toString(),
            dedupeKey: `${fact.dedupeKey}:ledger`,
            occurredAt: fact.occurredAt ?? now,
            memo: `Capture for intent ${intent.id}`,
            postings: captureSucceeded({
              totalMinor: decision.newCaptureMinor,
              paymentAccountId: fact.accountId,
              allocations: [
                { beneficiaryId, amountMinor: decision.newCaptureMinor },
              ],
            }),
          })
        }

        // A funds_secured checkout has no order until here. Creating it
        // inside this transaction is what makes "order exists implies
        // money secured" true rather than merely usual.
        if (intent.context_kind === 'checkout' && intent.context_id !== '') {
          const checkoutId = BigInt(intent.context_id)

          if (SECURES_FUNDS.has(fact.factType)) {
            await this.finalizer.finalize(tx, {
              checkoutId,
              storeId: intent.store_id,
              mode: intent.mode,
              paid: decision.capturedTotalMinor > 0n,
              occurredAt: fact.occurredAt ?? now,
            })
          } else if (RELEASES_FUNDS.has(fact.factType)) {
            await this.finalizer.abandon(tx, {
              checkoutId,
              storeId: intent.store_id,
              occurredAt: fact.occurredAt ?? now,
            })
          }
        }

        await this.outbox.emit(tx, {
          storeId: intent.store_id,
          mode: intent.mode,
          aggregateType: 'payment_intent',
          aggregateId: intent.id.toString(),
          eventType: `payment.${fact.factType}`,
          payload: {
            intentId: intent.id.toString(),
            attemptId: attempt.id.toString(),
            factType: fact.factType,
            intentStatus: decision.intentStatus,
            capturedTotalMinor: decision.capturedTotalMinor.toString(),
            currency: intent.currency,
          },
          occurredAt: fact.occurredAt ?? now,
        })
        },
        // The default 5s is not enough once a second delivery of the
        // same fact is blocking on the dedupe key: the loser waits for
        // the winner to finish creating an order and moving stock.
        { timeout: 20_000, maxWait: 10_000 },
      )
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Same fact, already applied by another route.
        return { outcome: 'duplicate', intentId: intent.id }
      }

      if (error instanceof ConcurrentIntentUpdate) {
        this.logger.warn(
          `Intent ${intent.id} changed underneath fact ${fact.dedupeKey}; not applied.`,
        )
        return {
          outcome: 'ignored',
          intentId: intent.id,
          reason: 'concurrent_update',
        }
      }

      throw error
    }

    this.logger.log(
      `Applied ${fact.factType} to intent ${intent.id} (${decision.intentStatus}).`,
    )

    return { outcome: 'applied', intentId: intent.id }
  }

  /* ---------------------------------------------------------------- */

  private async recordEvent(
    fact: ObservedFact,
    intentId: bigint,
    storeId: bigint,
    mode: Mode,
    options: {
      applied: boolean
      supersededReason: string
      source: PaymentEventSource
    },
  ): Promise<void> {
    try {
      await this.prisma.paymentEvent.create({
        data: {
          intent_id: intentId,
          store_id: storeId,
          mode,
          event_type: fact.factType,
          dedupe_key: fact.dedupeKey,
          source: options.source,
          applied: options.applied,
          superseded_reason: options.supersededReason,
          payload_redacted: (fact.rawRedacted ?? null) as Prisma.InputJsonValue,
          occurred_at: fact.occurredAt ?? new Date(),
        },
      })
    } catch (error) {
      // Already recorded by another route; nothing further to do.
      if (!isUniqueConstraintError(error)) throw error
    }
  }

  /**
   * Resolves the store's beneficiary, creating it on first use.
   *
   * Runs inside the caller's transaction and behind an advisory lock.
   * The unique constraint on beneficiaries includes external_ref, which
   * is NULL for the store's own beneficiary, and Postgres treats every
   * NULL as distinct — so the constraint does not prevent duplicates.
   * Two concurrent captures would otherwise each create one, splitting a
   * store's revenue across two ledger accounts that never reconcile.
   */
  private async findBeneficiary(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    mode: Mode,
    currency: string,
  ): Promise<bigint> {
    const lockKey = `beneficiary:${storeId}:${mode}`
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void and
    // Prisma has no deserializer for that type, so $queryRaw fails with
    // "Failed to deserialize column of type 'void'". Nothing reads the
    // result here — the statement is executed purely for the lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

    const existing = await tx.beneficiary.findFirst({
      where: { store_id: storeId, mode, kind: 'store', external_ref: null },
      select: { id: true },
    })

    if (existing) return existing.id

    const created = await tx.beneficiary.create({
      data: {
        store_id: storeId,
        mode,
        kind: 'store',
        external_ref: null,
        default_currency: currency,
      },
      select: { id: true },
    })

    return created.id
  }
}

/** Raised when optimistic concurrency rejects the update. */
class ConcurrentIntentUpdate extends Error {
  constructor(readonly intentId: bigint) {
    super(`Intent ${intentId} was modified concurrently.`)
    this.name = 'ConcurrentIntentUpdate'
    Object.setPrototypeOf(this, ConcurrentIntentUpdate.prototype)
  }
}