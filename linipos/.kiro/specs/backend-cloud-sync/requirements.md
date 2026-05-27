# Requirements Document

## Introduction

Fitur **Backend + Cloud Sync (Phase 1)** menambahkan layer backend terpusat pada sistem Lini POS yang saat ini berjalan sepenuhnya *client-side*. Backend baru (`linipos-api`) dibangun dengan Node.js + TypeScript + Express dan menggunakan MySQL sebagai database server, di-deploy ke subdomain `api.afiframadhan.my.id` melalui reverse proxy CyberPanel.

Strategi sinkronisasi adalah **offline-first + background push**: IndexedDB tetap menjadi sumber kebenaran utama di perangkat kasir sehingga seluruh operasi POS tetap berjalan tanpa koneksi internet. Setelah setiap operasi sukses di IndexedDB, data secara asinkron di-push ke server (tidak memblokir UI). Saat perangkat kembali online atau user login, data terbaru dapat di-pull dari server. Kasir tidak merasakan perubahan UX apa pun.

**Scope Phase 1:**
- Setup backend `linipos-api` lengkap dengan MySQL schema, autentikasi JWT, endpoint produk, endpoint transaksi, dan endpoint sync pull
- Perubahan minimal pada frontend Lini POS: penambahan `api-client.ts`, background push setelah checkout dan setelah simpan/edit produk, serta sync user saat login

---

## Glossary

- **API_Server**: Aplikasi Node.js + TypeScript + Express yang berjalan di port 3001 pada server, dapat diakses melalui `api.afiframadhan.my.id`
- **Frontend**: Aplikasi React PWA Lini POS yang berjalan di `kasir.afiframadhan.my.id`
- **API_Client**: Modul `api-client.ts` pada Frontend yang mengenkapsulasi semua permintaan HTTP ke API_Server beserta JWT header
- **JWT_Token**: JSON Web Token berumur 24 jam yang diterbitkan oleh API_Server setelah autentikasi PIN berhasil, disimpan di `localStorage` pada Frontend
- **PIN_Hash**: Representasi SHA-256 hex dari PIN 4-digit user, dihasilkan oleh Web Crypto API (`hash-utils.ts`), digunakan sebagai kolom `pin` pada tabel `users` di IndexedDB maupun MySQL
- **IndexedDB**: Database lokal browser `kasirgratisan-db` yang dikelola Dexie.js, berfungsi sebagai *primary store* untuk semua operasi POS
- **MySQL_DB**: Database MySQL di server CyberPanel yang menjadi *cloud store* untuk sinkronisasi data
- **Background_Push**: Proses pengiriman data ke API_Server secara asinkron setelah operasi IndexedDB selesai; kegagalan push tidak memblokir atau membatalkan operasi lokal
- **Sync_Pull**: Proses pengambilan seluruh data dari API_Server ke IndexedDB; digunakan pada perangkat baru atau saat perangkat kembali online setelah offline berkepanjangan
- **Device_ID**: UUID unik per-perangkat yang tersimpan di `storeSettings.deviceId` pada IndexedDB, dikirimkan sebagai header `X-Device-ID` pada setiap request ke API_Server
- **Soft_Delete**: Mekanisme penghapusan logis menggunakan kolom `isDeleted` (0 = aktif, 1 = dihapus) dan `deletedAt` (timestamp), konsisten dengan skema Dexie yang sudah ada
- **Receipt_Number**: Nomor unik transaksi dengan format `TX{timestamp}` (contoh: `TX1703001234567`), dihasilkan di Frontend
- **PM2**: Process manager Node.js yang digunakan untuk menjalankan API_Server di server produksi
- **Owner**: Role user dengan akses penuh ke seluruh fitur POS termasuk manajemen produk dan laporan
- **Kasir**: Role user dengan akses terbatas pada operasi kasir saja

---

## Requirements

### Requirement 1: Setup dan Konfigurasi Backend

**User Story:** Sebagai developer, saya ingin API_Server yang terkonfigurasi dengan baik, sehingga semua endpoint dapat berjalan secara stabil di lingkungan produksi.

#### Acceptance Criteria

