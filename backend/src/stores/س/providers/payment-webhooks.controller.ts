import { Controller, Post, Get, Body, Query, Res, Req, Headers, HttpCode, NotFoundException, BadRequestException } from '@nestjs/common'
import type { Response, Request } from 'express'
import { PrismaService } from '../../../prisma/prisma.service'
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
import { OrderStatus, PaymentStatus } from '@prisma/client'

// رابط الفرونت اللي العميل يتحوّل عليه بعد ما يخلّص دفع
const STOREFRONT_BASE_URL = process.env.STOREFRONT_BASE_URL || 'http://localhost:3000'

@Controller('webhooks')
export class PaymentWebhooksController {
  constructor(
    private prisma: PrismaService,
    private paymentSettings: PaymentSettingsService,
    private paymob: PaymobProvider,
    private kashier: KashierProvider,
    private stripe: StripeProvider,
    private paypal: PaypalProvider,
    private fawry: FawryProvider,
    private paytabs: PayTabsProvider,
    private moyasar: MoyasarProvider,
    private paylink: PaylinkProvider,
    private tap: TapProvider,
  ) {}

  /**
   * ده مش الـ webhook الحقيقي (اللي بيأكد الدفع فعلياً موجود تحت فى POST paymob) —
   * ده بس محطة وسط لتحويل *متصفح* العميل. Paymob بترجّع العميل هنا حسب
   * "Redirect URL" المظبوطة فى الداشبورد، وبتضيف query params من ضمنها
   * merchant_order_id — بنفكها ونعرف المتجر والطلب، وبعدين نعمل 302 redirect
   * حقيقي لصفحة تأكيد الطلب بتاعت المتجر الصح.
   *
   * ⚠️ مفيش أي تحقق أمني هنا (مفيش hmac check) — ده مقصود، لأن الغرض بس تحويل
   * المتصفح لمكان صح. التأكيد الحقيقي للدفع (تحديث payment_status) بيحصل من
   * الـ webhook التاني (POST /webhooks/paymob) اللي بيتحقق من الـ hmac فعلياً.
   * صفحة التأكيد نفسها بتـ poll حالة الطلب من الـ API، مش بتاخد الحالة من هنا.
   */
  @Get('paymob/redirect')
  async paymobRedirect(@Query() query: Record<string, string>, @Res() res: Response) {
    const merchantOrderId = query.merchant_order_id || ''
    const sepIndex = merchantOrderId.indexOf('_')

    if (sepIndex === -1) {
      return res.redirect(STOREFRONT_BASE_URL)
    }

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return res.redirect(STOREFRONT_BASE_URL)
    }

