import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../common/crypto/encryption.service'
import { PAYMENT_PROVIDERS, getProviderDef } from './payment-providers.registry'

interface UpdateProviderBody {
  enabled?: boolean
  is_test_mode?: boolean
  credentials?: Record<string, string>
  settings?: Record<string, any>
}

@Injectable()
export class PaymentSettingsService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  private jsonSafe(data: any) {
    return JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
  }

  private async getStore(userId: any) {
    const store = await this.prisma.store.findFirst({ where: { ownerId: BigInt(userId) } })
    if (!store) throw new NotFoundException('Store not found')
    return store
  }



  /** بيقنّع أي قيمة حساسة قبل ما ترجع للفرونت — مبنرجعش API key كامل تاني أبداً */
  private maskCredentials(
    fields: { key: string; type: string }[],
    creds: Record<string, any> | null,
  ) {
    if (!creds) return null
    const masked: Record<string, string> = {}
    for (const field of fields) {
      const value = creds[field.key]
      if (!value) continue
      masked[field.key] =
        field.type === 'password' ? '•'.repeat(Math.min(String(value).length, 12)) : String(value)
    }
    return masked
  }

  /** كل بوابات الدفع مع حالتها الحالية للمتجر — البيانات الحساسة بتيجي متقنّعة بس */
  async listProviders(userId: any) {
    const store = await this.getStore(userId)
    const saved = await this.prisma.storePaymentProvider.findMany({ where: { store_id: store.id } })
    const savedMap = new Map(saved.map((s) => [s.provider, s]))

    const result = PAYMENT_PROVIDERS.map((def) => {
      const record = savedMap.get(def.key as any)
      const decrypted = record?.credentials_encrypted
        ? this.encryption.decryptJson<Record<string, any>>(record.credentials_encrypted)
        : null

      return {
        key: def.key,
        name_ar: def.name_ar,
        name_en: def.name_en,
        description_ar: def.description_ar,
        requires_credentials: def.requires_credentials,
        supports_test_mode: def.supports_test_mode,
        fields: def.fields,
        enabled: record?.enabled ?? false,
        is_test_mode: record?.is_test_mode ?? true,
        is_configured: !!decrypted,
        credentials: this.maskCredentials(def.fields, decrypted),
        settings: record?.settings ?? {},
        updated_at: record?.updated_at ?? null,
      }
    })

    return this.jsonSafe(result)
  }

  async getActiveProviderConfig(storeId: bigint, providerKey: string) {
    const record = await this.prisma.storePaymentProvider.findUnique({
      where: { store_id_provider: { store_id: storeId, provider: providerKey as any } },
    })
    if (!record || !record.enabled) return null
    return {
      credentials: record.credentials_encrypted
        ? this.encryption.decryptJson<Record<string, any>>(record.credentials_encrypted)
        : null,
      isTestMode: record.is_test_mode,
    }
  }

  /** تحديث بوابة واحدة: تفعيل/تعطيل + حفظ بياناتها (بتتشفر قبل التخزين) */
  async updateProvider(userId: any, providerKey: string, body: UpdateProviderBody) {
    const store = await this.getStore(userId)
    const def = getProviderDef(providerKey)
    if (!def) throw new BadRequestException('بوابة دفع غير معروفة')

    const existing = await this.prisma.storePaymentProvider.findUnique({
      where: { store_id_provider: { store_id: store.id, provider: providerKey as any } },
    })

    let credentialsEncrypted = existing?.credentials_encrypted ?? null

    if (body.credentials) {
      // أي حقل جاي فاضي أو متقنّع (يعني المستخدم مغيرش القيمة دي في الفورم)
      // بنتجاهله ونحتفظ بالقيمة القديمة المشفّرة بتاعته
      const previous = credentialsEncrypted
        ? this.encryption.decryptJson<Record<string, any>>(credentialsEncrypted) || {}
        : {}
      const merged = { ...previous }
      for (const field of def.fields) {
        const incoming = body.credentials[field.key]
        if (incoming === undefined) continue
        if (incoming === '' || /^•+$/.test(incoming)) continue
        merged[field.key] = incoming
      }
      credentialsEncrypted = this.encryption.encryptJson(merged)
    }

    const wantsEnabled = body.enabled ?? existing?.enabled ?? false
    if (wantsEnabled && def.requires_credentials) {
      const decrypted = credentialsEncrypted
        ? this.encryption.decryptJson<Record<string, any>>(credentialsEncrypted)
        : null
      const missing = def.fields.filter((f) => f.required && !decrypted?.[f.key])
      if (missing.length > 0) {
        throw new BadRequestException(
          `مينفعش تفعّل ${def.name_ar} من غير: ${missing.map((f) => f.label_ar).join('، ')}`,
        )
      }
    }

    const saved = await this.prisma.storePaymentProvider.upsert({
      where: { store_id_provider: { store_id: store.id, provider: providerKey as any } },
      create: {
        store_id: store.id,
        provider: providerKey as any,
        enabled: wantsEnabled,
        is_test_mode: body.is_test_mode ?? true,
        credentials_encrypted: credentialsEncrypted,
        settings: body.settings ?? {},
      },
      update: {
        enabled: wantsEnabled,
        ...(body.is_test_mode !== undefined ? { is_test_mode: body.is_test_mode } : {}),
        ...(credentialsEncrypted !== null ? { credentials_encrypted: credentialsEncrypted } : {}),
        ...(body.settings !== undefined ? { settings: body.settings } : {}),
      },
    })

    return this.jsonSafe({
      key: saved.provider,
      enabled: saved.enabled,
      is_test_mode: saved.is_test_mode,
      is_configured: !!saved.credentials_encrypted,
    })
  }

  /** يمسح بيانات بوابة معينة بالكامل (التاجر عايز يفصلها ويبدأ من جديد) */
  async clearCredentials(userId: any, providerKey: string) {
    const store = await this.getStore(userId)
    const existing = await this.prisma.storePaymentProvider.findUnique({
      where: { store_id_provider: { store_id: store.id, provider: providerKey as any } },
    })
    if (!existing) throw new NotFoundException('البوابة دي مش متفعّلة أصلاً')

    return this.jsonSafe(
      await this.prisma.storePaymentProvider.update({
        where: { id: existing.id },
        data: { credentials_encrypted: null, enabled: false },
      }),
    )
  }

  /**
   * بترجع بيانات بوابة مفعّلة (decrypted) — دالة داخلية بس، هتستخدمها لاحقاً
   * في order.service.ts وقت معالجة الدفع الفعلي. متتنادوش من أي كنترولر عام.
   */
  async getActiveProviderCredentials(storeId: bigint, providerKey: string) {
    const record = await this.prisma.storePaymentProvider.findUnique({
      where: { store_id_provider: { store_id: storeId, provider: providerKey as any } },
    })
    if (!record || !record.enabled) return null
    return record.credentials_encrypted
      ? this.encryption.decryptJson<Record<string, any>>(record.credentials_encrypted)
      : null
  }

  /** البوابات المفعّلة فقط — دي اللي المفروض تتعرض للعميل وقت الدفع في الـ storefront */
  async getEnabledProvidersForStorefront(storeSlug: string) {
    const store = await this.prisma.store.findFirst({ where: { slug: storeSlug } })
    if (!store) throw new NotFoundException('Store not found')

    const enabled = await this.prisma.storePaymentProvider.findMany({
      where: { store_id: store.id, enabled: true },
      orderBy: { position: 'asc' },
    })

    return this.jsonSafe(
      enabled.map((e) => {
        const def = getProviderDef(e.provider)
        return { key: e.provider, name_ar: def?.name_ar, name_en: def?.name_en }
      }),
    )
  }
}