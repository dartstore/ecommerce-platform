import type { PaymentAttemptStatus, PaymentIntentStatus } from '@prisma/client'
import {
  deriveStatusFromAmounts,
  evaluateOrdering,
  type IntentSnapshot,
  type ObservedFact as OrderingFact,
  type StaleReason,
} from '../payment-intent.state'
import type { ObservedFactType } from '../gateways/provider.types'

/**
 * ==================================================================
 * Fact decision
 * ==================================================================
 *
 * Turns one observed fact plus the current intent into a decision.
 *
 * Pure: no Prisma, no Nest, no I/O. The applier does the writing, this
 * decides what the writing should be, and it is unit-testable on its
 * own — which matters because every ordering bug in a payment system
 * lives exactly here.
 */

export type IgnoreReason =
  | StaleReason
  | 'unsupported_fact'
  | 'amount_missing'
  /** Same cumulative amount as already recorded: a redelivery. */
  | 'already_applied'

export type FactDecision =
  /** Stale or illegal. Record the event with applied=false, change nothing. */
  | { readonly kind: 'ignore'; readonly reason: IgnoreReason }
  /** Audit only: nothing in this phase can act on it. */
  | { readonly kind: 'record_only'; readonly note: string }
  | {
      readonly kind: 'apply'
      readonly intentStatus: PaymentIntentStatus
      readonly attemptStatus: PaymentAttemptStatus
      readonly capturedTotalMinor: bigint
      readonly refundedTotalMinor: bigint
      /** Amount of the new capture row, when this fact adds one. */
      readonly newCaptureMinor: bigint | null
      readonly terminal: boolean
    }

export interface DecisionInput {
  readonly snapshot: IntentSnapshot
  /** The intent's full amount, used to tell partial from full capture. */
  readonly amountMinor: bigint
  readonly factType: ObservedFactType
  /** Cumulative as the provider sees it, not a delta. */
  readonly cumulativeAmountMinor?: bigint
  readonly providerSequence?: number
  readonly occurredAt?: Date
}

/** Facts that only ever produce an audit record in this phase. */
const AUDIT_ONLY: ReadonlySet<ObservedFactType> = new Set<ObservedFactType>([
  'dispute_opened',
  'dispute_updated',
  'dispute_closed',
  'settlement_line',
])

/** Facts needing a Refund model, which does not exist yet. */
const NEEDS_REFUND_MODEL: ReadonlySet<ObservedFactType> = new Set<ObservedFactType>([
  'refund_succeeded',
  'refund_failed',
])

const ATTEMPT_STATUS: Readonly<
  Partial<Record<ObservedFactType, PaymentAttemptStatus>>
> = {
  attempt_authorized: 'authorized',
  attempt_captured: 'succeeded',
  attempt_failed: 'failed',
  attempt_expired: 'expired',
  attempt_voided: 'cancelled',
}

const TERMINAL_FACTS: ReadonlySet<ObservedFactType> = new Set<ObservedFactType>([
  'attempt_captured',
  'attempt_failed',
  'attempt_expired',
  'attempt_voided',
])

export function decideFact(input: DecisionInput): FactDecision {
  const { factType } = input

  if (AUDIT_ONLY.has(factType)) {
    return {
      kind: 'record_only',
      note: 'Disputes and settlement lines are recorded but not acted on yet.',
    }
  }

  if (NEEDS_REFUND_MODEL.has(factType)) {
    return {
      kind: 'record_only',
      note: 'Refunds are recorded for audit until the refund model exists.',
    }
  }

  const attemptStatus = ATTEMPT_STATUS[factType]

  if (!attemptStatus) {
    return { kind: 'ignore', reason: 'unsupported_fact' }
  }

  // A capture with no amount cannot be reconciled against the ledger, and
  // guessing would post money that nobody reported.
  if (factType === 'attempt_captured' && input.cumulativeAmountMinor === undefined) {
    return { kind: 'ignore', reason: 'amount_missing' }
  }

  const capturedTotalMinor =
    factType === 'attempt_captured'
      ? (input.cumulativeAmountMinor as bigint)
      : input.snapshot.capturedTotalMinor

  const intentStatus = candidateIntentStatus(
    factType,
    input.amountMinor,
    capturedTotalMinor,
    input.snapshot.refundedTotalMinor,
  )

  const orderingFact: OrderingFact = {
    status: intentStatus,
    // The guard's field is cumulativeCapturedMinor, not the fact's
    // cumulativeAmountMinor. Passing the wrong name silently disables the
    // monotonic-money check, so this call is deliberately untyped-cast-free.
    cumulativeCapturedMinor:
      factType === 'attempt_captured' ? capturedTotalMinor : undefined,
    providerSequence: input.providerSequence,
    occurredAt: input.occurredAt,
  }

  const verdict = evaluateOrdering(input.snapshot, orderingFact)

  if (!verdict.apply) {
    return { kind: 'ignore', reason: verdict.reason ?? 'illegal_transition' }
  }

  const newCaptureMinor =
    factType === 'attempt_captured'
      ? capturedTotalMinor - input.snapshot.capturedTotalMinor
      : null

  // Zero means the provider reported the same cumulative amount again —
  // a redelivery, not a regression. Reporting them as the same thing
  // made a duplicate webhook look like a fault.
  if (newCaptureMinor !== null && newCaptureMinor === 0n) {
    return { kind: 'ignore', reason: 'already_applied' }
  }

  if (newCaptureMinor !== null && newCaptureMinor < 0n) {
    return { kind: 'ignore', reason: 'captured_regression' }
  }

  return {
    kind: 'apply',
    intentStatus,
    attemptStatus,
    capturedTotalMinor,
    refundedTotalMinor: input.snapshot.refundedTotalMinor,
    newCaptureMinor,
    terminal: TERMINAL_FACTS.has(factType),
  }
}

function candidateIntentStatus(
  factType: ObservedFactType,
  amountMinor: bigint,
  capturedMinor: bigint,
  refundedMinor: bigint,
): PaymentIntentStatus {
  switch (factType) {
    case 'attempt_authorized':
      return 'authorized'
    case 'attempt_failed':
      return 'failed'
    case 'attempt_expired':
      return 'expired'
    case 'attempt_voided':
      return 'cancelled'
    case 'attempt_captured':
      return deriveStatusFromAmounts({
        amountMinor,
        capturedMinor,
        refundedMinor,
        authorized: true,
      })
    default:
      return 'processing'
  }
}