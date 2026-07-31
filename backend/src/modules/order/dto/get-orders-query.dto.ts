import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { OrderStatus } from '@prisma/client'

export class GetOrdersQueryDto {
  @IsOptional()
  @IsIn(Object.values(OrderStatus), { message: 'حالة غير صالحة' })
  status?: OrderStatus

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'الحد الأقصى للعناصر في الصفحة 100' })
  limit: number = 20
}