1. THE API_Server SHALL menggunakan Node.js dengan TypeScript dikompilasi ke JavaScript sebelum dijalankan di produksi
2. THE API_Server SHALL berjalan pada port 3001 yang dikonfigurasi melalui environment variable `PORT`
3. THE API_Server SHALL membaca konfigurasi database (host, port, user, password, nama database) dari environment variables tanpa nilai default yang hardcoded
4. THE API_Server SHALL membaca konfigurasi JWT secret dari environment variable `JWT_SECRET` tanpa nilai default yang hardcoded
5. WHEN API_Server menerima request dari domain `kasir.afiframadhan.my.id`, THE API_Server SHALL mengizinkan request tersebut melalui header CORS
6. THE API_Server SHALL dikelola oleh PM2 dengan mode `cluster` atau `fork` agar otomatis restart jika terjadi crash
7. THE API_Server SHALL menyediakan endpoint `GET /health` yang mengembalikan status `200 OK` beserta timestamp server untuk keperluan monitoring
8. IF environment variable yang wajib (`DATABASE_URL` atau parameter koneksi MySQL, `JWT_SECRET`) tidak tersedia saat startup, THEN THE API_Server SHALL menghentikan proses dan mencatat error ke stdout

---

### Requirement 2: MySQL Schema

**User Story:** Sebagai developer, saya ingin MySQL schema yang mencerminkan struktur data Dexie.js yang sudah ada, sehingga data dari Frontend dapat disimpan dan diambil secara konsisten.

#### Acceptance Criteria

1. THE MySQL_DB SHALL memiliki tabel `users` dengan kolom: `id`, `name`, `pin` (VARCHAR 64, SHA-256 hex), `role` (ENUM 'owner','kasir'), `isActive` (TINYINT), `createdAt`
2. THE MySQL_DB SHALL memiliki tabel `categories` dengan kolom: `id`, `name`, `color`, `icon`, `createdAt`, `isDeleted` (TINYINT), `deletedAt`
3. THE MySQL_DB SHALL memiliki tabel `products` dengan kolom: `id`, `name`, `sku` (UNIQUE), `categoryId`, `price`, `hpp`, `stock`, `unit`, `photo` (MEDIUMTEXT untuk base64), `description`, `unlimitedStock` (TINYINT), `barcode`, `sortOrder`, `isActive` (TINYINT), `createdAt`, `updatedAt`, `isDeleted` (TINYINT), `deletedAt`
4. THE MySQL_DB SHALL memiliki tabel `suppliers` dengan kolom: `id`, `name`, `phone`, `address`, `notes`, `createdAt`, `isDeleted` (TINYINT), `deletedAt`
5. THE MySQL_DB SHALL memiliki tabel `stockIns` dengan kolom: `id`, `productId`, `supplierId`, `quantity`, `buyPrice`, `totalPrice`, `date`, `notes`
6. THE MySQL_DB SHALL memiliki tabel `stockOuts` dengan kolom: `id`, `productId`, `quantity`, `reason`, `date`, `notes`
7. THE MySQL_DB SHALL memiliki tabel `hppHistory` dengan kolom: `id`, `productId`, `oldHpp`, `newHpp`, `source` (ENUM 'stock_in','manual'), `date`
8. THE MySQL_DB SHALL memiliki tabel `paymentMethods` dengan kolom: `id`, `name`, `category`, `isDefault` (TINYINT), `createdAt`
9. THE MySQL_DB SHALL memiliki tabel `transactions` dengan kolom: `id`, `subtotal`, `discountType` (ENUM 'percentage','nominal', NULLABLE), `discountValue`, `discountAmount`, `total`, `paymentMethodId`, `paymentAmount`, `change`, `profit`, `date`, `receiptNumber` (UNIQUE), `status` (ENUM 'open','completed'), `type` (ENUM 'sale','refund'), `refundOf` (NULLABLE FK), `refundReason`, `orderNumber`, `customerName`, `tableNumber`, `remarks`, `openedAt`, `closedAt`, `userId`, `userName`, `shiftId`
10. THE MySQL_DB SHALL memiliki tabel `transactionItems` dengan kolom: `id`, `transactionId` (FK), `productId`, `productName`, `quantity`, `price`, `hpp`, `discountType` (ENUM NULLABLE), `discountValue`, `discountAmount`, `subtotal`, `notes`, `variantOptionId` (NULLABLE), `variantName`
11. THE MySQL_DB SHALL memiliki tabel `variantGroups` dengan kolom: `id`, `productId` (FK), `name`, `sortOrder`
12. THE MySQL_DB SHALL memiliki tabel `variantOptions` dengan kolom: `id`, `variantGroupId` (FK), `productId` (FK), `name`, `price`, `hpp`, `sortOrder`
13. THE MySQL_DB SHALL memiliki tabel `shifts` dengan kolom: `id`, `userId`, `userName`, `openedAt`, `closedAt` (NULLABLE), `status` (ENUM 'open','closed'), `openingCash`, `notes`
14. THE MySQL_DB SHALL memiliki tabel `storeSettings` dengan kolom: `id`, `storeName`, `address`, `phone`, `receiptFooter`, `onboardingDone` (TINYINT), `lastBackupAt` (NULLABLE), `themeColor`, `logo` (MEDIUMTEXT), `deviceId`
15. THE MySQL_DB SHALL menerapkan foreign key constraint dengan `ON DELETE CASCADE` antara `transactionItems.transactionId` → `transactions.id`
16. THE MySQL_DB SHALL menerapkan foreign key constraint antara `variantOptions.variantGroupId` → `variantGroups.id`
17. THE API_Server SHALL menyediakan migration script SQL yang dapat dijalankan secara idempoten untuk membuat schema dari awal

