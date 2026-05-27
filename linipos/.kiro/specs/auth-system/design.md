# Design Document — Auth System (Phase 2)

## Overview

Menambahkan sistem autentikasi berbasis akun (email + password) pada Lini POS. Device baru dapat login dan langsung mendapatkan data toko tanpa setup ulang. Kasir tetap menggunakan PIN lokal untuk operasi harian.

### Design Goals
1. **Zero disruption** — Kasir yang sudah pakai PIN tidak merasakan perubahan
2. **Seamless onboarding** — Device baru: login → data langsung ada
3. **Satu akun, satu toko** — Simple, tidak over-engineer
4. **Offline-first tetap** — IndexedDB masih primary store

---

## Architecture

### Alur Register (Pertama Kali)

```
Device Baru (IndexedDB kosong)
  ↓
Layar Pilihan: "Buat Toko Baru" | "Masuk ke Akun"
  ↓ pilih "Buat Toko Baru"
Halaman Register (email + password + nama)
  ↓ POST /auth/register
Server: buat accounts + stores record, return JWT
  ↓ simpan JWT ke localStorage
Onboarding setup toko (nama toko, alamat, tema)
  ↓ selesai
Dashboard ✅
```

### Alur Login Device Baru

```
Device Baru (IndexedDB kosong)
  ↓
Layar Pilihan → "Masuk ke Akun"
  ↓
Halaman Login (email + password)
  ↓ POST /auth/login
Server: validasi, return JWT + data toko
  ↓ simpan JWT
  ↓ GET /sync/pull → pull semua data
  ↓ upsert ke IndexedDB
Dashboard ✅ (data sudah ada)
```

### Alur Harian (Device Sudah Ada Data)

```
Buka App → IndexedDB ada data → PIN Login (tidak berubah)
  ↓ PIN cocok → masuk app
  ↓ background: syncUser + apiLogin (untuk refresh JWT kalau expired)
```

---

## Database Changes

### Tabel Baru: `accounts`

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255)  NOT NULL,
  passwordHash VARCHAR(255)  NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  createdAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Tabel Baru: `stores`

```sql
CREATE TABLE IF NOT EXISTS stores (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  accountId INT UNSIGNED  NOT NULL,
  storeName VARCHAR(200)  NOT NULL DEFAULT 'Toko Saya',
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_account FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Modifikasi Tabel: `users`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS storeId INT UNSIGNED NULL AFTER role;
ALTER TABLE users ADD INDEX idx_users_storeId (storeId);
```

---

## API Contract

### POST /auth/register

```
Request:
{
  "email": "owner@example.com",
  "password": "minpassword8",
  "name": "Afif Ramadhan"
}

Response 201:
{
  "token": "eyJhbGci...",
  "accountId": 1,
  "storeId": 1,
  "name": "Afif Ramadhan",
  "email": "owner@example.com"
}

Response 409 (email sudah ada):
{ "error": "Email sudah terdaftar" }

Response 400 (validasi gagal):
{ "error": "Password minimal 8 karakter" }
```

### POST /auth/login (email + password — BARU, menggantikan POST /auth/login lama yang pakai PIN)

```
Request:
{
  "email": "owner@example.com",
  "password": "mypassword"
}

Response 200:
{
  "token": "eyJhbGci...",
  "accountId": 1,
  "storeId": 1,
  "name": "Afif Ramadhan",
  "email": "owner@example.com"
}

Response 401:
{ "error": "Email atau password salah" }
```

### POST /auth/login-pin (PIN lokal untuk kasir — endpoint BARU)

```
Request:
{
  "pin": "1234",
  "storeId": 1
}

Response 200:
{
  "token": "eyJhbGci...",
  "userId": 2,
  "name": "Kasir Ahmad",
  "role": "kasir"
}

Response 401:
{ "error": "PIN salah" }
```

### GET /sync/pull (tidak berubah)

JWT sekarang mengandung `storeId`, sehingga server bisa filter data berdasarkan toko.

---

## Frontend Components

### Baru: `src/pages/AuthChoice.tsx`

Layar pilihan untuk device baru:
- Logo Lini POS
- Tombol "Buat Toko Baru" → ke Register
- Tombol "Masuk ke Akun" → ke Login

### Baru: `src/pages/Register.tsx`

Form registrasi:
- Input email
- Input password (dengan show/hide)
- Input konfirmasi password
- Tombol Daftar
- Link ke Login

### Baru: `src/pages/Login.tsx`

Form login email:
- Input email
- Input password (dengan show/hide)
- Tombol Masuk
- Loading state saat pull data
- Link ke Register

### Update: `AppLayout.tsx`

Logika routing:
```
IndexedDB kosong (onboardingDone = false) → AuthChoice
  └── Register → Onboarding → App
  └── Login → pull data → App

IndexedDB ada data (onboardingDone = true) → PinLogin (tidak berubah)
```

### Update: `api-client.ts`

- Fungsi `register(email, password, name)` — POST /auth/register
- Fungsi `loginWithEmail(email, password)` — POST /auth/login
- Fungsi `loginWithPin(pin, storeId)` — POST /auth/login-pin (untuk sync JWT kasir)

---

## JWT Payload

```typescript
// Owner (dari register/login email)
{
  accountId: 1,
  storeId: 1,
  role: 'owner',
  iat: ...,
  exp: ... // 7 hari
}

// Kasir (dari login-pin)
{
  userId: 2,
  storeId: 1,
  role: 'kasir',
  iat: ...,
  exp: ... // 24 jam
}
```

---

## Migration Strategy

File baru: `migrations/002_auth_system.sql`

1. Buat tabel `accounts`
2. Buat tabel `stores`
3. Tambah kolom `storeId` ke tabel `users`

Idempoten — aman dijalankan berulang kali.
