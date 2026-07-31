import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { PaymentSettingsController } from './payment-settings.controller'
import { StorefrontPaymentController } from './storefront-payment.controller'
import { PaymentWebhooksController } from './providers/payment-webhooks.controller'
import { PaymentSettingsService } from './payment-settings.service'
import { PaymentCheckoutService } from './providers/payment-checkout.service'
import { PaymobProvider } from './providers/paymob.provider'
import { KashierProvider } from './providers/kashier.provider'
import { StripeProvider } from './providers/stripe.provider'
import { PaypalProvider } from './providers/paypal.provider'
import { FawryProvider } from './providers/fawry.provider'
import { PayTabsProvider } from './providers/paytabs.provider'       // 👈 جديد
import { MoyasarProvider } from './providers/moyasar.provider'       // 👈 جديد
import { PaylinkProvider } from './providers/paylink.provider'       // 👈 جديد
import { TapProvider } from './providers/tap.provider'               // 👈 جديد
import { EncryptionService } from '../../common/crypto/encryption.service'

@Module({
  imports: [PrismaModule],
  controllers: [
    PaymentSettingsController,
    StorefrontPaymentController,
    PaymentWebhooksController,
  ],
  providers: [
    PaymentSettingsService,
    PaymentCheckoutService,
    PaymobProvider,
    KashierProvider,
    StripeProvider,
    PaypalProvider,
    FawryProvider,
    PayTabsProvider,   // 👈 جديد
    MoyasarProvider,   // 👈 جديد
    PaylinkProvider,   // 👈 جديد
    TapProvider,       // 👈 جديد
    EncryptionService,
  ],
  exports: [
    PaymentSettingsService,
    PaymentCheckoutService,
  ],
})
export class PaymentModule {}