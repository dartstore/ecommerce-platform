import { Controller, Get, Param } from '@nestjs/common'
import { PaymentSettingsService } from './payment-settings.service'

@Controller('storefront')
export class StorefrontPaymentController {
  constructor(private readonly paymentSettingsService: PaymentSettingsService) {}

  @Get(':slug/payment-methods')
  async getPaymentMethods(@Param('slug') slug: string) {
    return this.paymentSettingsService.getEnabledProvidersForStorefront(slug)
  }
}