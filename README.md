# Ecommerce Platform

منصة SaaS لإنشاء المتاجر الإلكترونية شبيهة بـ Shopify.

---

# Tech Stack

## Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend
- NestJS
- Prisma ORM
- PostgreSQL

---

# Features

## Store Management

- Multi Store
- Custom Domain
- Store Settings
- Store Theme

## Products

- Products
- Variants
- Product Options
- Product Images
- Product Types
- Tags
- Collections

## Theme Builder

- Dynamic Sections
- Header
- Footer
- Homepage Builder
- Live Preview

## Pages

- Custom Pages
- Menus
- Navigation

## Orders

- Order Management
- Order Items
- Order Status
- Payment Status

## Payments

Supported Providers

- Stripe
- Paymob
- Kashier
- PayPal
- Tap
- Fawry
- Bank Transfer
- Cash On Delivery

Architecture

Order

↓

Payment Transaction

↓

Payment Events

↓

Refunds

↓

Webhook Logs

---

# Authentication

- JWT
- HttpOnly Cookies
- Two Factor Authentication
- Device Verification
- Trusted Devices

---

# Project Structure

```
frontend/
backend/
```

---

# Backend

```
backend/src

auth/
stores/
payments/
orders/
products/
collections/
theme/
users/
```

---

# Frontend

```
frontend/app

dashboard/
store/
checkout/
admin/
theme-builder/
```

---

# Database

PostgreSQL

ORM

Prisma

---

# Run

## Backend

```bash
cd backend
npm install
npm run start:dev
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# Environment

Create

```
backend/.env
frontend/.env.local
```

Example variables

```
DATABASE_URL=
JWT_SECRET=
NEXT_PUBLIC_API_URL=
```

---

# Roadmap

- Staff Roles
- Permissions
- Coupons
- Inventory
- Analytics
- Marketplace Apps
- Webhooks
- Email Templates

---

# License

Private
