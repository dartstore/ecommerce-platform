import { Injectable } from '@nestjs/common'
import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // القياس الموصى بيه لـ GCM
const TAG_LENGTH = 16

/**
 * خدمة تشفير عامة لأي بيانات حساسة (مش بس بوابات الدفع — ينفع تستخدمها
 * لأي حقل تاني محتاج تشفير في المستقبل).
 *
 * المفتاح بييجي من env variable PAYMENT_ENCRYPTION_KEY، لازم يكون:
 *   - 32 byte بعد فك الـ base64
 *   - ثابت طول العمر (لو غيرته، أي بيانات متشفرة قديمة هتبقى غير قابلة للفك)
 *   - اتولده مرة واحدة بالأمر: openssl rand -base64 32
 *   - محفوظ في .env بس، وميتبعتش أبداً في أي response أو log
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer

  constructor() {
    const rawKey = process.env.PAYMENT_ENCRYPTION_KEY
    if (!rawKey) {
      throw new Error(
        'PAYMENT_ENCRYPTION_KEY غير موجود في environment variables. ' +
        'ضيفه في .env — ولّده بالأمر: openssl rand -base64 32',
      )
    }
    const decoded = Buffer.from(rawKey, 'base64')
    if (decoded.length !== 32) {
      throw new Error(
        `PAYMENT_ENCRYPTION_KEY لازم يكون 32 byte بعد فك الـ base64 (حالياً ${decoded.length} byte). ` +
        'ولّده بالأمر: openssl rand -base64 32',
      )
    }
    this.key = decoded
  }

  /** يشفر نص عادي ويرجع payload واحد (iv + authTag + ciphertext) في base64 */
  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  /** يفك تشفير payload اترجع من encrypt() */
  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64')
    const iv = raw.subarray(0, IV_LENGTH)
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  }

  /** helper: يشفر object كامل (بيانات بوابة دفع مثلاً) */
  encryptJson(obj: Record<string, any>): string {
    return this.encrypt(JSON.stringify(obj))
  }

  /** helper: يفك تشفير ويرجع object، أو null لو مفيش بيانات أو فشل الفك */
  decryptJson<T = Record<string, any>>(payload: string | null | undefined): T | null {
    if (!payload) return null
    try {
      return JSON.parse(this.decrypt(payload)) as T
    } catch {
      return null
    }
  }
}