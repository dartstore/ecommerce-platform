import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { OrderService } from './order.service'
import { CreateCheckoutDto } from './dto/create-checkout.dto'

@Controller('storefront')
export class StorefrontOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':slug/checkout')
  async checkout(
    @Param('slug') slug: string,
    @Body() body: CreateCheckoutDto,
  ) {
    return this.orderService.createOrder(slug, body.customer, body.items, body.payment_method)
  }

  @Get(':slug/orders/:orderNumber')
  async getOrder(
    @Param('slug') slug: string,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orderService.getStorefrontOrder(slug, orderNumber)
  }
}
