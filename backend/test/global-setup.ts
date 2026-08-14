import { execFileSync } from 'child_process';
import { join } from 'path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

/**
 * Starts one Postgres container for the entire run.
 *
 * Previously each spec started its own container in beforeAll and shut
 * it down in afterAll. That multiplied container startup and `db push`
 * by the number of suites, and any spec that outlived its container left
 * later suites holding a dead client. Doing it once here removes both.
 *
 * The URL is published on process.env so every spec reads the same
 * database. jest-integration runs with --runInBand, so there is exactly
 * one worker and no risk of suites racing each other.
 */
module.exports = async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('payments_test')
    .withUsername('test')
    .withPassword('test')
    // Durability settings only matter if the data must survive a crash.
    // This database is thrown away at the end of the run, and leaving
    // fsync on made TRUNCATE ... CASCADE take over thirty seconds per
    // test on a slow container — the whole suite was waiting on disk.
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
      '-c',
      'autovacuum=off',
    ])
    .start();

  const raw = container.getConnectionUri();

  // Postgres waits for a lock forever by default, so a blocked TRUNCATE
  // hangs the suite with no output. These turn that into a fast, named
  // error. Set through the URL because Prisma pools connections and a
  // SET would only affect whichever connection ran it.
  const options = [
    '-c lock_timeout=5000',
    '-c statement_timeout=30000',
    '-c idle_in_transaction_session_timeout=15000',
  ].join(' ');

  const url = `${raw}${raw.includes('?') ? '&' : '?'}options=${encodeURIComponent(options)}`;

  pushSchema(url);
  configureRlsRole(url);
  setupRls(url);

  const rlsUrl = new URL(url);
  rlsUrl.username = 'rls_test';
  rlsUrl.password = 'rls_test';

  process.env.TEST_DATABASE_URL = rlsUrl.toString();
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
};

/**
 * Applies the schema to the fresh container.
 *
 * The Prisma CLI is invoked directly rather than through npx: npx
 * prompts on stdin when it has to resolve a package, and with stdio
 * piped that prompt is invisible and waits forever. stdin is closed and
 * a timeout is set, because execFileSync blocks the event loop and Jest
 * cannot time it out from the outside.
 */
function pushSchema(url: string): void {
  const binary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );

  try {
    execFileSync(
      binary,
      ['db', 'push', '--skip-generate', '--accept-data-loss'],
      {
        env: { ...process.env, DATABASE_URL: url },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
        windowsHide: true,
      },
    );
  } catch (error) {
    const detail = error as {
      status?: number;
      signal?: string;
      stdout?: Buffer;
      stderr?: Buffer;
      message?: string;
    };

    throw new Error(
      [
        'prisma db push failed while preparing the test database.',
        `binary: ${binary}`,
        detail.signal
          ? `signal: ${detail.signal}`
          : `exit code: ${detail.status}`,
        detail.stdout?.toString().trim(),
        detail.stderr?.toString().trim(),
        detail.message,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
function setupRls(url: string): void {
  const script = `
GRANT USAGE ON SCHEMA public TO rls_test;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO rls_test;

GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
TO rls_test;

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;

-- Payment / ledger tenant RLS
ALTER TABLE "payment_method_offerings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumed_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "captures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capture_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refund_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "beneficiaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_method_offering_store_isolation
ON "payment_method_offerings";

CREATE POLICY payment_method_offering_store_isolation
ON "payment_method_offerings"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS payment_account_store_isolation
ON "payment_accounts";

CREATE POLICY payment_account_store_isolation
ON "payment_accounts"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS payment_idempotency_store_isolation
ON "payment_idempotency_records";

CREATE POLICY payment_idempotency_store_isolation
ON "payment_idempotency_records"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS outbox_store_isolation
ON "outbox_messages";

CREATE POLICY outbox_store_isolation
ON "outbox_messages"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS consumed_event_store_isolation
ON "consumed_events";

CREATE POLICY consumed_event_store_isolation
ON "consumed_events"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS inventory_reservation_store_isolation
ON "inventory_reservations";

CREATE POLICY inventory_reservation_store_isolation
ON "inventory_reservations"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS payment_intent_store_isolation
ON "payment_intents";

CREATE POLICY payment_intent_store_isolation
ON "payment_intents"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS payment_attempt_store_isolation
ON "payment_attempts";

CREATE POLICY payment_attempt_store_isolation
ON "payment_attempts"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS capture_store_isolation
ON "captures";

CREATE POLICY capture_store_isolation
ON "captures"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS capture_allocation_store_isolation
ON "capture_allocations";

CREATE POLICY capture_allocation_store_isolation
ON "capture_allocations"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS refund_store_isolation
ON "refunds";

CREATE POLICY refund_store_isolation
ON "refunds"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS refund_allocation_store_isolation
ON "refund_allocations";

CREATE POLICY refund_allocation_store_isolation
ON "refund_allocations"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS beneficiary_store_isolation
ON "beneficiaries";

CREATE POLICY beneficiary_store_isolation
ON "beneficiaries"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS ledger_account_store_isolation
ON "ledger_accounts";

CREATE POLICY ledger_account_store_isolation
ON "ledger_accounts"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS journal_entry_store_isolation
ON "journal_entries";

CREATE POLICY journal_entry_store_isolation
ON "journal_entries"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS payment_event_store_isolation
ON "payment_events";

CREATE POLICY payment_event_store_isolation
ON "payment_events"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
  AND mode::text = NULLIF(current_setting('app.mode', true), '')
);

DROP POLICY IF EXISTS order_store_isolation ON "Order";

CREATE POLICY order_store_isolation
ON "Order"
FOR ALL
TO rls_test
USING (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
)
WITH CHECK (
  store_id = NULLIF(current_setting('app.store_id', true), '')::bigint
);

DROP POLICY IF EXISTS order_item_store_isolation ON "OrderItem";

CREATE POLICY order_item_store_isolation
ON "OrderItem"
FOR ALL
TO rls_test
USING (
  EXISTS (
    SELECT 1
    FROM "Order" o
    WHERE o.id = "OrderItem".order_id
      AND o.store_id =
        NULLIF(current_setting('app.store_id', true), '')::bigint
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Order" o
    WHERE o.id = "OrderItem".order_id
      AND o.store_id =
        NULLIF(current_setting('app.store_id', true), '')::bigint
  )
);
`;

  const binary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );

  execFileSync(binary, ['db', 'execute', '--stdin', '--url', url], {
    input: script,
    env: {
      ...process.env,
      DATABASE_URL: url,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    windowsHide: true,
  });
}
function configureRlsRole(url: string): void {
  const script = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'rls_test'
      ) THEN
        CREATE ROLE rls_test LOGIN PASSWORD 'rls_test';
      ELSE
        ALTER ROLE rls_test LOGIN PASSWORD 'rls_test';
      END IF;
    END
    $$;

    GRANT USAGE ON SCHEMA public TO rls_test;

    GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO rls_test;

    GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA public
    TO rls_test;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rls_test;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO rls_test;
  `;

  const binary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );

  execFileSync(binary, ['db', 'execute', '--stdin', '--url', url], {
    input: script,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
    windowsHide: true,
  });
}