---

### Requirement 3: Autentikasi

**User Story:** Sebagai kasir atau owner, saya ingin login menggunakan PIN yang sama dengan yang saya gunakan di aplikasi lokal, sehingga saya dapat mengakses API tanpa perlu password tambahan.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `POST /auth/login` yang menerima body JSON `{ "pin": "<4-digit PIN string>" }`
2. WHEN endpoint `POST /auth/login` menerima PIN, THE API_Server SHALL menghitung SHA-256 hex dari PIN tersebut dan membandingkannya dengan kolom `pin` pada tabel `users` di MySQL_DB
3. WHEN PIN cocok dengan salah satu user aktif (`isActive = 1`), THE API_Server SHALL mengembalikan response `200 OK` dengan body `{ "token": "<JWT_Token>", "user": { "id", "name", "role" } }`
4. THE JWT_Token SHALL memiliki masa berlaku 24 jam dan menyertakan klaim `userId`, `role`, dan `deviceId` di dalam payload
5. IF PIN tidak cocok dengan user mana pun atau tidak ada user aktif, THEN THE API_Server SHALL mengembalikan response `401 Unauthorized` dengan body `{ "error": "PIN salah atau user tidak ditemukan" }`
6. IF request body tidak mengandung field `pin` atau `pin` bukan string, THEN THE API_Server SHALL mengembalikan response `400 Bad Request`
7. THE API_Server SHALL menerapkan rate limiting pada endpoint `POST /auth/login` sebesar maksimal 10 request per menit per IP address
8. WHEN request ke endpoint yang memerlukan autentikasi tidak menyertakan header `Authorization: Bearer <JWT_Token>` yang valid, THE API_Server SHALL mengembalikan response `401 Unauthorized`
9. THE API_Server SHALL menyediakan endpoint `POST /auth/sync-user` yang menerima data user (name, pin hash, role, isActive) dan melakukan upsert ke MySQL_DB, untuk keperluan sinkronisasi user baru dari Frontend
10. WHEN endpoint `POST /auth/sync-user` menerima user dengan `pin` yang sudah berformat SHA-256 hex (64 karakter hex), THE API_Server SHALL menyimpan nilai tersebut langsung tanpa hashing ulang

---

### Requirement 4: Manajemen Produk

