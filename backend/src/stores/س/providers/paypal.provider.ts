import { Injectable, BadRequestException } from '@nestjs/common'

interface PayPalCredentials {
  client_id: string
  client_secret: string
}

interface CreateOrderInput {
  amount: number
  currency: string
  merchantOrderId: string
  returnUrl: string
  cancelUrl: string
}

interface CreateOrderResult {
  approveUrl: string
  paypalOrderId: string
}

@Injectable()
export class PaypalProvider {
  // ⚠️ لازم تتغيّر لـ https://api-m.paypal.com فى وضع الإنتاج (Live)
  private baseUrl(isTestMode: boolean) {
    return isTestMode ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  }

  private async getAccessToken(credentials: PayPalCredentials, isTestMode: boolean): Promise<string> {
    const basic = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64')
    const res = await fetch(`${this.baseUrl(isTestMode)}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      throw new BadRequestException(data?.error_description || 'فشل توثيق PayPal')
    }
    return data.access_token
  }

  /** بينشئ Order عند PayPal ويرجّع رابط الموافقة اللي العميل يتحول عليه */
  async createOrder(
    credentials: PayPalCredentials,
    isTestMode: boolean,
    input: CreateOrderInput,
  ): Promise<CreateOrderResult> {
    const token = await this.getAccessToken(credentials, isTestMode)

    const res = await fetch(`${this.baseUrl(isTestMode)}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: input.merchantOrderId,
            amount: { currency_code: input.currency, value: input.amount.toFixed(2) },
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    })
    const data = await res.json()
    console.log('Create Order');
console.log(JSON.stringify(data, null, 2));

if (!res.ok) {
  throw new BadRequestException(data);
}

    const approveLink = data.links?.find((l: any) => l.rel === 'approve')?.href
    if (!approveLink) throw new BadRequestException('لم يتم استلام رابط الموافقة من PayPal')

    return { approveUrl: approveLink, paypalOrderId: data.id }
  }

  /**
   * بتاخد الفلوس فعلياً بعد ما العميل يوافق ويرجع لموقعنا (return_url).
   * ⚠️ ده الخطوة اللي فعلياً بتأكد الدفع — الرجوع لوحده لموقعنا مش كافي،
   * لازم نستدعي الـ API ده وناخد رد من PayPal نفسها (authoritative).
   */
async captureOrder(
  credentials: PayPalCredentials,
  isTestMode: boolean,
  paypalOrderId: string,
): Promise<{ success: boolean; merchantOrderId: string | null }> {
  const token = await this.getAccessToken(credentials, isTestMode);

  // ===========================
  // جلب تفاصيل الطلب قبل Capture
  // ===========================
  const detailsRes = await fetch(
    `${this.baseUrl(isTestMode)}/v2/checkout/orders/${paypalOrderId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const details = await detailsRes.json();

  console.log('================ ORDER DETAILS ================');
  console.log('HTTP Status:', detailsRes.status);
  console.log(JSON.stringify(details, null, 2));
  console.log('===============================================');

  // ===========================
  // تنفيذ Capture
  // ===========================
  const res = await fetch(
    `${this.baseUrl(isTestMode)}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const data = await res.json();

  console.log('================ CAPTURE RESPONSE ================');
  console.log('HTTP Status:', res.status);
  console.log(JSON.stringify(data, null, 2));
  console.log('==================================================');

  if (!res.ok) {
    throw new BadRequestException(JSON.stringify(data));
  }

  const success = data.status === 'COMPLETED';

  const merchantOrderId =
    data.purchase_units?.[0]?.custom_id ??
    data.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id ??
    null;

  return {
    success,
    merchantOrderId,
  };
}
}