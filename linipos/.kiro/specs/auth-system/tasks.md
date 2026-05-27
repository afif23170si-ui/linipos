# Implementation Plan — Auth System (Phase 2)

## Overview

Implementasi sistem autentikasi email + password untuk Lini POS. Terdiri dari tiga grup: (1) backend — migration schema + endpoint auth baru; (2) frontend — halaman Register, Login, AuthChoice; (3) integrasi — update AppLayout dan api-client.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4"] },
    { "wave": 4, "tasks": ["5"] },
    { "wave": 5, "tasks": ["6", "7", "8"] },
    { "wave": 6, "tasks": ["9"] }
  ]
}
```

## Tasks

- [x] 1. Migration script schema baru
  - Buat `migrations/002_auth_system.sql` di `linipos-api`
  - Tabel `accounts`: id, email (UNIQUE), passwordHash, name, createdAt, updatedAt
  - Tabel `stores`: id, accountId (FK ke accounts), storeName, createdAt, updatedAt
  - Alter tabel `users`: tambah kolom `storeId` (INT UNSIGNED NULL, FK ke stores.id)
  - Jalankan migration di server: `source .env && mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < migrations/002_auth_system.sql`
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 2. Install bcrypt di backend
  - Install dependency: `npm install bcrypt@5.1.1` dan `npm install -D @types/bcrypt@5.0.2` di folder `linipos-api`
  - Verifikasi package.json terupdate
  - _Requirements: 5.1_

- [x] 3. Endpoint POST /auth/register
  - Buat `src/schemas/account.schemas.ts` dengan Zod schema untuk RegisterRequest (email, password min 8, name)
  - Di `src/routes/auth.ts`, tambahkan endpoint `POST /auth/register`:
    - Validasi input dengan Zod
    - Cek email duplikat di tabel `accounts`
    - Hash password dengan bcrypt (cost 12)
    - Insert ke tabel `accounts`, lalu insert ke tabel `stores` dengan accountId
    - Generate JWT (exp 7d) dengan payload `{ accountId, storeId, role: 'owner' }`
    - Return `201 { token, accountId, storeId, name, email }`
  - _Requirements: 1.1–1.8_

- [x] 4. Endpoint POST /auth/login (email + password)
  - Ganti endpoint `POST /auth/login` yang lama (pakai PIN) menjadi login email+password
  - Buat endpoint `POST /auth/login-pin` untuk menggantikan fungsi PIN login lama
  - `POST /auth/login`: terima `{ email, password }`, validasi bcrypt, return JWT (exp 7d) dengan `{ accountId, storeId, role: 'owner' }`
  - `POST /auth/login-pin`: terima `{ pin, storeId }`, query users dengan storeId + pin match, return JWT (exp 24h) dengan `{ userId, storeId, role }`
  - Terapkan rate limiting 5 req/menit pada POST /auth/login
  - _Requirements: 2.1–2.6, 5.3, 5.6_

- [ ] 5. Rebuild dan deploy backend
  - `cd /home/liniposapi/linipos-api && npm run build`
  - Jalankan migration 002: `source .env && mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < migrations/002_auth_system.sql`
  - `pm2 restart linipos-api --update-env`
  - Test: `curl -X POST https://api.afiframadhan.my.id/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"password123","name":"Test"}'`
  - _Requirements: 1.1, 2.1_

- [ ] 6. Halaman AuthChoice, Register, Login di frontend
  - Buat `src/pages/AuthChoice.tsx`: logo Lini POS + dua tombol "Buat Toko Baru" (→ /register) dan "Masuk ke Akun" (→ /login)
  - Buat `src/pages/Register.tsx`: form email + password + konfirmasi password, panggil `api.register()`, simpan JWT, redirect ke Onboarding
  - Buat `src/pages/Login.tsx`: form email + password, panggil `api.loginWithEmail()`, simpan JWT, panggil `syncFromServer()`, redirect ke app
  - Semua halaman harus responsive dan konsisten dengan design system shadcn/ui yang sudah ada
  - _Requirements: 1.9–1.11, 2.7–2.11, 3.1–3.5_

- [ ] 7. Update api-client.ts di frontend
  - Tambah fungsi `register(email, password, name)` → POST /auth/register, simpan JWT
  - Tambah fungsi `loginWithEmail(email, password)` → POST /auth/login, simpan JWT
  - Update fungsi `syncUser` untuk kirim ke POST /auth/login-pin (bukan /auth/login lagi)
  - Update `apiLogin` untuk pakai `loginWithEmail` (atau hapus kalau tidak relevan)
  - _Requirements: 2.8, 2.9_

- [ ] 8. Update AppLayout.tsx routing logic
  - Import AuthChoice, Register, Login page
  - Ubah kondisi routing:
    - `onboardingDone = false` DAN `JWT tidak ada` → tampilkan `<AuthChoice />`
    - `onboardingDone = false` DAN `JWT ada` → tampilkan `<Onboarding />` (baru register, belum setup toko)
    - `onboardingDone = true` DAN `userCount = 0` → tampilkan `<SetupOwnerPin />`
    - `onboardingDone = true` DAN `!isLoggedIn` → tampilkan `<PinLogin />` (tidak berubah)
  - Tambahkan route `/register` dan `/login` di App.tsx (atau render inline di AppLayout)
  - _Requirements: 3.1–3.5_

- [x] 9. Build dan deploy frontend
  - `cd /Applications/MAMP/htdocs/linipos && npm run build`
  - Upload ke server: `scp -P 5903 -r dist/* kvm1@103.145.240.110:/home/kvm1/`
  - Di server: `cp -r /home/kvm1/* /home/afiframadhan.my.id/public_html/kasir/`
  - Test end-to-end: buka kasir.afiframadhan.my.id di incognito → pilih "Buat Toko Baru" → register → setup toko → logout → buka di device lain → "Masuk ke Akun" → login → data muncul
  - _Requirements: semua_
