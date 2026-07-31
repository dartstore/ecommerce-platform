import { Injectable, BadRequestException } from '@nestjs/common'

interface TapCredentials {
  secret_key: string
  publishable_key: string
}

interface ChargeInput {
  amount: number
  currency: string
  merchantOrderId: string
  customer: { name: string; phone: string; email?: string }
  webhookUrl: string
  redirectUrl: string
}

@Injectable()
export class TapProvider {
  async createPayment(credentials: TapCredentials, input: ChargeInput): Promise<string> {
    const [firstName, ...rest] = input.customer.name.trim().split(' ')
    const res = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.secret_key}` },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        customer_initiated: true,
        threeDSecure: true,
        description: `Order ${input.merchantOrderId}`,
        reference: { order: input.merchantOrderId },
        customer: {
          first_name: firstName || 'Customer',
          last_name: rest.join(' ') || 'Customer',
          email: input.customer.email || 'no-email@example.com',
          phone: { country_code: '966', number: input.customer.phone.replace(/^\+?966/, '') },
        },
        source: { id: 'src_all' },
        post: { url: input.webhookUrl },
        redirect: { url: input.redirectUrl },
      }),
    })
    const data = await res.json()
    if (!res.ok || !data?.transaction?.url) {
      throw new BadRequestException(data?.message || 'فشل إنشاء عملية الدفع عند Tap')
    }
    return data.transaction.url
  }

  /** بنجيب الـ charge نفسه من Tap عشان نتأكد من حالته الحقيقية */
  async getCharge(credentials: TapCredentials, chargeId: string): Promise<{ paid: boolean; merchantOrderId: string }> {
    const res = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
      headers: { Authorization: `Bearer ${credentials.secret_key}` },
    })
    const data = await res.json()
    if (!res.ok) throw new BadRequestException('فشل التحقق من حالة العملية عند Tap')
    return { paid: data.status === 'CAPTURED', merchantOrderId: data?.reference?.order }
  }
}