# Requirements Document — Auth System (Phase 2)

## Introduction

Fitur **Auth System** menambahkan sistem autentikasi berbasis akun (email + password) pada Lini POS. Sebelumnya autentikasi hanya menggunakan PIN lokal di IndexedDB tanpa identitas server. Phase 2 ini memungkinkan owner mendaftarkan akun, login dari device mana saja, dan data toko otomatis tersinkronisasi.

**Arsitektur akun:**
```
AKUN (email + password)
  └── TOKO (satu toko per akun)
        ├── Owner — login email/password, akses penuh
        ├── Kasir A — PIN lokal
        └── Kasir B — PIN lokal
```

**Scope Phase 2:**
- Register akun baru (email + password + nama toko)
- Login akun di device baru → pull semua data toko otomatis
- Satu akun = satu toko
- Kasir tetap menggunakan PIN lokal (tidak berubah)
- Tanpa verifikasi email untuk saat ini

---

## Glossary

- **Akun**: Entitas autentikasi dengan email unik dan password, dimiliki oleh Owner
- **Owner**: Pemilik toko, login dengan email + password, punya akses penuh
- **Kasir**: Staff toko, login dengan PIN 4 digit lokal, akses terbatas
- **JWT_Token**: Token autentikasi berumur 7 hari yang diterbitkan setelah login email berhasil
- **PIN**: 4 digit angka untuk login kasir lokal, tersimpan sebagai SHA-256 hash di IndexedDB dan MySQL
- **Store_ID**: ID unik toko yang dimiliki satu akun, digunakan untuk isolasi data di server
- **Register**: Proses membuat akun baru dengan email + password
- **Cloud Login**: Login menggunakan email + password ke server, menghasilkan JWT dan pull data toko
- **Local PIN Login**: Login menggunakan PIN ke IndexedDB lokal (flow yang sudah ada, tidak berubah)
- **IndexedDB**: Database lokal browser (primary store, tetap dipakai untuk operasi kasir harian)
- **MySQL_DB**: Database server (cloud store)

---

## Requirements

### Requirement 1: Registrasi Akun Baru

**User Story:** Sebagai owner baru, saya ingin mendaftarkan akun dengan email dan password, sehingga saya dapat mengakses toko saya dari device mana saja.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `POST /auth/register` yang menerima `{ email, password, name }` di request body
2. WHEN endpoint `POST /auth/register` menerima email yang sudah terdaftar, THE API_Server SHALL mengembalikan response `409 Conflict` dengan pesan "Email sudah terdaftar"
3. THE API_Server SHALL memvalidasi format email menggunakan regex standard sebelum menyimpan
4. THE API_Server SHALL memvalidasi password minimum 8 karakter sebelum menyimpan
5. THE API_Server SHALL meng-hash password menggunakan bcrypt dengan cost factor minimum 10 sebelum disimpan ke MySQL
6. WHEN registrasi berhasil, THE API_Server SHALL membuat record di tabel `accounts` (email, passwordHash, name) dan tabel `stores` (storeId terkait akun)
7. WHEN registrasi berhasil, THE API_Server SHALL mengembalikan response `201 Created` dengan `{ token: JWT_Token, accountId, storeId, name }`
8. THE JWT_Token yang diterbitkan saat register SHALL memiliki masa berlaku 7 hari
9. THE Frontend SHALL menyediakan halaman Register dengan field email, password, konfirmasi password, dan nama
10. WHEN password dan konfirmasi password tidak cocok, THE Frontend SHALL menampilkan pesan error sebelum mengirim request ke server
11. WHEN registrasi berhasil, THE Frontend SHALL menyimpan JWT_Token ke localStorage dengan key `linipos-jwt` dan melanjutkan ke Onboarding setup toko

---

### Requirement 2: Login Akun (Cloud Login)