**User Story:** Sebagai owner, saya ingin data produk yang disimpan atau diubah di perangkat lokal juga tersinkronisasi ke server, sehingga data produk tersedia sebagai backup dan dapat diakses dari perangkat lain.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `GET /products` yang mengembalikan daftar semua produk dengan `isDeleted = 0` dari MySQL_DB dalam format JSON array
2. WHEN endpoint `GET /products` dipanggil dengan query parameter `?includeDeleted=true`, THE API_Server SHALL mengembalikan semua produk termasuk yang `isDeleted = 1`
3. THE API_Server SHALL menyediakan endpoint `POST /products` yang menerima data produk lengkap dan menyimpannya ke MySQL_DB
4. WHEN endpoint `POST /products` menerima produk dengan `sku` yang sudah ada di MySQL_DB, THE API_Server SHALL melakukan update (upsert berdasarkan `sku`) daripada insert duplikat
5. THE API_Server SHALL menyediakan endpoint `PUT /products/:id` yang menerima data produk parsial dan memperbarui rekord yang sesuai di MySQL_DB
6. IF endpoint `PUT /products/:id` menerima `id` yang tidak ditemukan di MySQL_DB, THEN THE API_Server SHALL mengembalikan response `404 Not Found`
7. WHEN endpoint `PUT /products/:id` menerima field `isDeleted: 1`, THE API_Server SHALL mengisi kolom `deletedAt` dengan timestamp saat ini
8. THE API_Server SHALL menyediakan endpoint `POST /products/batch` yang menerima array produk dan melakukan upsert massal ke MySQL_DB dalam satu transaksi database
9. IF salah satu item dalam batch `POST /products/batch` gagal validasi, THEN THE API_Server SHALL mengembalikan response `400 Bad Request` beserta detail item yang gagal, tanpa melakukan perubahan apa pun ke MySQL_DB
10. WHILE request ke endpoint produk menyertakan `Authorization: Bearer <JWT_Token>` yang valid, THE API_Server SHALL memproses request tersebut
11. IF request ke endpoint produk tidak menyertakan JWT_Token yang valid, THEN THE API_Server SHALL mengembalikan response `401 Unauthorized`

---

### Requirement 5: Sinkronisasi Transaksi

**User Story:** Sebagai owner, saya ingin setiap transaksi checkout yang berhasil di kasir juga terkirim ke server secara otomatis di background, sehingga data penjualan tersimpan di cloud sebagai backup.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `POST /transactions` yang menerima data transaksi lengkap beserta array `items` (TransactionItemRecords) dalam satu request
2. WHEN endpoint `POST /transactions` menerima transaksi dengan `receiptNumber` yang sudah ada di MySQL_DB, THE API_Server SHALL melakukan update (upsert berdasarkan `receiptNumber`) daripada insert duplikat
3. WHEN endpoint `POST /transactions` menerima transaksi dengan tipe `refund`, THE API_Server SHALL memvalidasi bahwa `refundOf` merujuk ke `receiptNumber` transaksi yang ada di MySQL_DB
4. IF validasi `refundOf` gagal karena transaksi asal belum ada di server, THEN THE API_Server SHALL tetap menyimpan transaksi refund tersebut dengan catatan `refundOf` yang disediakan, tanpa mengembalikan error
5. THE API_Server SHALL menyimpan `transactionItems` secara atomik bersama `transaction` dalam satu database transaction
6. IF database transaction gagal di tengah jalan, THEN THE API_Server SHALL melakukan rollback dan mengembalikan response `500 Internal Server Error`
7. WHEN endpoint `POST /transactions` berhasil, THE API_Server SHALL mengembalikan response `201 Created` dengan body `{ "id": <server_id>, "receiptNumber": "<Receipt_Number>" }`
8. THE API_Server SHALL menyediakan endpoint `GET /transactions` yang mengembalikan daftar transaksi dengan status `completed` dalam format JSON, mendukung filter query parameter `?from=<ISO date>&to=<ISO date>`

---

### Requirement 6: Sync Pull

**User Story:** Sebagai kasir pada perangkat baru atau setelah offline berkepanjangan, saya ingin mengunduh semua data terkini dari server ke IndexedDB, sehingga perangkat saya siap digunakan tanpa perlu input ulang data produk dan konfigurasi.

#### Acceptance Criteria

