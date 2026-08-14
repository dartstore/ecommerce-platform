import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { LedgerService } from '../../ledger/ledger.service';
import { OutboxService } from '../../common/messaging/outbox.service';
import { CodAdapter } from '../payments/gateways/adapters/cod.adapter';
import {
  ALL_TEST_TABLES,
  startTestDatabase,
  stopTestDatabase,
  truncateTables,
  withTestTenant,
} from '../../../test/db-test-harness';

/**
 * Integration coverage for the checkout commit path.
 *
 * The whole flow runs in one transaction: checkout, line items, quote,
 * reservations, intent, attempt, order, inventory, ledger entry and
 * outbox message. Only a real database proves it commits or rolls back
 * as a unit.
 */

const SLUG = 'spec-store';

interface Fixture {
  storeId: bigint;
  variantId: bigint;
  offeringId: bigint;
}

/**
 * Collaborators the commit path actually calls.
 *
 * These were `{} as never` placeholders, which compiled and then threw
 * at runtime the moment commit() reached this.ids.reserve() and
 * this.providers.assertCanHandle(). `never` silences the type checker
 * exactly where it was trying to warn us, so the fakes here are real
 * objects with real methods.
 */

/** Reserved ids only need to be unique and not collide with the sequence. */
let reservedId = 500_000n;
const fakeIds = { reserve: async () => ++reservedId } as never;

/** Cash on delivery is the only method this spec exercises. */
const codAdapter = new CodAdapter();
const fakeRegistry = {
  has: (gateway: string) => gateway === 'cod',
  get: () => codAdapter,
  assertCanHandle: () => codAdapter,
} as never;

/** No credentials: cash on delivery has none to read. */
const fakeAccounts = {
  revealCredentialsForGateway: async () => ({}),
} as never;

/** Every request proceeds; idempotency has its own dedicated spec. */
const fakeIdempotency = {
  defaultTtlSeconds: 3600,
  defaultLeaseSeconds: 60,
  claim: async () => ({ outcome: 'proceed' as const, recordId: 1n }),
  complete: async () => undefined,
  fail: async () => undefined,
} as never;

/** Only reached on the gateway path, which this spec does not take. */
const fakeApplier = { applyMany: async () => [] } as never;

