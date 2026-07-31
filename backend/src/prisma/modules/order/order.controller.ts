import {
  Controller, Get, Put,
  Body, Param, Query, Request, UseGuards,
} from '@nestjs/common'
import { SessionAuthGuard } from '../../auth/session-auth.guard'
import { OrderService } from './order.service'
import { GetOrdersQueryDto } from './dto/get-orders-query.dto'
import { UpdateOrderStatusDto } from './dto/update-order-status.dto'

@Controller('stores/orders')
@UseGuards(SessionAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ملاحظة: بيعتمد إن الـ ValidationPipe مفعّل global في main.ts بالإعدادات دي:
  // app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))

  @Get()
  async getOrders(@Request() req, @Query() query: GetOrdersQueryDto) {
    return this.orderService.getOrders(req.user.id, query)
  }

  @Get(':id')
  async getOrder(@Request() req, @Param('id') id: string) {
    return this.orderService.getOrder(req.user.id, id)
  }

  @Put(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatus(req.user.id, id, body.status)
  }
}