1. THE API_Server SHALL menyediakan endpoint `GET /sync/pull` yang mengembalikan snapshot lengkap semua data aktif dari MySQL_DB dalam satu response JSON
2. THE response dari `GET /sync/pull` SHALL mengandung kunci-kunci berikut: `categories`, `products`, `suppliers`, `paymentMethods`, `variantGroups`, `variantOptions`, `storeSettings`, dan `users` (tanpa field `pin`)
3. WHEN endpoint `GET /sync/pull` dipanggil dengan query parameter `?since=<ISO timestamp>`, THE API_Server SHALL hanya mengembalikan rekord yang `updatedAt` atau `createdAt`-nya lebih baru dari timestamp tersebut
4. THE API_Client SHALL menyimpan timestamp terakhir sync pull di `localStorage` dengan key `linipos-last-sync` dan mengirimkannya sebagai parameter `since` pada sync pull berikutnya
5. THE API_Server SHALL menyertakan field `serverTimestamp` (ISO 8601) dalam response `GET /sync/pull` yang Frontend gunakan untuk memperbarui `linipos-last-sync`
6. IF JWT_Token pada request `GET /sync/pull` tidak valid atau tidak ada, THEN THE API_Server SHALL mengembalikan response `401 Unauthorized`
7. WHEN response `GET /sync/pull` diterima oleh Frontend, THE API_Client SHALL melakukan upsert (bukan replace) ke IndexedDB untuk setiap entitas yang diterima, menggunakan primary key masing-masing tabel

---

### Requirement 7: API Client Frontend

**User Story:** Sebagai developer Frontend, saya ingin modul `api-client.ts` yang terpusat dan konsisten, sehingga semua komunikasi dengan API_Server dapat dikelola dari satu tempat tanpa mengubah logika bisnis yang sudah ada.

#### Acceptance Criteria

1. THE API_Client SHALL menyediakan fungsi `pushTransaction(tx: Transaction, items: TransactionItemRecord[])` yang mengirimkan data ke `POST /transactions` secara asinkron
2. THE API_Client SHALL menyediakan fungsi `pushProduct(product: Product)` yang mengirimkan data ke `POST /products` atau `PUT /products/:id` secara asinkron
3. THE API_Client SHALL menyediakan fungsi `syncUser(user: User)` yang mengirimkan data user ke `POST /auth/sync-user` secara asinkron
4. THE API_Client SHALL menyediakan fungsi `pullSync(since?: string)` yang memanggil `GET /sync/pull` dan mengembalikan data sync
5. WHEN API_Client melakukan request, THE API_Client SHALL selalu menyertakan header `Authorization: Bearer <JWT_Token>` jika JWT_Token tersedia di `localStorage`
6. WHEN API_Client melakukan request, THE API_Client SHALL selalu menyertakan header `X-Device-ID` dengan nilai `storeSettings.deviceId` dari IndexedDB
7. IF request ke API_Server gagal dengan error jaringan (network error, timeout), THEN THE API_Client SHALL mencatat log error ke `console.error` tanpa melempar exception ke caller
8. IF request ke API_Server mengembalikan response `401 Unauthorized`, THEN THE API_Client SHALL menghapus JWT_Token dari `localStorage` tanpa mengganggu sesi IndexedDB
9. THE API_Client SHALL menggunakan URL base API yang dikonfigurasi dari environment variable Vite (`VITE_API_URL`) dengan fallback ke `https://api.afiframadhan.my.id`
10. THE API_Client SHALL memiliki timeout request sebesar 10 detik; WHEN request melebihi 10 detik, THE API_Client SHALL membatalkan request dan mencatat log timeout

---

### Requirement 8: Integrasi Background Push di Frontend

**User Story:** Sebagai kasir, saya ingin data transaksi dan perubahan produk otomatis tersinkronisasi ke server di background setelah setiap operasi berhasil, sehingga cloud backup terjadi tanpa intervensi manual dan tanpa memperlambat alur kasir.

#### Acceptance Criteria

