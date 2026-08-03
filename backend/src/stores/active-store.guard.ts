import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ActiveStoreService } from './active-store.service'

/**
 * ActiveStoreGuard
 * ==================
 * بيشتغل بعد أي Auth Guard (SessionAuthGuard) في نفس الـ @UseGuards() chain،
 * يعني الترتيب المتوقع في المراحل الجاية:
 *
 *   @UseGuards(SessionAuthGuard, ActiveStoreGuard)
 *
 * بيحل المتجر الفعّال من (بالترتيب):
 *   1. هيدر X-Store-Id
 *   2. هيدر X-Store-Slug
 *   3. الـ route param :storeSlug (لو الـ route أصلاً فيه واحد زي
 *      /stores-building/[storeSlug]/... الموجودة بالفعل في الفرونت)
 *
 * وبيتحقق إن المتجر ده فعلاً بتاع req.user.id عن طريق ActiveStoreService،
 * وبعدين بيحط النتيجة على الـ request:
 *   - request.activeStore    → صف المتجر كامل
 *   - request.activeStoreId  → bigint، اختصار سريع
 *
 * ⚠️ ملاحظة مرحلة التأسيس: الـ Guard ده مش متطبّق على أي Controller لسه.
 * موجود كبنية تحتية جاهزة، ومفيش أي تغيير في سلوك أي endpoint حالي.
 * لو مفيش أي إشارة مبعوتة من الفرونت، بيرجع لنفس سلوك المشروع الحالي
 * (أول متجر بتاع اليوزر) عن طريق ActiveStoreService — يعني تفعيله على
 * أي Controller في المستقبل مش هيكسر حاجة شغالة دلوقتي.
 */
@Injectable()
export class ActiveStoreGuard implements CanActivate {
  constructor(private readonly activeStoreService: ActiveStoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const userId = request.user?.id ?? request.user?.sub
    if (!userId) {
      // من المفروض الـ Auth Guard اللي قبله يكون رفض الطلب قبل ما يوصل
      // هنا أصلاً. منكررش خطأ Auth هنا — الـ Auth Guard هو المسؤول عنه.
      return true
    }

    const storeIdentifier: string | null =
      (request.headers['x-store-id'] as string) ||
      (request.headers['x-store-slug'] as string) ||
      request.params?.storeSlug ||
      null

    const store = await this.activeStoreService.resolveActiveStore(
      userId,
      storeIdentifier,
    )

    request.activeStore = store
    request.activeStoreId = store.id

    return true
  }
}
