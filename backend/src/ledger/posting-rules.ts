import type { LedgerAccountType, PostingDirection } from '@prisma/client'
import { LedgerError, PostingInput } from './ledger.types'

/**
 * قواعد الترحيل: حدث تجاري ← أطراف القيد.
 *
 * كل دالة هنا بترجّع أطراف متوازنة (مجموع المدين = مجموع الدائن).
 * الخدمة بتتحقق من التوازن تاني قبل الكتابة — الفحص المزدوج مقصود،
 * لأن قيد غير متوازن معناه دفتر مكسور بأثر رجعي.
 */

const debit = (
  accountType: LedgerAccountType,
  amountMinor: bigint,
  extra: Partial<PostingInput> = {},
): PostingInput => ({
  accountType,
  direction: 'debit' as PostingDirection,
  amountMinor,
  ...extra,
})

const credit = (
  accountType: LedgerAccountType,
  amountMinor: bigint,
  extra: Partial<PostingInput> = {},
): PostingInput => ({
  accountType,
  direction: 'credit' as PostingDirection,
  amountMinor,
  ...extra,
})

export interface AllocationLine {
  readonly beneficiaryId: bigint
  readonly amountMinor: bigint
}

function assertPositive(amountMinor: bigint, label: string): void {
  if (amountMinor <= 0n) {
    throw new LedgerError(`${label} لازم يكون أكبر من صفر (استلمنا: ${amountMinor}).`)
  }
}

function assertAllocationsMatch(
  allocations: readonly AllocationLine[],
  total: bigint,
): void {
  if (allocations.length === 0) {
    throw new LedgerError('لازم مستفيد واحد على الأقل.')
  }

  const sum = allocations.reduce((acc, a) => acc + a.amountMinor, 0n)

  if (sum !== total) {
    throw new LedgerError(
      `مجموع توزيع المستفيدين (${sum}) مش مساوي للمبلغ (${total}).`,
    )
  }
}

/**
 * تحصيل نجح عبر بوابة.
 *
 *   مدين  psp_receivable        بالمبلغ كله
 *   دائن  sales_revenue         لكل مستفيد بحصته
 */
export function captureSucceeded(input: {
  totalMinor: bigint
  paymentAccountId: bigint
  allocations: readonly AllocationLine[]
}): PostingInput[] {
  assertPositive(input.totalMinor, 'مبلغ التحصيل')
  assertAllocationsMatch(input.allocations, input.totalMinor)

  return [
    debit('psp_receivable', input.totalMinor, {
      paymentAccountId: input.paymentAccountId,
    }),
    ...input.allocations.map((a) =>
      credit('sales_revenue', a.amountMinor, { beneficiaryId: a.beneficiaryId }),
    ),
  ]
}

/**
 * التزام بوسيلة غير ممولة (الدفع عند الاستلام / تحويل بنكي / فوري).
 *
 * الإيراد بيتسجّل وقت الالتزام، ومقابله ذمة مدينة لحد ما الفلوس تتحصّل.
 *
 *   مدين  offline_receivable
 *   دائن  sales_revenue
 */
export function offlineCommitment(input: {
  totalMinor: bigint
  allocations: readonly AllocationLine[]
}): PostingInput[] {
  assertPositive(input.totalMinor, 'مبلغ الالتزام')
  assertAllocationsMatch(input.allocations, input.totalMinor)

  return [
    debit('offline_receivable', input.totalMinor),
    ...input.allocations.map((a) =>
      credit('sales_revenue', a.amountMinor, { beneficiaryId: a.beneficiaryId }),
    ),
  ]
}

/**
 * تحصيل الفلوس غير الممولة فعلاً (المندوب رجّع الكاش / التحويل وصل).
 *
 *   مدين  cash_collected
 *   دائن  offline_receivable
 */
export function offlineCollected(input: { totalMinor: bigint }): PostingInput[] {
  assertPositive(input.totalMinor, 'المبلغ المُحصَّل')

  return [
    debit('cash_collected', input.totalMinor),
    credit('offline_receivable', input.totalMinor),
  ]
}

/**
 * عمولة المنصة.
 *
 * ⚠️ التاجر هو Merchant of Record، فالمنصة **مابتحتفظش** بالفلوس.
 * العمولة ذمة مستحقة عليه، مش أموال في عهدة المنصة.
 *
 *   مدين  platform_fee_expense   (على التاجر)
 *   دائن  platform_fee_payable   (للمنصة)
 */
export function platformFee(input: {
  amountMinor: bigint
  platformBeneficiaryId: bigint
}): PostingInput[] {
  assertPositive(input.amountMinor, 'عمولة المنصة')

  return [
    debit('platform_fee_expense', input.amountMinor),
    credit('platform_fee_payable', input.amountMinor, {
      beneficiaryId: input.platformBeneficiaryId,
    }),
  ]
}

/**
 * رسوم البوابة المقدّرة وقت التحصيل.
 *
 * الرسوم الفعلية بتوصل مع تقرير التسوية بعدين، وبتتصلّح بقيد عكسي
 * مش بتحديث — عشان الدفتر يفضل غير قابل للتعديل.
 *
 *   مدين  psp_fee_expense
 *   دائن  psp_receivable
 */
export function pspFeeEstimated(input: {
  amountMinor: bigint
  paymentAccountId: bigint
}): PostingInput[] {
  assertPositive(input.amountMinor, 'رسوم البوابة')

  return [
    debit('psp_fee_expense', input.amountMinor),
    credit('psp_receivable', input.amountMinor, {
      paymentAccountId: input.paymentAccountId,
    }),
  ]
}