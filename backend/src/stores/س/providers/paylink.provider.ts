import { Injectable, BadRequestException } from '@nestjs/common'

interface PaylinkCredentials {
  api_id: string
  secret_key: string
}

// ✅ مؤكدين من docs.paylink.sa الرسمية
const PAYLINK_PROD = 'https://restapi.paylink.sa'
const PAYLINK_TEST = 'https://restpilot.paylink.sa'

interface CreateInvoiceInput {
  amount: number
  merchantOrderId: string
  customer: { name: string; phone: string }
  callBackUrl: string
  isTestMode: boolean
}

@Injectable()
export class PaylinkProvider {
  private baseUrl(isTestMode: boolean) {
    return isTestMode ? PAYLINK_TEST : PAYLINK_PROD
  }

  private async authenticate(credentials: PaylinkCredentials, isTestMode: boolean): Promise<string> {
    const res = await fetch(`${this.baseUrl(isTestMode)}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId: credentials.api_id, secretKey: credentials.secret_key, persistToken: false }),
    })
    const data = await res.json()
    if (!res.ok || !data.id_token) {
      throw new BadRequestException('فشل تسجيل الدخول عند Paylink — تأكد من API ID / Secret Key')
    }
    return data.id_token
  }

  async createInvoice(credentials: PaylinkCredentials, input: CreateInvoiceInput): Promise<string> {
    const token = await this.authenticate(credentials, input.isTestMode)
    const res = await fetch(`${this.baseUrl(input.isTestMode)}/api/addInvoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amount: input.amount,
        callBackUrl: input.callBackUrl,
        clientMobile: input.customer.phone,
        clientName: input.customer.name,
        orderNumber: input.merchantOrderId,
        currency: 'SAR',
        products: [{ title: `Order ${input.merchantOrderId}`, price: input.amount, qty: 1 }],
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.url) {
      throw new BadRequestException(data?.message || 'فشل إنشاء فاتورة الدفع عند Paylink')
    }
    return data.url
  }

  /** بنجيب الفاتورة فعلياً من Paylink — مبنثقش فى بيانات الـ query الراجعة فى الـ redirect */
  async getInvoiceByTransactionNo(
    credentials: PaylinkCredentials,
    transactionNo: string,
    isTestMode: boolean,
  ): Promise<{ paid: boolean; merchantOrderId: string }> {
    const token = await this.authenticate(credentials, isTestMode)
    const res = await fetch(`${this.baseUrl(isTestMode)}/api/getInvoice/${transactionNo}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new BadRequestException('فشل التحقق من حالة الفاتورة عند Paylink')
    return { paid: data?.orderStatus === 'Paid', merchantOrderId: data?.orderNumber }
  }
}