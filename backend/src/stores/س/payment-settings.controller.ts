import { Controller, Get, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common'
import { SessionAuthGuard } from '../../auth/session-auth.guard'
import { PaymentSettingsService } from './payment-settings.service'

@Controller('stores/payment-settings')
@UseGuards(SessionAuthGuard)
export class PaymentSettingsController {
  constructor(private readonly paymentSettingsService: PaymentSettingsService) {}

  @Get()
  async list(@Request() req) {
    return this.paymentSettingsService.listProviders(req.user.id)
  }

  @Put(':provider')
  async update(
    @Request() req,
    @Param('provider') provider: string,
    @Body()
    body: {
      enabled?: boolean
      is_test_mode?: boolean
      credentials?: Record<string, string>
      settings?: Record<string, any>
    },
  ) {
    return this.paymentSettingsService.updateProvider(req.user.id, provider, body)
  }

  @Delete(':provider/credentials')
  async clearCredentials(@Request() req, @Param('provider') provider: string) {
    return this.paymentSettingsService.clearCredentials(req.user.id, provider)
  }
}