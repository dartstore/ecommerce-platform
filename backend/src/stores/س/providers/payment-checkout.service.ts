import { Injectable, BadRequestException } from '@nestjs/common'
import { PaymentSettingsService } from '../payment-settings.service'
import { PaymobProvider } from '../providers/paymob.provider'
import { KashierProvider } from '../providers/kashier.provider'
import { StripeProvider } from '../providers/stripe.provider'
import { PaypalProvider } from '../providers/paypal.provider'
import { FawryProvider } from '../providers/fawry.provider'
import { PayTabsProvider } from '../providers/paytabs.provider'
import { MoyasarProvider } from '../providers/moyasar.provider'
import { PaylinkProvider } from '../providers/paylink.provider'
import { TapProvider } from '../providers/tap.provider'
import { getProviderDef } from '../payment-providers.registry'

interface ChargeInput {
  storeId: bigint
  storeSlug: string
  orderNumber: string
  amount: number
  currency: string
  customer: { name: string; phone: string; email?: string; address: string; city: string }
  items: { title: string; price: number; qty: number }[]
}

interface ChargeResult {
  requiresRedirect: boolean
  redirectUrl?: string
  referenceNumber?: string
}

const STOREFRONT_BASE_URL = process.env.STOREFRONT_BASE_URL || 'http://localhost:3000'
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:4000'

@Injectable()
export class PaymentCheckoutService {
  constructor(
    private paymentSettings: PaymentSettingsService,
    private paymob: PaymobProvider,
    private kashier: KashierProvider,
    private stripe: StripeProvider,
    private paypal: PaypalProvider,
    private fawry: FawryProvider,
    private paytabs: PayTabsProvider,       // 👈 جديد
    private moyasar: MoyasarProvider,       // 👈 جديد
    private paylink: PaylinkProvider,       // 👈 جديد
    private tap: TapProvider,               // 👈 جديد
  ) {}

  isOnlineProvider(providerKey: string): boolean {
    const def = getProviderDef(providerKey)
    return !!def?.requires_credentials
  }

  private successRedirectUrl(storeSlug: string, orderNumber: string) {
    return `${STOREFRONT_BASE_URL}/store/${storeSlug}/checkout/success?order=${orderNumber}`
  }

  async charge(providerKey: string, input: ChargeInput): Promise<ChargeResult> {
    const def = getProviderDef(providerKey)
    if (!def) throw new BadRequestException('بوابة دفع غير معروفة')

    if (!def.requires_credentials) {
      return { requiresRedirect: false }
    }

    const merchantOrderId = `${input.storeId}_${input.orderNumber}`

    switch (providerKey) {
      case 'paymob': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = await this.paymob.createPayment(credentials as any, {
          amountCents: Math.round(input.amount * 100),
          currency: input.currency,
          merchantOrderId,
          customer: input.customer,
          items: input.items.map((i) => ({
            name: i.title,
            amount_cents: Math.round(i.price * 100),
            quantity: i.qty,
          })),
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'kashier': {
        const config = await this.paymentSettings.getActiveProviderConfig(input.storeId, providerKey)
        if (!config?.credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = this.kashier.createPayment(config.credentials as any, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          redirectUrl: this.successRedirectUrl(input.storeSlug, input.orderNumber),
          isTestMode: config.isTestMode,
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'stripe': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = await this.stripe.createCheckoutSession(credentials as any, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          successUrl: this.successRedirectUrl(input.storeSlug, input.orderNumber),
          cancelUrl: `${STOREFRONT_BASE_URL}/store/${input.storeSlug}/checkout`,
          items: input.items,
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'paypal': {
        const config = await this.paymentSettings.getActiveProviderConfig(input.storeId, providerKey)
        if (!config?.credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        // returnUrl بيوصل لـ endpoint عندنا هو اللي بيعمل capture فعلي عند PayPal
        // (راجع payment-webhooks.controller.ts) — مش بيروح مباشرة لصفحة النجاح
        const returnUrl = `${BACKEND_BASE_URL}/api/webhooks/paypal/return?merchant_order_id=${merchantOrderId}&store_slug=${input.storeSlug}`
        const cancelUrl = `${STOREFRONT_BASE_URL}/store/${input.storeSlug}/checkout`
        const result = await this.paypal.createOrder(config.credentials as any, config.isTestMode, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          returnUrl,
          cancelUrl,
        })
        return { requiresRedirect: true, redirectUrl: result.approveUrl }
      }

      case 'fawry': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const config = await this.paymentSettings.getActiveProviderConfig(input.storeId, providerKey)
        const result = await this.fawry.createPaymentReference(credentials as any, {
          merchantRefNum: merchantOrderId,
          amount: input.amount,
          customerName: input.customer.name,
          customerMobile: input.customer.phone,
          customerEmail: input.customer.email,
          items: input.items.map((i, idx) => ({ itemId: `item_${idx + 1}`, quantity: i.qty, price: i.price })),
          isTestMode: config?.isTestMode ?? true,
        })
        // مفيش redirect هنا — العميل بياخد رقم مرجعي يدفعه فى أي منفذ فوري.
        // الفرونت لازم يعرض referenceNumber ده بدل ما يعمل location.href لرابط
        return { requiresRedirect: false, referenceNumber: result.referenceNumber }
      }

      // ══════════════ 👇 الإضافات الجديدة فقط ══════════════

      case 'paytabs': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = await this.paytabs.createPayment(credentials as any, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          customer: input.customer,
          webhookUrl: `${BACKEND_BASE_URL}/api/webhooks/paytabs`,
          redirectUrl: this.successRedirectUrl(input.storeSlug, input.orderNumber),
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'moyasar': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = await this.moyasar.createPayment(credentials as any, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          webhookUrl: `${BACKEND_BASE_URL}/api/webhooks/moyasar`,
          redirectUrl: this.successRedirectUrl(input.storeSlug, input.orderNumber),
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'paylink': {
        const config = await this.paymentSettings.getActiveProviderConfig(input.storeId, providerKey)
        if (!config?.credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        // زي PayPal بالظبط — الـ callback بترجع بيها المتصفح وبتعمل التأكيد الحقيقي مع بعض
        const callBackUrl = `${BACKEND_BASE_URL}/api/webhooks/paylink?merchant_order_id=${merchantOrderId}&store_slug=${input.storeSlug}`
        const url = await this.paylink.createInvoice(config.credentials as any, {
          amount: input.amount,
          merchantOrderId,
          customer: input.customer,
          callBackUrl,
          isTestMode: config.isTestMode,
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      case 'tap': {
        const credentials = await this.paymentSettings.getActiveProviderCredentials(input.storeId, providerKey)
        if (!credentials) {
          throw new BadRequestException(`بوابة ${def.name_ar} غير مفعّلة أو بياناتها غير مكتملة`)
        }
        const url = await this.tap.createPayment(credentials as any, {
          amount: input.amount,
          currency: input.currency,
          merchantOrderId,
          customer: input.customer,
          webhookUrl: `${BACKEND_BASE_URL}/api/webhooks/tap`,
          redirectUrl: this.successRedirectUrl(input.storeSlug, input.orderNumber),
        })
        return { requiresRedirect: true, redirectUrl: url }
      }

      // 👇 المتبقي: PayTabs ✅ Moyasar ✅ Paylink ✅ Tap ✅ خلصوا
      // اللي فاضل: Tabby, Taager, MyFatoorah, Fawaterk
      default:
        throw new BadRequestException(`بوابة ${def.name_ar} لسه مش متكاملة فعلياً (Coming soon)`)
    }
  }
}