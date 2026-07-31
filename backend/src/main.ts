import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import cookieParser from 'cookie-parser'
(BigInt.prototype as any).toJSON = function () {
  return this.toString()
}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true }) // 👈 محتاجينها لتوقيع Stripe webhook
  app.use(cookieParser())
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin ||
        origin === 'http://localhost:3000' ||
        /^http:\/\/.*\.localhost:3000$/.test(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Blocked by CORS Policy (DartCoin Security)'))
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type', 'Authorization', 'X-Register-Flow',
      'X-Register-Signature', 'X-Device-Fingerprint'
    ],
  })
  app.setGlobalPrefix('api')
  await app.listen(4000)
  console.log('🚀 Server is running on: http://localhost:4000/api test')
}
bootstrap()