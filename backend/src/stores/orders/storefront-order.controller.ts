import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { OrderService } from './order.service'

@Controller('storefront')
export class StorefrontOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':slug/checkout')
  async checkout(
    @Param('slug') slug: string,
    @Body() body: {
      customer: { name: string; phone: string; email?: string; address: string; city: string; notes?: string }
      items: { variantId: string; qty: number }[]
      payment_method: string // 👈 جديد
    },
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