describe('CheckoutService (integration)', () => {
  let prisma: PrismaClient;
  let service: CheckoutService;
  let fx: Fixture;

  beforeAll(async () => {
    prisma = await startTestDatabase();

    service = new CheckoutService(
      prisma as never,
      new LedgerService(prisma as never),
      new OutboxService(),
      fakeAccounts,
      fakeIdempotency,
      fakeRegistry,
      fakeIds,
      fakeApplier,
      new TenantContextService(),
    );
  }, 180_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await truncateTables(ALL_TEST_TABLES);
    fx = await seed(prisma);
  });

  it('debugs payment offering RLS context', async () => {
    const before = await prisma.$queryRaw<
      { store_id: string | null; mode: string | null }[]
    >`
      SELECT
        current_setting('app.store_id', true) AS store_id,
        current_setting('app.mode', true) AS mode
    `;

    console.log('RLS BEFORE:', before);

    console.log('OFFERING COUNT:', await prisma.paymentMethodOffering.count());

    await withTestTenant(fx.storeId, async (tx) => {
      const inside = await tx.$queryRaw<
        { store_id: string | null; mode: string | null }[]
      >`
        SELECT
          current_setting('app.store_id', true) AS store_id,
          current_setting('app.mode', true) AS mode
      `;

      console.log('RLS INSIDE:', inside);

      console.log(
        'OFFERING COUNT INSIDE:',
        await tx.paymentMethodOffering.count({
          where: {
            store_id: fx.storeId,
            mode: 'live',
          },
        }),
      );
    });
  });

  it('enforces PostgreSQL RLS for Order and OrderItem', async () => {
    const seeded = await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'RLS Buyer',
      customer_phone: '01000000000',
      address_line: 'RLS Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    expect(seeded.order).not.toBeNull();

    const orderId = BigInt(seeded.order!.id);

    // Correct tenant can read its own order.
    await withTestTenant(fx.storeId, async (tx) => {
      const rows = await tx.order.findMany({
        where: { id: orderId },
      });

      expect(rows).toHaveLength(1);

      const items = await tx.orderItem.findMany({
        where: { order_id: orderId },
      });

      expect(items).toHaveLength(1);
    });

    // No tenant context: RLS must hide the order completely.
    const withoutContext = await prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<
        Array<{ id: bigint }>
      >`SELECT id FROM "Order" WHERE id = ${orderId}`;

      return orders;
    });

    expect(withoutContext).toHaveLength(0);

    // Another tenant: RLS must hide the order and its items.
    const otherStoreId = fx.storeId + 999n;

    const crossStore = await withTestTenant(otherStoreId, async (tx) => {
      const orders = await tx.order.findMany({
        where: { id: orderId },
      });

      const items = await tx.orderItem.findMany({
        where: { order_id: orderId },
      });

      return { orders, items };
    });

    expect(crossStore.orders).toHaveLength(0);
    expect(crossStore.items).toHaveLength(0);
  });

  it('creates an order from a committed checkout', async () => {
    const result = await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 2 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    expect(result.order!.order_number).toBe('1001');
    expect(result.order!.payment_status).toBe('UNPAID');
    // 2 x 25.00
    expect(result.order!.total).toBe('50.00');
    expect(result.payment_redirect_url).toBeNull();
    expect(result.checkout_token).toHaveLength(32);
  });

  it('recomputes prices server-side and ignores what the client thinks', async () => {
    await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    const checkout = await prisma.checkout.findFirstOrThrow({
      where: { store_id: fx.storeId },
    });
    expect(checkout.quote_total_minor).toBe(2500n);
  });

  it('writes the full aggregate in one transaction', async () => {
    await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    expect(await prisma.checkout.count()).toBe(1);
    expect(await prisma.checkoutLineItem.count()).toBe(1);
    expect(await prisma.quoteComponent.count()).toBe(1);
    expect(await prisma.inventoryReservation.count()).toBe(1);
    expect(await prisma.paymentIntent.count()).toBe(1);
    expect(await prisma.paymentAttempt.count()).toBe(1);
    await withTestTenant(fx.storeId, async (tx) => {
      expect(await tx.order.count()).toBe(1);
    });
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });

  it('links the checkout and the order both ways', async () => {
    const result = await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    const { checkout, order } = await withTestTenant(
      fx.storeId,
      async (tx) => ({
        checkout: await tx.checkout.findFirstOrThrow({}),
        order: await tx.order.findFirstOrThrow({}),
      }),
    );

    expect(checkout.status).toBe('committed');
    expect(checkout.order_id).toBe(order.id);
    expect(order.checkout_id).toBe(checkout.id);
    expect(order.id.toString()).toBe(result.order!.id);
  });

  it('posts a balanced receivable entry', async () => {
    await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 2 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    const ledger = new LedgerService(prisma as never);

    expect(
      await ledger.balance({
        storeId: fx.storeId,
        mode: 'live',
        currency: 'USD',
        accountType: 'offline_receivable',
      }),
    ).toBe(5000n);

    expect(await ledger.findUnbalancedEntries()).toEqual([]);
  });

  it('decrements inventory', async () => {
    await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 3 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { id: fx.variantId },
    });
    expect(variant.inventory_qty).toBe(7);
  });

  it('emits an outbox message carrying identifiers only', async () => {
    await service.createAndCommit(SLUG, {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    });

    const message = await prisma.outboxMessage.findFirstOrThrow({});
    expect(message.event_type).toBe('checkout.committed');
    expect(message.status).toBe('pending');

    const payload = message.payload as Record<string, unknown>;
    expect(payload.orderNumber).toBe('1001');
    // no customer PII in the payload
    expect(JSON.stringify(payload)).not.toContain('Test Buyer');
  });

  it('numbers orders per store starting at 1001', async () => {
    const body = {
      items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
      customer_name: 'Test Buyer',
      customer_phone: '01000000000',
      address_line: '1 Test Street',
      city: 'Cairo',
      payment_offering_id: fx.offeringId.toString(),
    };

    const first = await service.createAndCommit(SLUG, body);
    const second = await service.createAndCommit(SLUG, body);

    expect(first.order!.order_number).toBe('1001');
    expect(second.order!.order_number).toBe('1002');
  });

  it('rejects an out-of-stock line and writes nothing', async () => {
    await expect(
      service.createAndCommit(SLUG, {
        items: [{ variant_id: fx.variantId.toString(), quantity: 999 }],
        customer_name: 'Test Buyer',
        customer_phone: '01000000000',
        address_line: '1 Test Street',
        city: 'Cairo',
        payment_offering_id: fx.offeringId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.checkout.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('rejects a variant belonging to another store', async () => {
    const other = await seedOtherStore(prisma);

    await expect(
      service.createAndCommit(SLUG, {
        items: [{ variant_id: other.variantId.toString(), quantity: 1 }],
        customer_name: 'Test Buyer',
        customer_phone: '01000000000',
        address_line: '1 Test Street',
        city: 'Cairo',
        payment_offering_id: fx.offeringId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an offering that belongs to another store', async () => {
    const other = await seedOtherStore(prisma);

    await expect(
      service.createAndCommit(SLUG, {
        items: [{ variant_id: fx.variantId.toString(), quantity: 1 }],
        customer_name: 'Test Buyer',
        customer_phone: '01000000000',
        address_line: '1 Test Street',
        city: 'Cairo',
        payment_offering_id: other.offeringId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('listPaymentMethods', () => {
    it('returns enabled offerings on active accounts', async () => {
      const methods = await service.listPaymentMethods(SLUG);
      expect(methods).toHaveLength(1);
      expect(methods[0].method).toBe('cod');
      expect(methods[0].commitment_kind).toBe('promise_accepted');
    });

    it('hides a disabled offering', async () => {
      await prisma.paymentMethodOffering.update({
        where: { id: fx.offeringId },
        data: { enabled: false },
      });
      expect(await service.listPaymentMethods(SLUG)).toHaveLength(0);
    });

    it('hides offerings on a disabled account', async () => {
      await prisma.paymentAccount.updateMany({
        where: { store_id: fx.storeId },
        data: { status: 'disabled' },
      });
      expect(await service.listPaymentMethods(SLUG)).toHaveLength(0);
    });

    it("does not leak another store's methods", async () => {
      await seedOtherStore(prisma);
      const methods = await service.listPaymentMethods(SLUG);
      expect(methods).toHaveLength(1);
    });
  });

  it('does not expose another store checkout by token', async () => {
    const other = await seedOtherStore(prisma);

    const checkout = await prisma.checkout.create({
      data: {
        store_id: other.storeId,
        mode: 'live',
        token: 'other-store-token',
        status: 'pending_payment',
        customer_name: 'Other Customer',
        customer_phone: '01000000000',
        shipping_address: {
          address_line: 'Other Address',
          city: 'Cairo',
          notes: null,
        },
        currency: 'USD',
        quote_total_minor: 2500n,
        selected_offering_id: other.offeringId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await expect(
      service.getCheckoutStatus(SLUG, checkout.token),
    ).rejects.toThrow('Checkout not found.');

    await expect(
      service.syncCheckoutStatus(SLUG, checkout.token),
    ).rejects.toThrow('Checkout not found.');
  });
});

/* ------------------------------------------------------------------ */

async function seedStore(
  prisma: PrismaClient,
  slug: string,
  suffix: string,
): Promise<Fixture> {
  const user = await prisma.users.create({
    data: {
      username: `spec_${suffix}`,
      email: `spec_${suffix}@example.test`,
      password: 'x',
      updated_at: new Date(),
    },
    select: { id: true },
  });

  const store = await prisma.store.create({
    data: {
      name: `Spec ${suffix}`,
      slug,
      currency: 'USD',
      ownerId: user.id,
      updatedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.$executeRaw`
    SELECT set_config('app.store_id', ${store.id.toString()}, false)
  `;

  const product = await prisma.product.create({
    data: {
      store_id: store.id,
      title: 'Spec Product',
      handle: `spec-product-${suffix}`,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const variant = await prisma.productVariant.create({
    data: {
      product_id: product.id,
      title: 'Default Title',
      price: '25.00',
      inventory_qty: 10,
      track_inventory: true,
      continue_selling: false,
    },
    select: { id: true },
  });

  const account = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT
        set_config('app.store_id', ${store.id.toString()}, true),
        set_config('app.mode', 'live', true)
    `;

    return tx.paymentAccount.create({
      data: {
        store_id: store.id,
        mode: 'live',
        gateway: 'cod',
        display_name: 'Default',
        status: 'active',
        settlement_currency: 'USD',
      },
      select: { id: true },
    });
  });

  const offering = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT
        set_config('app.store_id', ${store.id.toString()}, true),
        set_config('app.mode', 'live', true)
    `;

    return tx.paymentMethodOffering.create({
      data: {
        account_id: account.id,
        store_id: store.id,
        mode: 'live',
        method: 'cod',
        enabled: true,
        position: 0,
        commitment_kind: 'promise_accepted',
        capture_mode: 'automatic',
      },
      select: { id: true },
    });
  });

  return {
    storeId: store.id,
    variantId: variant.id,
    offeringId: offering.id,
  };
}

const seed = (prisma: PrismaClient) => seedStore(prisma, SLUG, 'main');
const seedOtherStore = (prisma: PrismaClient) =>
  seedStore(prisma, 'other-store', 'other');
