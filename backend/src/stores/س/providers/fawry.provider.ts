import { Injectable, BadRequestException } from '@nestjs/common'
import * as crypto from 'crypto'

interface FawryCredentials {
  merchant_code: string
  security_key: string
}

interface ChargeItemInput {
  itemId: string
  quantity: number
  price: number // بالجنيه، مش بالقروش
}

interface CreateReferenceInput {
  merchantRefNum: string // نفس merchantOrderId المستخدم فى باقي البوابات
  amount: number
  customerName: string
  customerMobile: string
  customerEmail?: string
  items: ChargeItemInput[]
  isTestMode: boolean
}

const FAWRY_TEST_BASE = 'https://atfawry.fawrystaging.com'
const FAWRY_LIVE_BASE = 'https://atfawry.fawrypay.com'

@Injectable()
export class FawryProvider {
  /**
   * ⚠️ فوري هنا شغّالة بنظام "الرقم المرجعي" (PayAtFawry) مش بوابة كارت مباشرة:
   * بننشئ طلب دفع عند فوري وبيرجّعلنا رقم مرجعي (referenceNumber)، والعميل يروح
   * يدفعه نقدي فى أي منفذ فوري (أو من خلال تطبيق فوري). ده أكثر أمان وأبسط
   * تكامل من إدخال بيانات كارت مباشرة على السيرفر (مش PCI-compliant لو عملناها
   * كده). يعني الطلب بيفضل UNPAID لحد ما فوري تبعتلنا webhook إنه اتدفع فعلاً —
   * تماماً زي تحويل بنكي، لكن بتأكيد أوتوماتيكي بدل تأكيد التاجر يدوياً.
   */
  async createPaymentReference(
    credentials: FawryCredentials,
    input: CreateReferenceInput,
  ): Promise<{ referenceNumber: string; fawryOrderId: string }> {
    const base = input.isTestMode ? FAWRY_TEST_BASE : FAWRY_LIVE_BASE
    const amountStr = input.amount.toFixed(2)

    const signature = this.generateChargeSignature(
      credentials.merchant_code,
      input.merchantRefNum,
      '', // customerProfileId — مش مستخدمينها
      input.items,
      credentials.security_key,
    )

    const res = await fetch(`${base}/ECommerceWeb/Fawry/payments/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantCode: credentials.merchant_code,
        merchantRefNum: input.merchantRefNum,
        customerName: input.customerName,
        customerMobile: input.customerMobile,
        customerEmail: input.customerEmail || undefined,
        amount: amountStr,
        currencyCode: 'EGP',
        language: 'ar-eg',
        chargeItems: input.items.map((i) => ({
          itemId: i.itemId,
          description: i.itemId,
          price: i.price.toFixed(2),
          quantity: i.quantity,
        })),
        paymentMethod: 'PayAtFawry',
        description: `Order ${input.merchantRefNum}`,
        signature,
      }),
    })

    const data = await res.json()
    if (!res.ok || !data.referenceNumber) {
      throw new BadRequestException(data?.statusDescription || 'فشل إنشاء رقم الدفع عند فوري')
    }

    return { referenceNumber: String(data.referenceNumber), fawryOrderId: String(data.fawryRefNumber || data.referenceNumber) }
  }

  /**
   * توقيع SHA-256 لطلب الـ charge — موثّق رسمياً:
   * merchantCode + merchantRefNum + customerProfileId (فاضي لو مش موجود) +
   * (لكل عنصر مرتب بالـ itemId): itemId + quantity + price(خانتين عشريين) +
   * secureKey
   */
  private generateChargeSignature(
    merchantCode: string,
    merchantRefNum: string,
    customerProfileId: string,
    items: ChargeItemInput[],
    secureKey: string,
  ): string {
    const sortedItems = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId))
    let payload = merchantCode + merchantRefNum + customerProfileId
    for (const item of sortedItems) {
      payload += item.itemId + item.quantity + item.price.toFixed(2)
    }
    payload += secureKey
    return crypto.createHash('sha256').update(payload).digest('hex')
  }

  /**
   * توقيع إشعار الـ webhook — موثّق رسمياً:
   * merchantRefNum + merchantCode + paymentAmount + fawryRefNumber +
   * (orderStatus لو موجودة) + orderAmount + secureKey
   * ⚠️ لو Fawry غيّروا الحقول المرسلة فى نسخة الـ webhook الحالية، اتأكد من
   * ترتيب الحقول من لوحة تحكم فوري بتاعتك (Developer Portal → Webhooks).
   */
  verifyWebhookSignature(payload: Record<string, any>, secureKey: string): boolean {
    const { signature, ...rest } = payload
    if (!signature) return false
    const concatenated =
      String(rest.merchantRefNumber ?? rest.merchantRefNum ?? '') +
      String(rest.merchantCode ?? '') +
      String(rest.paymentAmount ?? rest.amount ?? '') +
      String(rest.fawryRefNumber ?? rest.referenceNumber ?? '') +
      String(rest.orderStatus ?? '') +
      String(rest.orderAmount ?? rest.amount ?? '') +
      secureKey
    const computed = crypto.createHash('sha256').update(concatenated).digest('hex')
    return computed === signature
  }
}