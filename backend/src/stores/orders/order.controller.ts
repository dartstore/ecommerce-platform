import {
  Controller, Get, Put,
  Body, Param, Query, Request, UseGuards,
} from '@nestjs/common'
import { SessionAuthGuard } from '../../auth/session-auth.guard'
import { OrderService } from './order.service'
import { OrderStatus } from '@prisma/client'

@Controller('stores/orders')
@UseGuards(SessionAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async getOrders(
    @Request() req,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.orderService.getOrders(req.user.id, {
      status,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
    })
  }

  @Get(':id')
  async getOrder(@Request() req, @Param('id') id: string) {
    return this.orderService.getOrder(req.user.id, id)
  }

  @Put(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.orderService.updateOrderStatus(req.user.id, id, body.status)
  }
}