import { Injectable, BadRequestException } from '@nestjs/common'
import Stripe from 'stripe'

interface StripeCredentials {
  publishable_key: string
  secret_key: string
  webhook_secret?: string
}

interface CreateSessionInput {
  amount: number // بالوحدة الأساسية (جنيه/دولار) مش بالقروش
  currency: string
  merchantOrderId: string
  successUrl: string
  cancelUrl: string
  items: { title: string; price: number; qty: number }[]
}

@Injectable()
export class StripeProvider {
  private client(credentials: StripeCredentials): Stripe {
    return new Stripe(credentials.secret_key, {
      apiVersion: '2026-06-24.dahlia',
    })
  }

  /** بيبني Checkout Session ويرجّع الرابط اللي العميل يتحول عليه */
  async createCheckoutSession(credentials: StripeCredentials, input: CreateSessionInput): Promise<string> {
    const stripe = this.client(credentials)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: input.items.map((i) => ({
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: { name: i.title },
          unit_amount: Math.round(i.price * 100),
        },
        quantity: i.qty,
      })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.merchantOrderId,
      metadata: { merchant_order_id: input.merchantOrderId },
    })

    if (!session.url) throw new BadRequestException('فشل إنشاء جلسة الدفع عند Stripe')
    return session.url
  }

  /**
   * تحقق من توقيع الـ webhook — لازم الـ raw body الخام (مش الـ JSON المتحلّل)
   * وإلا التحقق هيفشل دايماً حتى لو كل حاجة تانية صح. راجع main.ts وتأكد إن
   * rawBody: true مفعّلة، وإن الـ controller بيستخدم req.rawBody مش @Body().
   */
  constructWebhookEvent(rawBody: Buffer, signatureHeader: string, credentials: StripeCredentials): Stripe.Event {
    if (!credentials.webhook_secret) {
      throw new BadRequestException('Webhook secret غير مسجّل لبوابة Stripe')
    }
    const stripe = this.client(credentials)
    // بترمي exception لوحدها لو التوقيع غلط — مفيش داعي نتحقق يدوي
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, credentials.webhook_secret)
  }
}