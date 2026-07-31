import { Injectable, BadRequestException } from '@nestjs/common'

interface MoyasarCredentials {
  publishable_key: string
  secret_key: string
}

interface ChargeInput {
  amount: number
  currency: string
  merchantOrderId: string
  webhookUrl: string
  redirectUrl: string
}

@Injectable()
export class MoyasarProvider {
  private authHeader(secretKey: string) {
    return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64')
  }

  async createPayment(credentials: MoyasarCredentials, input: ChargeInput): Promise<string> {
    const res = await fetch('https://api.moyasar.com/v1/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader(credentials.secret_key) },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100), // بالهللة
        currency: input.currency,
        description: `Order ${input.merchantOrderId}`,
        callback_url: input.webhookUrl,
        success_url: input.redirectUrl,
        back_url: input.redirectUrl,
        metadata: { merchant_order_id: input.merchantOrderId },
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.url) {
      throw new BadRequestException(data?.message || 'فشل إنشاء فاتورة الدفع عند Moyasar')
    }
    return data.url
  }

  /** بنجيب الفاتورة نفسها من Moyasar عشان نتأكد من حالتها الحقيقية */
  async getInvoice(
    credentials: MoyasarCredentials,
    invoiceId: string,
  ): Promise<{ paid: boolean; merchantOrderId: string }> {
    const res = await fetch(`https://api.moyasar.com/v1/invoices/${invoiceId}`, {
      headers: { Authorization: this.authHeader(credentials.secret_key) },
    })
    const data = await res.json()
    if (!res.ok) throw new BadRequestException('فشل التحقق من حالة الفاتورة عند Moyasar')
    return { paid: data.status === 'paid', merchantOrderId: data?.metadata?.merchant_order_id }
  }
}