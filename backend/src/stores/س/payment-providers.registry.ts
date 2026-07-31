/**
 * ══════════════════════════════════════════════════════════════════════
 * Payment Providers Registry
 * ══════════════════════════════════════════════════════════════════════
 * ده المكان الوحيد اللي بيوصف كل بوابة دفع: اسمها، وهل محتاجة بيانات
 * اتصال ولا لأ، وإيه هي الحقول دي بالظبط. الـ Controller والـ Service
 * والفرونت الأدمن كلهم بيقرأوا من هنا — يعني تفعيل/تعديل بوابة جديدة
 * بيبقى بإضافة عنصر واحد هنا بس، من غير ما تلمس أي كود تاني.
 * ══════════════════════════════════════════════════════════════════════
 */

export type PaymentFieldType = 'text' | 'password' | 'select' | 'textarea'

export interface PaymentFieldDef {
  key: string
  label_ar: string
  label_en: string
  type: PaymentFieldType
  required: boolean
  placeholder?: string
  options?: { value: string; label_ar: string }[] // لو type = select
}

export interface PaymentProviderDef {
  key: string
  name_ar: string
  name_en: string
  description_ar: string
  requires_credentials: boolean
  supports_test_mode: boolean
  fields: PaymentFieldDef[]
}

export const PAYMENT_PROVIDERS: PaymentProviderDef[] = [
  {
    key: 'cod',
    name_ar: 'الدفع عند الاستلام',
    name_en: 'Cash on Delivery',
    description_ar: 'العميل يدفع نقداً عند استلام الطلب — مفيش بيانات ربط مطلوبة',
    requires_credentials: false,
    supports_test_mode: false,
    fields: [],
  },
  {
    key: 'bank_transfer',
    name_ar: 'تحويل بنكي (صورة التحويل)',
    name_en: 'Bank Transfer',
    description_ar: 'العميل يحول المبلغ على حساب بنكي ويرفع صورة إيصال التحويل',
    requires_credentials: false,
    supports_test_mode: false,
    fields: [
      { key: 'bank_name', label_ar: 'اسم البنك', label_en: 'Bank name', type: 'text', required: true },
      { key: 'account_name', label_ar: 'اسم صاحب الحساب', label_en: 'Account holder', type: 'text', required: true },
      { key: 'account_number', label_ar: 'رقم الحساب / IBAN', label_en: 'Account number / IBAN', type: 'text', required: true },
      { key: 'instructions', label_ar: 'ملاحظات إضافية تظهر للعميل', label_en: 'Extra instructions', type: 'textarea', required: false },
    ],
  },
  {
    key: 'paymob',
    name_ar: 'Paymob',
    name_en: 'Paymob',
    description_ar: 'بوابة دفع مصرية تدعم البطاقات والمحافظ الإلكترونية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
      { key: 'integration_id', label_ar: 'Integration ID', label_en: 'Integration ID', type: 'text', required: true },
      { key: 'iframe_id', label_ar: 'Iframe ID', label_en: 'Iframe ID', type: 'text', required: false },
      { key: 'hmac_secret', label_ar: 'HMAC Secret', label_en: 'HMAC Secret', type: 'password', required: true },
    ],
  },
  {
    key: 'kashier',
    name_ar: 'Kashier',
    name_en: 'Kashier',
    description_ar: 'بوابة دفع مصرية للبطاقات والمحافظ الإلكترونية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'merchant_id', label_ar: 'Merchant ID', label_en: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
    ],
  },
  {
    key: 'stripe',
    name_ar: 'Stripe',
    name_en: 'Stripe',
    description_ar: 'بوابة دفع عالمية للبطاقات',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'publishable_key', label_ar: 'Publishable Key', label_en: 'Publishable Key', type: 'text', required: true },
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
      { key: 'webhook_secret', label_ar: 'Webhook Signing Secret', label_en: 'Webhook Secret', type: 'password', required: false },
    ],
  },
  {
    key: 'fawry',
    name_ar: 'فوري',
    name_en: 'Fawry',
    description_ar: 'الدفع عن طريق منافذ فوري بكود دفع',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'merchant_code', label_ar: 'Merchant Code', label_en: 'Merchant Code', type: 'text', required: true },
      { key: 'security_key', label_ar: 'Security Key', label_en: 'Security Key', type: 'password', required: true },
    ],
  },
  {
    key: 'paypal',
    name_ar: 'PayPal',
    name_en: 'PayPal',
    description_ar: 'الدفع عالمياً عبر PayPal',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'client_id', label_ar: 'Client ID', label_en: 'Client ID', type: 'text', required: true },
      { key: 'client_secret', label_ar: 'Client Secret', label_en: 'Client Secret', type: 'password', required: true },
    ],
  },
  {
    key: 'paytabs',
    name_ar: 'PayTabs',
    name_en: 'PayTabs',
    description_ar: 'بوابة دفع خليجية وعربية للبطاقات',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'profile_id', label_ar: 'Profile ID', label_en: 'Profile ID', type: 'text', required: true },
      { key: 'server_key', label_ar: 'Server Key', label_en: 'Server Key', type: 'password', required: true },
      { key: 'client_key', label_ar: 'Client Key', label_en: 'Client Key', type: 'password', required: true },
      {
        key: 'region', label_ar: 'المنطقة', label_en: 'Region', type: 'select', required: true,
        options: [
          { value: 'EGY', label_ar: 'مصر' },
          { value: 'SAU', label_ar: 'السعودية' },
          { value: 'ARE', label_ar: 'الإمارات' },
          { value: 'GLOBAL', label_ar: 'عالمي' },
        ],
      },
    ],
  },
  {
    key: 'moyasar',
    name_ar: 'Moyasar',
    name_en: 'Moyasar',
    description_ar: 'بوابة دفع سعودية تدعم البطاقات وApple Pay وmada',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'publishable_key', label_ar: 'Publishable Key', label_en: 'Publishable Key', type: 'text', required: true },
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
    ],
  },
  {
    key: 'paylink',
    name_ar: 'Paylink',
    name_en: 'Paylink',
    description_ar: 'بوابة دفع سعودية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_id', label_ar: 'API ID', label_en: 'API ID', type: 'text', required: true },
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
    ],
  },
  {
    key: 'tap',
    name_ar: 'Tap Payments',
    name_en: 'Tap',
    description_ar: 'بوابة دفع خليجية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
      { key: 'publishable_key', label_ar: 'Publishable Key', label_en: 'Publishable Key', type: 'text', required: true },
    ],
  },
  {
    key: 'tabby',
    name_ar: 'Tabby',
    name_en: 'Tabby',
    description_ar: 'الدفع بالتقسيط (Buy Now Pay Later)',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
      { key: 'public_key', label_ar: 'Public Key', label_en: 'Public Key', type: 'text', required: true },
      { key: 'merchant_code', label_ar: 'Merchant Code', label_en: 'Merchant Code', type: 'text', required: true },
    ],
  },
  {
    key: 'taager',
    name_ar: 'تاجر (Taager)',
    name_en: 'Taager',
    description_ar: 'ربط دفع/تحصيل خاص بمنتجات تاجر',
    requires_credentials: true,
    supports_test_mode: false,
    fields: [
      { key: 'api_token', label_ar: 'API Token', label_en: 'API Token', type: 'password', required: true },
    ],
  },
  {
    key: 'my_fatoorah',
    name_ar: 'MyFatoorah',
    name_en: 'MyFatoorah',
    description_ar: 'بوابة دفع خليجية شاملة',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
      {
        key: 'country', label_ar: 'الدولة', label_en: 'Country', type: 'select', required: true,
        options: [
          { value: 'SAU', label_ar: 'السعودية' },
          { value: 'ARE', label_ar: 'الإمارات' },
          { value: 'KWT', label_ar: 'الكويت' },
          { value: 'EGY', label_ar: 'مصر' },
        ],
      },
    ],
  },
  {
    key: 'fawaterk',
    name_ar: 'فواترك',
    name_en: 'Fawaterk',
    description_ar: 'بوابة دفع مصرية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
      { key: 'vendor_key', label_ar: 'Vendor Key', label_en: 'Vendor Key', type: 'password', required: true },
    ],
  },
  {
    key: 'xpay',
    name_ar: 'XPay',
    name_en: 'XPay',
    description_ar: 'بوابة دفع مصرية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'merchant_id', label_ar: 'Merchant ID', label_en: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
      { key: 'secret_key', label_ar: 'Secret Key', label_en: 'Secret Key', type: 'password', required: true },
    ],
  },
  {
    key: 'ziina',
    name_ar: 'Ziina',
    name_en: 'Ziina',
    description_ar: 'بوابة دفع إماراتية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
    ],
  },
  {
    key: 'tamara',
    name_ar: 'Tamara',
    name_en: 'Tamara',
    description_ar: 'الدفع بالتقسيط (Buy Now Pay Later)',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_token', label_ar: 'API Token', label_en: 'API Token', type: 'password', required: true },
      { key: 'notification_token', label_ar: 'Notification Token', label_en: 'Notification Token', type: 'password', required: false },
    ],
  },
  {
    key: 'easykash',
    name_ar: 'EasyKash',
    name_en: 'EasyKash',
    description_ar: 'بوابة دفع مصرية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
    ],
  },
  {
    key: 'upay',
    name_ar: 'UPay',
    name_en: 'UPay',
    description_ar: 'بوابة دفع مصرية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'merchant_id', label_ar: 'Merchant ID', label_en: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
    ],
  },
  {
    key: 'fabmisr',
    name_ar: 'FABMISR',
    name_en: 'FABMISR',
    description_ar: 'بوابة دفع بنكية مصرية',
    requires_credentials: true,
    supports_test_mode: true,
    fields: [
      { key: 'merchant_id', label_ar: 'Merchant ID', label_en: 'Merchant ID', type: 'text', required: true },
      { key: 'terminal_id', label_ar: 'Terminal ID', label_en: 'Terminal ID', type: 'text', required: true },
      { key: 'api_key', label_ar: 'API Key', label_en: 'API Key', type: 'password', required: true },
    ],
  },
]

export function getProviderDef(key: string): PaymentProviderDef | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.key === key)
}