**User Story:** Sebagai owner yang membuka Lini POS di device baru, saya ingin login menggunakan email dan password tanpa perlu setup ulang, sehingga semua data toko saya langsung tersedia.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `POST /auth/login` yang menerima `{ email, password }` di request body
2. WHEN endpoint `POST /auth/login` menerima email yang tidak terdaftar, THE API_Server SHALL mengembalikan response `401 Unauthorized` dengan pesan "Email atau password salah"
3. WHEN endpoint `POST /auth/login` menerima password yang salah, THE API_Server SHALL mengembalikan response `401 Unauthorized` dengan pesan yang sama (tidak membedakan email vs password salah, untuk keamanan)
4. THE API_Server SHALL menerapkan rate limiting 5 request per menit per IP pada endpoint `POST /auth/login`
5. WHEN login berhasil, THE API_Server SHALL mengembalikan response `200 OK` dengan `{ token: JWT_Token, accountId, storeId, name, email }`
6. THE JWT_Token yang diterbitkan SHALL memiliki masa berlaku 7 hari dan mengandung klaim `accountId`, `storeId`, `role: 'owner'`
7. THE Frontend SHALL menyediakan halaman Login dengan field email dan password
8. WHEN login berhasil di Frontend, THE Frontend SHALL menyimpan JWT_Token ke localStorage, lalu memanggil `GET /sync/pull` untuk mengunduh seluruh data toko
9. WHEN data pull selesai, THE Frontend SHALL melakukan upsert data ke IndexedDB (categories, products, suppliers, paymentMethods, variantGroups, variantOptions)
10. AFTER data pull selesai, THE Frontend SHALL mengarahkan user langsung ke Dashboard tanpa melalui Onboarding lagi
11. IF pull data gagal karena error jaringan, THE Frontend SHALL tetap mengarahkan ke Dashboard dengan data lokal yang ada (atau kosong)

---

### Requirement 3: Tampilan Pilihan di Device Baru

**User Story:** Sebagai user yang membuka Lini POS di device baru tanpa data lokal, saya ingin melihat pilihan antara membuat toko baru atau masuk ke akun yang sudah ada, sehingga saya tidak bingung harus mulai dari mana.

#### Acceptance Criteria

1. WHEN user membuka Lini POS di device baru (IndexedDB kosong / onboardingDone = false), THE Frontend SHALL menampilkan layar pilihan dengan dua opsi: "Buat Toko Baru" dan "Masuk ke Akun"
2. WHEN user memilih "Buat Toko Baru", THE Frontend SHALL mengarahkan ke halaman Register
3. WHEN user memilih "Masuk ke Akun", THE Frontend SHALL mengarahkan ke halaman Login (email + password)
4. THE layar pilihan SHALL menampilkan logo Lini POS dan tagline singkat
5. WHEN onboardingDone = true di IndexedDB (toko sudah ada), THE Frontend SHALL langsung menampilkan layar PIN login seperti biasa dan TIDAK menampilkan layar pilihan ini

---

### Requirement 4: Schema Database Akun

**User Story:** Sebagai developer, saya ingin schema database yang mendukung sistem akun multi-user dengan isolasi data per toko.

#### Acceptance Criteria

1. THE MySQL_DB SHALL memiliki tabel `accounts` dengan kolom: `id` (INT UNSIGNED PK), `email` (VARCHAR 255 UNIQUE), `passwordHash` (VARCHAR 255), `name` (VARCHAR 100), `createdAt` (DATETIME), `updatedAt` (DATETIME)
2. THE MySQL_DB SHALL memiliki tabel `stores` dengan kolom: `id` (INT UNSIGNED PK), `accountId` (FK ke accounts.id), `storeName` (VARCHAR 200), `createdAt` (DATETIME)
3. THE tabel `users` yang sudah ada SHALL ditambahkan kolom `storeId` (INT UNSIGNED FK ke stores.id) untuk menghubungkan kasir ke toko tertentu
4. THE API_Server SHALL menyediakan migration script idempoten untuk menambahkan tabel dan kolom baru tanpa merusak data existing
5. THE JWT payload SHALL mengandung `accountId` dan `storeId` sehingga setiap request terautentikasi dapat diidentifikasi kepemilikan datanya

---

### Requirement 5: Keamanan Autentikasi

**User Story:** Sebagai operator sistem, saya ingin autentikasi yang aman sehingga data toko tidak dapat diakses oleh pihak yang tidak berwenang.

#### Acceptance Criteria

1. THE API_Server SHALL menggunakan bcrypt dengan cost factor 12 untuk hashing password
2. THE API_Server SHALL TIDAK menyertakan passwordHash dalam response API mana pun
3. THE JWT_Secret SHALL dibaca dari environment variable dan TIDAK di-hardcode
4. THE Frontend SHALL menyimpan JWT hanya di localStorage (bukan cookie, bukan sessionStorage)
5. WHEN JWT expired (7 hari), THE Frontend SHALL menghapus JWT dari localStorage dan menampilkan layar Login kembali
6. THE API_Server SHALL mengembalikan pesan error yang sama untuk "email tidak ditemukan" dan "password salah" untuk mencegah user enumeration attack
7. THE password di Frontend SHALL menggunakan input type="password" dengan opsi show/hide
8. THE Frontend SHALL TIDAK menyimpan password mentah di state atau localStorage
