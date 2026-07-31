# PROJECT CONTEXT

## Project

هذا المشروع عبارة عن منصة SaaS لإنشاء المتاجر الإلكترونية شبيهة بـ Shopify.

كل مستخدم يستطيع إنشاء أكثر من متجر.
لكل متجر:
- منتجات
- Collections
- Theme
- Pages
- Menus
- Orders
- Payment Providers
- Domain

---

# Tech Stack

Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

Backend
- NestJS
- Prisma
- PostgreSQL

Storage
- Cloudflare R2

Authentication
- JWT
- HttpOnly Cookies

---

# Architecture

Frontend

↓

REST API

↓

NestJS

↓

Prisma

↓

PostgreSQL

---

# Multi Store

كل البيانات مرتبطة بالمتجر.

أى Query يجب أن يحتوى على store_id.

لا يسمح بالوصول لبيانات متجر آخر.

---

# Theme Builder

كل متجر يمتلك Theme مستقل.

Theme يتكون من:

- Header
- Footer
- Sections
- Theme Settings
- Colors
- Typography

كل Section تحفظ داخل قاعدة البيانات.

---

# Products

المنتج يتكون من:

Product

↓

Variants

↓

Options

↓

Images

↓

Collections

↓

Tags

لا يوجد Variant بدون Product.

---

# Collections

Collections منفصلة عن Categories.

Collection عبارة عن تجميع للمنتجات.

يمكن أن ينتمى المنتج لأكثر من Collection.

---

# Orders

Order

↓

Order Items

↓

Payment Transaction

↓

Payment Events

↓

Refunds

↓

Webhook Logs

لا يتم تخزين بيانات الدفع داخل Order.

---

# Payment System

كل متجر يستطيع تفعيل أكثر من Payment Provider.

مثال:

- Stripe
- Paymob
- Kashier
- PayPal
- Fawry
- COD

Credentials يتم تشفيرها قبل الحفظ.

---

# API Rules

- لا يتم كتابة SQL مباشرة.
- استخدم Prisma فقط.
- لا يتم عمل Hardcode.
- جميع العمليات مرتبطة بالمتجر.
- جميع IDs من نوع BigInt.
- استخدم DTO و Validation.

---

# Frontend Rules

- استخدم App Router.
- استخدم TypeScript.
- استخدم Server Components عند الإمكان.
- لا تكرر Components.
- جميع الطلبات تمر عبر API Client.

---

# Backend Rules

- Feature-based modules.
- Services تحتوى على Business Logic.
- Controllers لا تحتوى على Logic.
- Validation باستخدام DTO.
- Prisma داخل Service فقط.

---

# Naming Rules

Models:
PascalCase

Files:
kebab-case

Variables:
camelCase

Enums:
PascalCase

Database:
snake_case

---

# Folder Structure

frontend/

backend/

backend/src/

auth/

stores/

products/

collections/

payments/

orders/

theme/

uploads/

users/

---

# Coding Rules

- لا تكسر المعمارية الحالية.
- لا تنقل الملفات إلا إذا كان هناك سبب واضح.
- لا تغير أسماء الجداول بدون Migration.
- لا تضف مكتبات بدون سبب.
- لا تكرر الكود.

---

# Future Features

- Staff
- Roles
- Permissions
- Coupons
- Inventory
- Shipping
- Analytics
- Marketplace Apps
- Email Templates
- Notifications
