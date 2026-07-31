import { Injectable, BadRequestException } from '@nestjs/common'
import * as crypto from 'crypto'

interface PaymobCredentials {
  api_key: string
  integration_id: string
  iframe_id?: string
  hmac_secret: string
}

interface CreatePaymentInput {
  amountCents: number
  currency: string
  merchantOrderId: string // بنبعتها لـ Paymob وبترجعلنا في الـ webhook عشان نلاقي الأوردر بتاعنا
  customer: {
    name: string
    phone: string
    email?: string
    address: string
    city: string
  }
  items: { name: string; amount_cents: number; quantity: number }[]
}

const PAYMOB_BASE = 'https://accept.paymob.com'

@Injectable()
export class PaymobProvider {
  /** الخطوة 1: authentication token مؤقت */
  private async authenticate(apiKey: string): Promise<string> {
    const res = await fetch(`${PAYMOB_BASE}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    })
    const data = await res.json()
    if (!res.ok || !data.token) {
      console.error('❌ Paymob payment_keys error:', JSON.stringify(data, null, 2))
      throw new BadRequestException(data?.detail || 'فشل إنشاء مفتاح الدفع عند Paymob')
    }
    return data.token
  }

  /** الخطوة 2: تسجيل الطلب عند Paymob */
  private async registerOrder(authToken: string, input: CreatePaymentInput): Promise<number> {
    const res = await fetch(`${PAYMOB_BASE}/api/ecommerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: input.amountCents,
        currency: input.currency,
        merchant_order_id: input.merchantOrderId,
        items: input.items,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.id) {
      console.error('❌ Paymob order register error:', JSON.stringify(data, null, 2))
      throw new BadRequestException(data?.message || 'فشل تسجيل الطلب عند Paymob')
    }
    return data.id
  }

  /** الخطوة 3: payment key عشان نفتح صفحة الدفع */
  private async requestPaymentKey(
    authToken: string,
    paymobOrderId: number,
    integrationId: string,
    input: CreatePaymentInput,
  ): Promise<string> {
    const [firstName, ...rest] = input.customer.name.trim().split(' ')
    const res = await fetch(`${PAYMOB_BASE}/api/acceptance/payment_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: input.amountCents,
        expiration: 3600,
        order_id: paymobOrderId,
        currency: input.currency,
        integration_id: Number(integrationId),
        billing_data: {
          first_name: firstName || 'Customer',
          last_name: rest.join(' ') || 'Customer',
          phone_number: input.customer.phone,
          email: input.customer.email || 'no-email@example.com',
          street: input.customer.address,
          city: input.customer.city,
          country: 'EG',
          state: input.customer.city,
          apartment: 'NA',
          floor: 'NA',
          building: 'NA',
          postal_code: 'NA',
        },
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.token) {
      throw new BadRequestException(data?.detail || 'فشل إنشاء مفتاح الدفع عند Paymob')
    }
    return data.token
  }

  /** بيرجع رابط iframe جاهز — العميل بيتحول عليه فعلياً عشان يدفع */
  async createPayment(credentials: PaymobCredentials, input: CreatePaymentInput): Promise<string> {
    if (!credentials.iframe_id) {
      throw new BadRequestException('لازم تضيف Iframe ID في إعدادات Paymob الأول')
    }
    const authToken = await this.authenticate(credentials.api_key)
    const paymobOrderId = await this.registerOrder(authToken, input)
    const paymentToken = await this.requestPaymentKey(
      authToken, paymobOrderId, credentials.integration_id, input,
    )
    return `${PAYMOB_BASE}/api/acceptance/iframes/${credentials.iframe_id}?payment_token=${paymentToken}`
  }

  /**
   * تحقق حقيقي من الـ webhook: Paymob بترتب مجموعة حقول ثابتة بترتيب معين
   * وتعمل HMAC-SHA512 بيها بالـ hmac_secret بتاعك. لو مطابقش، الطلب مزوّر.
   */
  verifyWebhookHmac(obj: Record<string, any>, receivedHmac: string, hmacSecret: string): boolean {
    const orderedKeys = [
      'amount_cents', 'created_at', 'currency', 'error_occured',
      'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
      'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
      'is_voided', 'order.id', 'owner', 'pending',
      'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
    ]
    const getVal = (path: string) => {
      let val: any = obj
      for (const p of path.split('.')) val = val?.[p]
      return val === undefined || val === null ? '' : String(val)
    }
    const concatenated = orderedKeys.map(getVal).join('')
    const computed = crypto.createHmac('sha512', hmacSecret).update(concatenated).digest('hex')
    return computed === receivedHmac
  }
}