import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
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
import { PaymentsModule } from './stores/payments/payments.module'
import { UploadsModule } from './uploads/uploads.module'
import { ActiveStoreModule } from './stores/active-store.module'
import { CryptoModule } from './common/crypto/crypto.module'
import { TenantModule } from './common/tenant/tenant.module'
import { IdsModule } from './common/ids/ids.module'
import { IdempotencyModule } from './common/idempotency/idempotency.module'
import { MessagingModule } from './common/messaging/messaging.module'
import { configurationLoaders } from './common/config/configuration'
import { validateEnv } from './common/config/env.validation'

@Module({
  imports: [
    // لازم تكون الأولى — باقي الموديولات بتعتمد على الإعدادات.
    // validate بتوقّف السيرفر فوراً لو في متغير بيئة ناقص أو غلط.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurationLoaders,
      validate: validateEnv,
    }),

    // بيشغّل موزّع صندوق الصادر ووظيفة تنضيف سجلات منع التكرار.
    ScheduleModule.forRoot(),

    // ── أساسات (المرحلة 0 و 1a) ────────────────────────────────
    CryptoModule,
    TenantModule,
    IdsModule,
    MessagingModule,
    IdempotencyModule,

    // ── موديولات المشروع ───────────────────────────────────────
    PrismaModule,
    AuthModule,
    WalletModule,
    DevicesModule,
    NotificationsModule,
    EventEmitterModule.forRoot(),
    CollectionsModule,
    OrderModule,
    ProductModule,

    // ⚠️ لازم قبل StoreModule: الاتنين على البادئة 'stores'، و NestJS
    // بيطابق المسارات بترتيب تسجيل الموديولات. كده /stores/payment-settings
    // بيتطابق قبل أي مسار ديناميكي في StoreController.
    PaymentsModule,

    StoreModule,
    UploadsModule,
    ActiveStoreModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