1. WHEN `handleCheckout` pada halaman Cashier berhasil menyimpan transaksi ke IndexedDB, THE Frontend SHALL memanggil `API_Client.pushTransaction()` secara asinkron tanpa `await` pada jalur utama
2. WHEN fungsi simpan atau edit produk pada halaman Products berhasil memperbarui data di IndexedDB, THE Frontend SHALL memanggil `API_Client.pushProduct()` secara asinkron tanpa `await` pada jalur utama
3. WHEN user berhasil login melalui `AuthContext.login()` dan user tersebut belum ada di server, THE Frontend SHALL memanggil `API_Client.syncUser()` secara asinkron tanpa `await` pada jalur utama
4. IF `API_Client.pushTransaction()` gagal, THEN THE Frontend SHALL mencatat error ke `console.error` tanpa menampilkan notifikasi error kepada kasir dan tanpa membatalkan transaksi yang sudah tersimpan di IndexedDB
5. IF `API_Client.pushProduct()` gagal, THEN THE Frontend SHALL mencatat error ke `console.error` tanpa menampilkan notifikasi error kepada user dan tanpa membatalkan perubahan produk yang sudah tersimpan di IndexedDB
6. THE Frontend SHALL TIDAK menampilkan indikator loading, spinner, atau perubahan UI apa pun yang berkaitan dengan proses Background_Push kepada kasir
7. WHEN perangkat dalam status offline (tidak ada koneksi internet), THE API_Client SHALL gagal dengan network error secara silent sesuai dengan kriteria 4 dan 5 di atas
8. THE Frontend SHALL TIDAK memodifikasi alur checkout, alur simpan produk, atau alur login yang sudah ada; Background_Push ditambahkan sebagai fire-and-forget setelah operasi lokal selesai

---

### Requirement 9: Keamanan dan Validasi

**User Story:** Sebagai operator sistem, saya ingin API_Server yang aman dan memvalidasi semua input, sehingga data di MySQL_DB terlindungi dari input tidak valid dan akses tidak sah.

#### Acceptance Criteria

1. THE API_Server SHALL memvalidasi tipe dan keberadaan field wajib pada setiap endpoint sebelum menyentuh MySQL_DB
2. IF request body mengandung field yang tidak dikenali (extra fields), THEN THE API_Server SHALL mengabaikan field tersebut tanpa mengembalikan error
3. THE API_Server SHALL menggunakan parameterized query atau ORM prepared statement untuk semua operasi MySQL_DB guna mencegah SQL injection
4. THE API_Server SHALL mengembalikan response `400 Bad Request` dengan pesan deskriptif WHEN request body gagal validasi
5. THE API_Server SHALL TIDAK menyertakan stack trace atau detail internal error dalam response yang dikirim ke client di lingkungan produksi
6. THE API_Server SHALL mencatat semua error internal ke stdout/stderr untuk dibaca oleh PM2 log
7. WHEN JWT_Token yang diterima sudah kedaluwarsa, THE API_Server SHALL mengembalikan response `401 Unauthorized` dengan body `{ "error": "Token kedaluwarsa" }`
8. THE API_Server SHALL menggunakan HTTPS karena SSL ditangani oleh Cloudflare dan CyberPanel di depan Node.js; THE API_Server sendiri berjalan di HTTP pada port 3001 (plain, tidak perlu TLS di level aplikasi)

---

### Requirement 10: Deployment dan Operasional

**User Story:** Sebagai operator sistem, saya ingin API_Server dapat di-deploy dan dimonitor dengan mudah di server KVM + CyberPanel yang sudah ada, sehingga tidak diperlukan infrastruktur tambahan.

#### Acceptance Criteria

1. THE API_Server SHALL dikemas dalam project Node.js terpisah (`linipos-api`) dengan `package.json` yang mencantumkan semua dependency secara eksplisit dengan versi pinned
2. THE API_Server SHALL menyertakan file `ecosystem.config.js` atau `ecosystem.config.cjs` untuk konfigurasi PM2 yang mencantumkan nama aplikasi `linipos-api`, script entry point, dan environment variables
3. THE API_Server SHALL menyertakan file `deploy.sh` atau dokumentasi langkah-langkah deployment manual yang mencakup: install dependency, build TypeScript, jalankan migration SQL, dan start/restart PM2
4. THE API_Server SHALL menyertakan file `.env.example` yang mendaftar semua environment variable yang diperlukan beserta deskripsinya, tanpa nilai sensitif
5. WHEN PM2 memantau API_Server dan proses crash, PM2 SHALL secara otomatis merestart API_Server
6. THE API_Server SHALL menghasilkan log akses minimal (method, path, status code, response time) ke stdout dalam format yang dapat dibaca PM2
7. WHEN subdomain `api.afiframadhan.my.id` menerima request HTTPS dari Cloudflare, CyberPanel SHALL meneruskan request tersebut ke `localhost:3001` melalui reverse proxy; THE API_Server tidak perlu menangani SSL termination

