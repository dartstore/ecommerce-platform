import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class CheckoutCustomerDto {
  @IsString()
  @MinLength(2, { message: 'الاسم قصير جداً' })
  name: string

  @IsString()
  @Matches(/^[0-9+\s-]{8,}$/, { message: 'رقم الهاتف غير صالح' })
  phone: string

  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email?: string

  @IsString()
  @MinLength(3, { message: 'العنوان قصير جداً' })
  address: string

  @IsString()
  @MinLength(2, { message: 'المدينة مطلوبة' })
  city: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class CheckoutItemDto {
  @IsString()
  variantId: string

  @IsInt({ message: 'الكمية يجب أن تكون رقم صحيح' })
  @Min(1, { message: 'الكمية يجب أن تكون 1 على الأقل' })
  qty: number
}

export class CreateCheckoutDto {
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer: CheckoutCustomerDto

  @IsArray()
  @ArrayMinSize(1, { message: 'السلة فاضية' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[]

  @IsString()
  payment_method: string
}
