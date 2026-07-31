import { Module } from '@nestjs/common'
import { ProductController } from './product.controller'
import { StorefrontProductController } from './storefront-product.controller'
import { ProductService } from './product.service'
import { PrismaModule } from '../../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [ProductController, StorefrontProductController],
  providers: [ProductService],
})
export class ProductModule {}