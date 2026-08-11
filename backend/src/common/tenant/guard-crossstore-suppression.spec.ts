import { Logger } from '@nestjs/common'
import { buildTenantGuardDefinition } from './tenant-guard.extension'
import { TenantContextService } from './tenant-context.service'
import { crossStoreQuery, isCrossStoreQuery } from './cross-store-query'

/**
 * Does the cross-store scope actually reach the guard?
 *
 * The bypass sits before the inspection, which is necessary but not
 * sufficient: AsyncLocalStorage has to survive from the caller into
 * Prisma's extension handler. That is an empirical question, so it is
 * tested rather than reasoned about.
 */

/** Captures what the guard logs, at every level. */
function makeLogger() {
  const warnings: string[] = []
  const debugs: string[] = []

  const logger = {
    warn: (message: string) => warnings.push(message),
    debug: (message: string) => debugs.push(message),
    error: (message: string) => warnings.push(message),
    log: () => undefined,
  } as unknown as Logger

  return { logger, warnings, debugs }
}

/**
 * Invokes the extension's handler the way Prisma does.
 *
 * The extension is a plain object; $allOperations is the function Prisma
 * calls per query. Calling it directly exercises the real code path
 * without needing a database.
 */
async function runThroughGuard(
  extension: any,
  args: { model: string; operation: string; args: unknown },
): Promise<void> {
  const handler = extension.query.$allOperations
  await handler({
    model: args.model,
    operation: args.operation,
    args: args.args,
    query: async () => [],
  })
}

describe('cross-store scope suppresses violations', () => {
  const unscopedRead = {
    model: 'PaymentAttempt',
    operation: 'findFirst',
    // Exactly the applier's query: a provider fact carries no store.
    args: { where: { account_id: 7n, gateway_reference: 'pi_1' } },
  }

  it('warns when the same query runs outside an approved scope', async () => {
    const { logger, warnings } = makeLogger()
    const context = new TenantContextService()

    const extension = buildTenantGuardDefinition({
      enabled: true,
      tenantContext: context,
      logger,
    })

    await runThroughGuard(extension, unscopedRead)

    // Baseline: without the scope this is a violation, twice over.
    expect(warnings.join(' ')).toContain('missing_store_scope')
    expect(warnings.join(' ')).toContain('missing_mode_scope')
  })

  it('emits no warning inside provider_lookup', async () => {
    const { logger, warnings, debugs } = makeLogger()
    const context = new TenantContextService()

    const extension = buildTenantGuardDefinition({
      enabled: true,
      tenantContext: context,
      logger,
    })

    await crossStoreQuery(
      'provider_lookup',
      'resolve the attempt a provider fact belongs to',
      () => runThroughGuard(extension, unscopedRead),
    )

    expect(warnings).toEqual([])
    // and it says why it let the query through
    expect(debugs.join(' ')).toContain('provider_lookup')
  })

  it('survives an await between opening the scope and the query', async () => {
    // The applier awaits inside the callback. If the scope did not
    // propagate across that boundary the bypass would silently stop
    // working and the warnings would come back.
    const { logger, warnings } = makeLogger()
    const context = new TenantContextService()

    const extension = buildTenantGuardDefinition({
      enabled: true,
      tenantContext: context,
      logger,
    })

    await crossStoreQuery('provider_lookup', 'deferred', async () => {
      await new Promise((resolve) => setImmediate(resolve))
      await runThroughGuard(extension, unscopedRead)
    })

    expect(warnings).toEqual([])
  })

  it('resumes warning once the scope closes', async () => {
    const { logger, warnings } = makeLogger()
    const context = new TenantContextService()

    const extension = buildTenantGuardDefinition({
      enabled: true,
      tenantContext: context,
      logger,
    })

    await crossStoreQuery('provider_lookup', 'inside', () =>
      runThroughGuard(extension, unscopedRead),
    )
    expect(warnings).toEqual([])

    await runThroughGuard(extension, unscopedRead)
    expect(warnings.join(' ')).toContain('missing_store_scope')
  })
})

describe('lazy promises — the shape the applier actually uses', () => {
  /**
   * Mimics a Prisma promise: nothing runs until it is awaited.
   *
   * The earlier tests here awaited inside the callback, which executes
   * eagerly within the scope. The applier returns an unawaited promise,
   * so execution lands after the scope would otherwise have closed. That
   * difference is the whole bug, so it needs its own test.
   */
  function lazyQuery(onExecute: () => void) {
    return {
      then(resolve: (value: unknown) => void) {
        onExecute()
        resolve(null)
      },
    }
  }

  it('keeps the scope open until a lazily-executed query runs', async () => {
    let insideScope: boolean | null = null

    await crossStoreQuery('provider_lookup', 'lazy', () =>
      lazyQuery(() => {
        insideScope = isCrossStoreQuery()
      }) as unknown as Promise<unknown>,
    )

    // Before the fix this was false: the promise executed after
    // storage.run had already returned.
    expect(insideScope).toBe(true)
  })

  it('suppresses violations for a lazily-executed guarded query', async () => {
    const { logger, warnings } = makeLogger()
    const context = new TenantContextService()
    const extension = buildTenantGuardDefinition({
      enabled: true,
      tenantContext: context,
      logger,
    })

    // Exactly the applier's shape: the callback returns without awaiting.
    await crossStoreQuery('provider_lookup', 'applier shape', () =>
      runThroughGuard(extension, {
        model: 'PaymentAttempt',
        operation: 'findFirst',
        args: { where: { account_id: 7n, gateway_reference: 'pi_1' } },
      }),
    )

    expect(warnings).toEqual([])
  })
})