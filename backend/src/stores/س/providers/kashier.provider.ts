import { Injectable } from '@nestjs/common'
import * as crypto from 'crypto'

interface KashierCredentials {
  merchant_id: string
  api_key: string
  secret_key: string
}

interface CreatePaymentInput {
  amount: number // بالجنيه (أو العملة الأساسية) مش بالقروش
  currency: string
  merchantOrderId: string // بنفس صيغة Paymob: `${storeId}_${orderNumber}`
  redirectUrl: string // صفحة تأكيد الطلب عندنا — العميل يرجعله بعد الدفع
  isTestMode: boolean
}

const KASHIER_TEST_BASE = 'https://test-iframe.kashier.io'
const KASHIER_LIVE_BASE = 'https://iframe.kashier.io'

@Injectable()
export class KashierProvider {
  /** بيبني رابط الـ Hosted Payment Page عند Kashier — العميل بيتحول عليه مباشرة */
  createPayment(credentials: KashierCredentials, input: CreatePaymentInput): string {
    const base = input.isTestMode ? KASHIER_TEST_BASE : KASHIER_LIVE_BASE
    // المبلغ لازم يبقى بنفس الصيغة (خانتين عشريين) فى الرابط وفى حساب الـ hash، وإلا التوقيع مش هيتطابق
    const amountStr = input.amount.toFixed(2)

    // ⚠️ Kashier بتسمّيه فى التوثيق "Secret" بس هو فعلياً الـ API Key المولّد
    // مخصوص لخدمة Hosted Payment Page من الداشبورد — مش حقل "Secret Key" العادي
    const hash = this.generateOrderHash(
      credentials.merchant_id,
      input.merchantOrderId,
      amountStr,
      input.currency,
      credentials.api_key,
    )

    const params = new URLSearchParams({
      mid: credentials.merchant_id,
      orderId: input.merchantOrderId,
      amount: amountStr,
      currency: input.currency,
      hash,
      merchantRedirect: input.redirectUrl,
      display: 'ar',
    })

    return `${base}/payment?${params.toString()}`
  }

  /**
   * HMAC-SHA256 لـ /?payment=mid.orderId.amount.currency بالـ Secret Key.
   * موثّقة رسمياً من Kashier (Integration Guide → Create order hash).
   */
  private generateOrderHash(
    mid: string,
    orderId: string,
    amount: string,
    currency: string,
    secretKey: string,
  ): string {
    const path = `/?payment=${mid}.${orderId}.${amount}.${currency}`
    return crypto.createHmac('sha256', secretKey).update(path).digest('hex')
  }

  /**
   * تحقق من توقيع الرجوع (merchantRedirect) أو الـ webhook من Kashier.
   *
   * ⚠️ مهم: خوارزمية توقيع الـ webhook مش موثّقة بالتفصيل فى الصفحة العامة
   * (اللي موثّق رسمياً هو حساب الـ hash بتاع الطلب بس، مش التحقق من الرد).
   * التنفيذ ده مبني على نفس نمط HMAC اللي بيستخدموه فى باقي الـ endpoints،
   * لكن **لازم تتأكد منه فعلياً** قبل ما تعتمد عليه فى الإنتاج:
   * ادخل Kashier Sandbox، اعمل عملية تجريبية، واطبع الـ payload اللي بييجي
   * على الـ webhook/redirect عشان تتأكد إن الحقول والترتيب مطابقين لللي هنا،
   * أو كلم techsupport@kashier.io يأكدولك الصيغة الرسمية.
   */
  verifySignature(query: Record<string, string>, secretKey: string): boolean {
    const { signature, mode, ...rest } = query as Record<string, string>
    if (!signature) return false
    const path =
      '/?' +
      Object.keys(rest)
        .sort()
        .map((k) => `${k}=${rest[k]}`)
        .join('&')
    const computed = crypto.createHmac('sha256', secretKey).update(path).digest('hex')
    return computed === signature
  }
}