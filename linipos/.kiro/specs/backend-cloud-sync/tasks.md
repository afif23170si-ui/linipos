# Implementation Plan

## Overview

Implementasi fitur **Backend Cloud Sync Phase 1** untuk Lini POS. Terdiri dari tiga grup pekerjaan utama: (1) membangun backend `linipos-api` dari awal meliputi project setup, konfigurasi, schema database, dan middleware; (2) mengimplementasikan seluruh API routes (auth, products, transactions, sync pull, health check); dan (3) mengintegrasikan background push ke frontend melalui `api-client.ts` dan fire-and-forget calls di komponen yang ada.

Strategi sync adalah offline-first: IndexedDB tetap sebagai primary store, server menerima push di background tanpa memblokir UI kasir.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5", "6", "7", "8"] },
    { "wave": 6, "tasks": ["9"] },
    { "wave": 7, "tasks": ["10"] },
    { "wave": 8, "tasks": ["11", "12", "13"] }
  ]
}
```

## Tasks

- [x] 1. Setup project `linipos-api`
  - Buat folder `linipos-api/` di luar root proyek Lini POS
  - Inisialisasi `package.json` dengan `npm init`, tambahkan dependency pinned: `express@4.x`, `mysql2`, `jsonwebtoken`, `zod`, `express-rate-limit`, `cors`, dan devDependency: `typescript@5.x`, `@types/express`, `@types/node`, `@types/jsonwebtoken`, `ts-node`, `tsx`
  - Buat `tsconfig.json` dengan `target: ES2022`, `module: CommonJS`, `outDir: dist`, `strict: true`, `rootDir: src`
  - Buat `src/index.ts` sebagai entry point Express skeleton (buat app, listen di `PORT`)
  - Tambahkan scripts di `package.json`: `build`, `start` (jalankan `dist/index.js`), `dev` (tsx watch)
  - Buat struktur folder: `src/middleware/`, `src/routes/`, `src/schemas/`, `src/types/`, `migrations/`
  - _Requirements: 1.1, 1.2, 10.1_

- [x] 2. Konfigurasi environment dan database connection
  - Buat `src/config.ts` yang membaca semua env vars (`PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`) dan melempar error jika ada yang tidak tersedia saat startup
  - Buat `src/db.ts` sebagai singleton mysql2 connection pool menggunakan `config.ts`; ekspor fungsi `query()` berbasis prepared statement
  - Buat `.env.example` yang mendaftar semua env vars yang diperlukan beserta deskripsi, tanpa nilai sensitif
  - Pastikan `src/index.ts` mengimpor `config.ts` paling awal sebelum modul lain, sehingga validasi env berjalan di startup
  - _Requirements: 1.3, 1.4, 1.8, 10.4_

- [x] 3. MySQL migration script
  - Buat `migrations/001_initial_schema.sql` yang idempoten (`CREATE TABLE IF NOT EXISTS`) untuk seluruh 14 tabel: `users`, `categories`, `products`, `suppliers`, `stockIns`, `stockOuts`, `hppHistory`, `paymentMethods`, `transactions`, `transactionItems`, `variantGroups`, `variantOptions`, `shifts`, `storeSettings`
  - Pastikan kolom sesuai design: `pin` VARCHAR(64), boolean menggunakan `TINYINT(1)`, foto menggunakan `MEDIUMTEXT`, ENUM untuk field terbatas
  - Tambahkan foreign key `transactionItems.transactionId → transactions.id ON DELETE CASCADE`
  - Tambahkan foreign key `variantOptions.variantGroupId → variantGroups.id ON DELETE CASCADE`
  - Tambahkan index yang relevan pada kolom yang sering di-query (`isDeleted`, `sku`, `receiptNumber`, `date`, dsb.)
  - Dokumentasikan cara menjalankan migration di `deploy.sh` (`mysql -u ... < migrations/001_initial_schema.sql`)
  - _Requirements: 2.1–2.17_

- [x] 4. Middleware stack
  - Buat `src/middleware/requestLogger.ts`: log method, path, status code, dan response time ke stdout untuk setiap request
  - Buat `src/middleware/auth.ts`: verifikasi JWT dari header `Authorization: Bearer <token>`, set `req.user` (userId, role, deviceId), kembalikan `401` jika token tidak ada atau tidak valid; skip untuk path `/auth/*` dan `/health`
  - Buat `src/middleware/validate.ts`: factory function `validate(schema: ZodSchema)` yang memvalidasi `req.body` dengan Zod, kembalikan `400` dengan pesan deskriptif jika gagal; abaikan field ekstra (`strip()`)
  - Buat `src/types/express.d.ts`: augment `Express.Request` dengan field `user: { userId: number; role: string; deviceId: string }`
  - Pasang middleware di `src/index.ts` dalam urutan: `requestLogger` → `cors` (izinkan `kasir.afiframadhan.my.id`) → `express.json({ limit: '10mb' })` → `authMiddleware`
  - Tambahkan global error handler di `src/index.ts`: tangkap semua error yang tidak tertangani, log ke stdout, kembalikan `500` tanpa stack trace di produksi
  - _Requirements: 1.5, 3.8, 9.1, 9.2, 9.4, 9.5, 9.6_

- [x] 5. Auth routes
  - Buat `src/schemas/auth.schemas.ts`: Zod schema untuk `LoginRequest` (`pin: z.string().min(1)`) dan `SyncUserRequest` (`name`, `pin` hex 64 char, `role` enum, `isActive`)
  - Buat `src/routes/auth.ts` dengan dua endpoint:
    - `POST /auth/login`: hash PIN dengan `crypto.createHash('sha256')`, query MySQL untuk user aktif, generate JWT (`userId`, `role`, `deviceId`, exp 24h), kembalikan `{ token, user }`; terapkan `express-rate-limit` 10 req/menit per IP khusus endpoint ini
    - `POST /auth/sync-user`: terima data user dengan PIN yang sudah di-hash (64 char hex), lakukan upsert ke tabel `users`, kembalikan data user tersimpan
  - Mount router di `src/index.ts` pada prefix `/auth`
  - _Requirements: 3.1–3.10_

- [x] 6. Products routes
  - Buat `src/schemas/product.schemas.ts`: Zod schema untuk `ProductUpsert` (semua field produk, field opsional diberi `.optional()` atau `.nullable()`)
  - Buat `src/routes/products.ts` dengan empat endpoint:
    - `GET /products`: query semua produk `isDeleted = 0`; jika `?includeDeleted=true` kembalikan semua
    - `POST /products`: upsert berdasarkan `sku` menggunakan `INSERT ... ON DUPLICATE KEY UPDATE`, kembalikan `{ id, sku }` dengan status `201`
    - `PUT /products/:id`: update parsial produk berdasarkan `id`; jika `isDeleted: 1` diterima, set `deletedAt = NOW()`; kembalikan `404` jika tidak ditemukan
    - `POST /products/batch`: terima array produk, jalankan upsert massal dalam satu MySQL transaction; rollback semua jika ada satu item gagal validasi; kembalikan `{ upserted, failed }` atau `400` dengan `failedItems`
  - Semua endpoint dilindungi `authMiddleware`
  - Mount router di `src/index.ts` pada prefix `/products`
  - _Requirements: 4.1–4.11_

- [x] 7. Transactions routes
  - Buat `src/schemas/transaction.schemas.ts`: Zod schema untuk `TransactionCreate` (semua field transaksi + `items: z.array(TransactionItemSchema).min(1)`)
  - Buat `src/routes/transactions.ts` dengan dua endpoint:
    - `POST /transactions`: upsert berdasarkan `receiptNumber`; simpan transaksi dan semua `items` secara atomik dalam satu MySQL transaction; jika DB transaction gagal, rollback dan kembalikan `500`; kembalikan `{ id, receiptNumber }` dengan status `201`; untuk tipe `refund`, simpan `refundOf` apa adanya tanpa validasi keberadaan transaksi asal
    - `GET /transactions`: query transaksi `status = completed`; dukung filter `?from=<ISO>&to=<ISO>` pada kolom `date`; embed `items` di setiap transaksi
  - Semua endpoint dilindungi `authMiddleware`
  - Mount router di `src/index.ts` pada prefix `/transactions`
  - _Requirements: 5.1–5.8_

- [x] 8. Sync pull route
  - Buat `src/routes/sync.ts` dengan satu endpoint:
    - `GET /sync/pull`: query semua entitas aktif dari MySQL (`categories`, `products`, `suppliers`, `paymentMethods`, `variantGroups`, `variantOptions`, `storeSettings`, `users` — tanpa field `pin`); jika parameter `?since=<ISO timestamp>` disediakan, filter dengan `WHERE updatedAt > :since OR createdAt > :since`; sertakan `serverTimestamp` (ISO 8601 saat ini) di response
  - Endpoint dilindungi `authMiddleware`; kembalikan `401` jika token tidak valid
  - Mount router di `src/index.ts` pada prefix `/sync`
  - _Requirements: 6.1–6.6_

- [x] 9. Health check, global error handler, dan deployment files
  - Tambahkan endpoint `GET /health` di `src/index.ts` (tanpa auth) yang mengembalikan `{ status: "ok", timestamp: <ISO> }`
  - Pastikan global error handler sudah terpasang di akhir `src/index.ts` setelah semua routes
  - Buat `ecosystem.config.cjs` untuk PM2: nama app `linipos-api`, script entry `dist/index.js`, mode `fork`, dengan env vars template
  - Buat `deploy.sh`: langkah-langkah `npm install`, `npm run build`, jalankan migration SQL, `pm2 restart linipos-api` atau `pm2 start ecosystem.config.cjs`
  - Verifikasi semua endpoint terpasang dan backend dapat di-build (`npm run build`) tanpa TypeScript error
  - _Requirements: 1.6, 1.7, 9.5, 9.6, 10.2, 10.3, 10.6, 10.7_

- [x] 10. Buat `src/lib/api-client.ts` di frontend
  - Buat file `src/lib/api-client.ts` di proyek Lini POS (bukan `linipos-api`)
  - Definisikan `API_BASE` dari `import.meta.env.VITE_API_URL` dengan fallback ke `https://api.afiframadhan.my.id`
  - Implementasikan helper internal `getJwt()` (baca dari `localStorage`) dan `getDeviceId()` (baca `storeSettings.deviceId` dari Dexie)
  - Implementasikan `pushTransaction(tx: Transaction, items: TransactionItemRecord[]): Promise<void>` — fire-and-forget: serialize data, kirim ke `POST /transactions`, tangkap semua error dengan `try-catch`, log ke `console.error`, tidak pernah throw ke caller; hapus JWT jika response `401`
  - Implementasikan `pushProduct(product: Product): Promise<void>` — fire-and-forget: kirim ke `POST /products` (upsert by SKU), pola error sama
  - Implementasikan `syncUser(user: User): Promise<void>` — fire-and-forget: kirim ke `POST /auth/sync-user`, pola error sama
  - Implementasikan `pullSync(since?: string): Promise<SyncPullResult | null>` — panggil `GET /sync/pull?since=...`, pada sukses simpan `serverTimestamp` ke `localStorage` key `linipos-last-sync`, kembalikan data atau `null` jika error
  - Implementasikan `login(pin: string): Promise<{ token, user } | null>` — kirim ke `POST /auth/login`, simpan JWT ke `localStorage` key `linipos-jwt`, kembalikan data atau `null`
  - Semua request menggunakan `AbortController` dengan timeout 10 detik
  - _Requirements: 7.1–7.10_

- [x] 11. Integrasi background push di `Cashier.tsx`
  - Buka `src/pages/Cashier.tsx` (atau path yang relevan) dan temukan fungsi `handleCheckout`
  - Setelah baris `db.transactions.add(...)` berhasil (dan receipt sudah ditampilkan), tambahkan satu baris `pushTransaction(savedTx, cartItems)` — tanpa `await`, tanpa `try-catch` tambahan (sudah ditangani `api-client.ts`)
  - Pastikan import `pushTransaction` dari `@/lib/api-client` ditambahkan di bagian atas file
  - Tidak ada perubahan pada alur checkout, loading state, atau UI yang sudah ada
  - _Requirements: 8.1, 8.4, 8.6, 8.7, 8.8_

- [x] 12. Integrasi background push di `Products.tsx`
  - Buka halaman manajemen produk (temukan file yang menangani simpan/edit produk)
  - Setelah operasi `db.products.add(...)` atau `db.products.put(...)` berhasil, tambahkan `pushProduct(savedProduct)` — tanpa `await`
  - Pastikan import `pushProduct` dari `@/lib/api-client` ditambahkan di bagian atas file
  - Tidak ada perubahan pada alur simpan/edit produk, toast notifikasi, atau UI yang sudah ada
  - _Requirements: 8.2, 8.5, 8.6, 8.7, 8.8_

- [x] 13. Integrasi `syncUser` di `auth-context.tsx`
  - Buka `src/contexts/auth-context.tsx` (atau file AuthContext yang relevan)
  - Di dalam fungsi `login()`, setelah `db.users` berhasil ditemukan/diverifikasi dan state auth diset, tambahkan `syncUser(loggedInUser)` — tanpa `await`
  - Pastikan import `syncUser` dari `@/lib/api-client` ditambahkan di bagian atas file
  - Tidak ada perubahan pada alur login, PIN verification, atau state management yang sudah ada
  - _Requirements: 8.3, 8.6, 8.7, 8.8_

## Notes

- Task 1–9 sepenuhnya berada di project `linipos-api` (backend baru, terpisah dari repo frontend)
- Task 10–13 berada di project Lini POS frontend yang sudah ada
- Backend harus sudah bisa di-build dan di-deploy sebelum integrasi frontend dimulai (task 9 selesai sebelum task 10)
- Semua fungsi di `api-client.ts` bersifat fire-and-forget — kegagalan jaringan tidak boleh mempengaruhi UX kasir
- Migration SQL bersifat idempoten sehingga aman dijalankan berulang kali di lingkungan produksi
- SSL ditangani Cloudflare + CyberPanel; backend Node.js berjalan di plain HTTP `localhost:3001`
