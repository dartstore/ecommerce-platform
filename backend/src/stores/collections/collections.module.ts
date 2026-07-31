import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { StorefrontController } from './storefront-collections.controller'
import { CollectionsService } from './collections.service';
import { StorefrontCollectionsService } from './storefront-collections.service';
import { PrismaModule } from '../../prisma/prisma.module'; // ← عدّل المسار

@Module({
  imports: [PrismaModule],
  controllers: [CollectionsController, StorefrontController],
  providers: [CollectionsService, StorefrontCollectionsService],
})
export class CollectionsModule {}