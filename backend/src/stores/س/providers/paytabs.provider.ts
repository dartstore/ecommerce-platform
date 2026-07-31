import { Injectable, BadRequestException } from '@nestjs/common'

interface PayTabsCredentials {
  profile_id: string
  server_key: string
  client_key: string
  region: 'EGY' | 'SAU' | 'ARE' | 'GLOBAL'
}

interface ChargeInput {
  amount: number
  currency: string
  merchantOrderId: string
  customer: { name: string; phone: string; email?: string; address: string; city: string }
  webhookUrl: string
  redirectUrl: string
}

const REGION_HOSTS: Record<string, string> = {
  EGY: 'https://secure-egypt.paytabs.com',
  SAU: 'https://secure.paytabs.sa',
  ARE: 'https://secure.paytabs.com',
  GLOBAL: 'https://secure-global.paytabs.com',
}
const REGION_COUNTRY: Record<string, string> = { EGY: 'EG', SAU: 'SA', ARE: 'AE', GLOBAL: 'SA' }

@Injectable()
export class PayTabsProvider {
  async createPayment(credentials: PayTabsCredentials, input: ChargeInput): Promise<string> {
    const host = REGION_HOSTS[credentials.region] || REGION_HOSTS.GLOBAL
    const res = await fetch(`${host}/payment/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: credentials.server_key },
      body: JSON.stringify({
        profile_id: Number(credentials.profile_id),
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_id: input.merchantOrderId,
        cart_currency: input.currency,
        cart_amount: input.amount,
        cart_description: `Order ${input.merchantOrderId}`,
        paypage_lang: 'en',
        customer_details: {
          name: input.customer.name,
          email: input.customer.email || 'no-email@example.com',
          phone: input.customer.phone,
          street1: input.customer.address,
          city: input.customer.city,
          country: REGION_COUNTRY[credentials.region] || 'SA',
          zip: '00000',
        },
        hide_shipping: true,
        callback: input.webhookUrl,
        return: input.redirectUrl,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.redirect_url) {
      throw new BadRequestException(data?.message || 'فشل إنشاء رابط الدفع عند PayTabs')
    }
    return data.redirect_url
  }

  /** بنستعلم عن الترانزاكشن من PayTabs نفسها — مش بنثق في بيانات الـ webhook مباشرة */
  async queryTransaction(
    credentials: PayTabsCredentials,
    tranRef: string,
  ): Promise<{ paid: boolean; cartId: string }> {
    const host = REGION_HOSTS[credentials.region] || REGION_HOSTS.GLOBAL
    const res = await fetch(`${host}/payment/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: credentials.server_key },
      body: JSON.stringify({ profile_id: Number(credentials.profile_id), tran_ref: tranRef }),
    })
    const data = await res.json()
    if (!res.ok) throw new BadRequestException('فشل التحقق من حالة الدفع عند PayTabs')
    return { paid: data?.payment_result?.response_status === 'A', cartId: data?.cart_id }
  }
}