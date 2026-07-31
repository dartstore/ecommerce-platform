import { Module } from '@nestjs/common'
import { PaymentSettingsController } from '../payment-settings.controller'
import { StorefrontPaymentController } from '../storefront-payment.controller'
import { PaymentWebhooksController } from '../providers/payment-webhooks.controller'
import { PaymentSettingsService } from '../payment-settings.service'
import { PaymentCheckoutService } from '../providers/payment-checkout.service'
import { PaymobProvider } from '../providers/paymob.provider'
import { EncryptionService } from '../../../common/crypto/encryption.service'
import { PrismaModule } from '../../../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [PaymentSettingsController, StorefrontPaymentController, PaymentWebhooksController],
  providers: [PaymentSettingsService, EncryptionService, PaymobProvider, PaymentCheckoutService],
  exports: [PaymentSettingsService, PaymentCheckoutService],
})
export class PaymentModuleVIVO {}