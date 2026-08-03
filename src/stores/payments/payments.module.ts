import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ActiveStoreModule } from '../active-store.module'
import { CryptoModule } from '../../common/crypto/crypto.module'
import { IdsModule } from '../../common/ids/ids.module'
import { PaymentAccountService } from './payment-account.service'
import { PaymentSettingsController } from './payment-settings.controller'

/**
 * إعدادات الدفع للتاجر — المرحلة 1b.1.
 *
 * النطاق: حسابات البوابات ووسائل الدفع بس. مفيش checkout، ولا نوايا
 * دفع، ولا دفتر، ولا أدابتر بيكلّم بوابة. كل ده في المرحلة 1b.2.
 *
 * PrismaModule متستورد صراحةً زي OrderModule بالظبط، عشان نفضل على
 * نفس نمط الموديولات الموجودة.
 */
@Module({
  imports: [PrismaModule, ActiveStoreModule, CryptoModule, IdsModule],
  controllers: [PaymentSettingsController],
  providers: [PaymentAccountService],
  exports: [PaymentAccountService],
})
export class PaymentsModule {}