    return res.redirect(`${STOREFRONT_BASE_URL}/store/${store.slug}/checkout/success?order=${orderNumber}`)
  }

  // ── Paymob (الـ webhook الحقيقي — server-to-server، متحقق منه بالـ hmac) ──
  @Post('paymob')
  @HttpCode(200)
  async paymobWebhook(@Query('hmac') hmac: string, @Body() body: any) {
    if (body?.type !== 'TRANSACTION' || !body?.obj) {
      return { received: true }
    }
    const obj = body.obj
    const merchantOrderId: string = obj?.order?.merchant_order_id || ''
    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchant_order_id غير صالح')

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'paymob')
    if (!credentials?.hmac_secret) {
      throw new BadRequestException('بوابة Paymob غير مفعّلة لهذا المتجر')
    }

    if (!hmac || !this.paymob.verifyWebhookHmac(obj, hmac, credentials.hmac_secret)) {
      throw new BadRequestException('توقيع الـ webhook غير صحيح — الطلب متجاهل')
    }

    const success = obj.success === true || obj.success === 'true'
    await this.settlePayment(storeId, orderNumber, success)
    return { received: true }
  }

  // ── Kashier ─────────────────────────────────────────────────────────────
  @Get('kashier')
  async kashierRedirect(@Query() query: Record<string, string>) {
    return this.handleKashier(query)
  }

  @Post('kashier')
  @HttpCode(200)
  async kashierWebhook(@Body() body: Record<string, string>, @Query() query: Record<string, string>) {
    return this.handleKashier({ ...query, ...body })
  }

  private async handleKashier(payload: Record<string, string>) {
    const merchantOrderId = payload.merchantOrderId || ''
    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchantOrderId غير صالح')

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const config = await this.paymentSettings.getActiveProviderConfig(storeId, 'kashier')
    if (!config?.credentials?.api_key) {
      throw new BadRequestException('بوابة Kashier غير مفعّلة لهذا المتجر')
    }

    if (!this.kashier.verifySignature(payload, config.credentials.api_key)) {
      throw new BadRequestException('توقيع Kashier غير صحيح — الطلب متجاهل')
    }

    const success = payload.paymentStatus === 'SUCCESS'
    await this.settlePayment(storeId, orderNumber, success)
    return { received: true }
  }

  // ── Stripe ──────────────────────────────────────────────────────────────
  /**
   * ⚠️ حرِج جداً: لازم الـ raw body الخام هنا مش الـ JSON المتحلّل، وإلا
   * التحقق من التوقيع هيفشل دايماً. لازم main.ts يكون فيها:
   *   const app = await NestFactory.create(AppModule, { rawBody: true })
   * وهنا بنستخدم req.rawBody بدل @Body() العادي.
   * الـ merchant_order_id مش موجود فى الـ URL هنا (عكس Paymob/Kashier) —
   * موجود جوه الـ event نفسه فى metadata.merchant_order_id.
   */
  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody) {
      throw new BadRequestException('rawBody مش مفعّلة — راجع main.ts (NestFactory.create(AppModule, { rawBody: true }))')
    }

    // محتاجين نعرف المتجر الأول عشان نجيب الـ webhook_secret بتاعه، لكن الحدث
    // نفسه مش موقّع لسه — فبنجرب نفك الـ metadata من الـ body الخام الأول
    // (من غير تحقق) بس عشان نعرف نجيب مفاتيح المتجر الصح، وبعدين نتحقق فعلياً
    const rawEvent = JSON.parse(req.rawBody.toString())
    const merchantOrderId: string =
      rawEvent?.data?.object?.metadata?.merchant_order_id || rawEvent?.data?.object?.client_reference_id || ''
    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchant_order_id غير صالح')

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'stripe')
    if (!credentials?.webhook_secret) {
      throw new BadRequestException('بوابة Stripe غير مفعّلة لهذا المتجر')
    }

    // دلوقتي التحقق الفعلي من التوقيع — لو غلط هيرمي exception لوحده
    const event = this.stripe.constructWebhookEvent(req.rawBody, signature, credentials as any)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any
      const success = session.payment_status === 'paid'
      await this.settlePayment(storeId, orderNumber, success)
    }

    return { received: true }
  }

  // ── PayPal ──────────────────────────────────────────────────────────────
  /**
   * العميل بيرجع هنا بعد ما يوافق عند PayPal (مش بعد ما يدفع فعلياً — الموافقة
   * والدفع خطوتين منفصلتين عند PayPal). هنا بنعمل الـ capture الفعلي (استدعاء
   * حقيقي لسيرفرات PayPal يرجّع لنا رد رسمي)، وعلى أساسه بنحدّث الطلب ونحوّل
   * المتصفح لصفحة النجاح.
   */
  @Get('paypal/return')
  async paypalReturn(@Query() query: Record<string, string>, @Res() res: Response) {
    const merchantOrderId = query.merchant_order_id || ''
    const paypalOrderId = query.token || '' // PayPal بترجع الـ order id بتاعها فى query باسم token
    const sepIndex = merchantOrderId.indexOf('_')

    if (sepIndex === -1 || !paypalOrderId) {
      return res.redirect(STOREFRONT_BASE_URL)
    }

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) return res.redirect(STOREFRONT_BASE_URL)

    const successUrl = `${STOREFRONT_BASE_URL}/store/${store.slug}/checkout/success?order=${orderNumber}`

    const config = await this.paymentSettings.getActiveProviderConfig(storeId, 'paypal')
    if (!config?.credentials) {
      return res.redirect(successUrl) // الطلب هيفضل UNPAID، صفحة التأكيد هتعرض الحالة صح
    }

    try {
      const result = await this.paypal.captureOrder(config.credentials as any, config.isTestMode, paypalOrderId)
      await this.settlePayment(storeId, orderNumber, result.success)
    } catch {
      // فشل الـ capture — سيبها UNPAID، العميل يقدر يجرب تاني من صفحة التأكيد
    }

    return res.redirect(successUrl)
  }

  // ── Fawry ───────────────────────────────────────────────────────────────
  // فوري بتبعت إشعار (server-to-server) لما العميل يدفع الرقم المرجعي فعلياً
  // فى أي منفذ — سجّل الرابط ده فى لوحة تحكم فوري (Developer Portal → Webhooks)
  @Post('fawry')
  @HttpCode(200)
  async fawryWebhook(@Body() body: Record<string, any>) {
    const merchantRefNumber: string = body.merchantRefNumber || body.merchantRefNum || ''
    const sepIndex = merchantRefNumber.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchantRefNumber غير صالح')

    const storeId = BigInt(merchantRefNumber.slice(0, sepIndex))
    const orderNumber = merchantRefNumber.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'fawry')
    if (!credentials?.security_key) {
      throw new BadRequestException('بوابة فوري غير مفعّلة لهذا المتجر')
    }

    if (!this.fawry.verifyWebhookSignature(body, credentials.security_key)) {
      throw new BadRequestException('توقيع فوري غير صحيح — الطلب متجاهل')
    }

    // orderStatus بترجع PAID لو العميل دفع فعلاً، وحاجات تانية زي EXPIRED/CANCELED غير كده
    const success = body.orderStatus === 'PAID'
    await this.settlePayment(storeId, orderNumber, success)
    return { received: true }
  }

  // ── PayTabs ─────────────────────────────────────────────────────────────
  @Post('paytabs')
  @HttpCode(200)
  async paytabsWebhook(@Body() body: any) {
    const tranRef = body?.tran_ref
    const cartId = body?.cart_id
    if (!tranRef || !cartId) return { received: true }

    const sepIndex = cartId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('cart_id غير صالح')
    const storeId = BigInt(cartId.slice(0, sepIndex))
    const orderNumber = cartId.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'paytabs')
    if (!credentials) throw new BadRequestException('بوابة PayTabs غير مفعّلة لهذا المتجر')

    // بنستعلم عن الترانزاكشن فعلياً من PayTabs بدل الثقة فى الـ body المرسل
    const result = await this.paytabs.queryTransaction(credentials as any, tranRef)
    if (result.cartId !== cartId) throw new BadRequestException('عدم تطابق بيانات الطلب')

    await this.settlePayment(storeId, orderNumber, result.paid)
    return { received: true }
  }

  // ── Moyasar ─────────────────────────────────────────────────────────────
  @Post('moyasar')
  @HttpCode(200)
  async moyasarWebhook(@Body() body: any) {
    const invoiceId = body?.data?.id || body?.id
    const merchantOrderId: string = body?.data?.metadata?.merchant_order_id || body?.metadata?.merchant_order_id || ''
    if (!invoiceId || !merchantOrderId) return { received: true }

    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchant_order_id غير صالح')
    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'moyasar')
    if (!credentials) throw new BadRequestException('بوابة Moyasar غير مفعّلة لهذا المتجر')

    // بنجيب الفاتورة فعلياً من Moyasar بدل الثقة فى الـ body
    const result = await this.moyasar.getInvoice(credentials as any, invoiceId)
    if (result.merchantOrderId !== merchantOrderId) throw new BadRequestException('عدم تطابق بيانات الطلب')

    await this.settlePayment(storeId, orderNumber, result.paid)
    return { received: true }
  }

  // ── Tap ─────────────────────────────────────────────────────────────────
  @Post('tap')
  @HttpCode(200)
  async tapWebhook(@Body() body: any) {
    const chargeId = body?.id
    const merchantOrderId: string = body?.reference?.order || ''
    if (!chargeId || !merchantOrderId) return { received: true }

    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) throw new BadRequestException('merchant_order_id غير صالح')
    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)

    const credentials = await this.paymentSettings.getActiveProviderCredentials(storeId, 'tap')
    if (!credentials) throw new BadRequestException('بوابة Tap غير مفعّلة لهذا المتجر')

    const result = await this.tap.getCharge(credentials as any, chargeId)
    if (result.merchantOrderId !== merchantOrderId) throw new BadRequestException('عدم تطابق بيانات الطلب')

    await this.settlePayment(storeId, orderNumber, result.paid)
    return { received: true }
  }

  // ── Paylink (نفس نمط PayPal — نداء واحد بيأكد الدفع فعلياً وبعدين يحوّل المتصفح) ──
  @Get('paylink')
  async paylinkCallback(@Query() query: Record<string, string>, @Res() res: Response) {
    const merchantOrderId = query.merchant_order_id || ''
    const storeSlug = query.store_slug || ''
    const sepIndex = merchantOrderId.indexOf('_')
    if (sepIndex === -1) return res.redirect(STOREFRONT_BASE_URL)

    const storeId = BigInt(merchantOrderId.slice(0, sepIndex))
    const orderNumber = merchantOrderId.slice(sepIndex + 1)
    const successUrl = storeSlug
      ? `${STOREFRONT_BASE_URL}/store/${storeSlug}/checkout/success?order=${orderNumber}`
      : STOREFRONT_BASE_URL

    const config = await this.paymentSettings.getActiveProviderConfig(storeId, 'paylink')
    if (!config?.credentials) return res.redirect(successUrl)

    // ⚠️ Paylink مش موثّق رسمياً بالضبط إيه أسماء الـ query params اللي بترجعها فى
    // الـ callback (transactionNo مش مؤكد 100%) — الـ log ده هيوريك الشكل الحقيقي
    // أول ما تجرب فعلياً، وبعدها احذفه أو عدّل أسماء الحقول تحت لو مختلفة
    console.log('📥 Paylink callback query:', query)

    const transactionNo = query.transactionNo || query.transactionNumber || ''
    if (!transactionNo) return res.redirect(successUrl) // هيفضل UNPAID لحد التأكد اليدوي

    try {
      const result = await this.paylink.getInvoiceByTransactionNo(
        config.credentials as any, transactionNo, config.isTestMode,
      )
      if (result.merchantOrderId === orderNumber || result.merchantOrderId === merchantOrderId) {
        await this.settlePayment(storeId, orderNumber, result.paid)
      }
    } catch {
      // سيبها UNPAID، تقدر تتأكد يدوياً من داشبورد Paylink
    }

    return res.redirect(successUrl)
  }

  // ── منطق مشترك: تحديث حالة الطلب + إنقاص المخزون ─────────────────────────
  private async settlePayment(storeId: bigint, orderNumber: string, success: boolean) {
    const order = await this.prisma.order.findFirst({
      where: { store_id: storeId, order_number: orderNumber },
      include: { items: true },
    })
    if (!order) throw new NotFoundException('Order not found')

    // idempotency — أي بوابة ممكن تبعت نفس الإشعار أكتر من مرة
    if (order.payment_status !== PaymentStatus.UNPAID) return

    if (!success) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { payment_status: PaymentStatus.FAILED },
      })
      return
    }

    const variantIds = order.items.filter((i) => i.variant_id).map((i) => i.variant_id!) as bigint[]
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { payment_status: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
      })
      for (const item of order.items) {
        const variant = variants.find((v) => v.id === item.variant_id)
        if (variant?.track_inventory) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { inventory_qty: { decrement: item.qty } },
          })
        }
      }
    })
  }




}