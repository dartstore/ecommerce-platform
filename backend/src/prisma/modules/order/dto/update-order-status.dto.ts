import { IsEnum } from 'class-validator'
import { OrderStatus } from '@prisma/client'

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'حالة الطلب غير صالحة' })
  status: OrderStatus
}
