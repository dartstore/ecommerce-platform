import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { WalletModule } from './wallet/wallet.module'
import { DevicesModule } from './devices/devices.module'
import { NotificationsModule } from './notifications/notifications.module'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { StoreModule } from './stores/store.module'
import { ProductModule } from './stores/products/product.module'
import { OrderModule } from './stores/orders/order.module'
import { CollectionsModule } from './stores/collections/collections.module'
import { PaymentModule } from './stores/payments/payment.module'
import { UploadsModule } from './uploads/uploads.module'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WalletModule,
    DevicesModule,
    NotificationsModule,
    EventEmitterModule.forRoot(),
    PaymentModule,
    CollectionsModule,
    OrderModule,
    ProductModule,
    StoreModule,
    UploadsModule,
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}