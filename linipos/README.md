# Lini POS

Sistem **Point of Sale (POS)** berbasis web yang dirancang untuk keandalan production-grade — offline-first, real-time, dan multi-tenant. Dibangun di atas stack modern (React + TypeScript + IndexedDB + Express + MySQL + Socket.IO) dengan arsitektur yang skalabel menuju platform **ERP** penuh.

Data operasional tersimpan secara lokal di perangkat via IndexedDB sehingga sistem tetap berjalan tanpa koneksi internet. Backend API opsional mengaktifkan sinkronisasi real-time antar perangkat, manajemen akun multi-toko, dan fondasi integrasi sistem yang lebih luas.

---

## ✨ Fitur

### Kasir & Transaksi
- **Kasir (POS)** — Antarmuka kasir lengkap dengan keranjang belanja, diskon per-item & per-transaksi, pilihan metode pembayaran, dan perhitungan kembalian otomatis
- **Split Bill** — Pembayaran dibagi ke beberapa metode sekaligus (contoh: sebagian tunai + sebagian QRIS)
- **Open Bill** — Simpan transaksi sebagai tagihan terbuka untuk di-checkout nanti, dengan nama pelanggan, nomor meja, dan catatan
- **Scan Barcode** — Scan barcode produk via kamera (EAN-13, EAN-8, UPC-A, UPC-E, Code-128, QR) atau input keyboard manual
- **Refund / Retur** — Proses pengembalian barang dengan alasan retur dan pemulihan stok otomatis
- **Riwayat Transaksi** — Telusuri transaksi selesai dan open bill dengan filter tab

### Manajemen Produk & Stok
- **Manajemen Produk** — CRUD lengkap dengan kategori, SKU unik, satuan, foto, barcode, deskripsi, dan pengurutan manual (drag-and-drop)
- **Varian Produk** — Tambah grup varian dan opsi per produk (contoh: Ukuran → 16oz / 22oz, Suhu → Hot / Iced)
- **Stok Masuk** — Penerimaan stok dari supplier dengan perhitungan HPP otomatis
- **Stok Keluar** — Pencatatan stok keluar (rusak, hilang, retur, dll.)
- **HPP Otomatis (Weighted Average)** — HPP dihitung ulang otomatis setiap stok masuk menggunakan metode rata-rata tertimbang
- **Produk Aktif/Nonaktif** — Sembunyikan produk dari kasir tanpa menghapusnya
- **Laporan Stok** — Rekap mutasi stok masuk dan keluar per produk

### Laporan & Analitik
- **Laporan Penjualan** — Statistik ringkas (total penjualan, laba, jumlah transaksi, rata-rata nilai transaksi)
- **Laba Rugi (P&L)** — Pendapatan kotor → diskon → retur → HPP → laba kotor + margin %
- **Grafik Tren** — Grafik per-jam (hari ini/kemarin) atau per-hari (periode lain)
- **Metode Pembayaran** — Breakdown penerimaan berdasarkan metode bayar + donut chart
- **Produk Terlaris** — Top 5 produk berdasarkan omzet
- **Per Kategori** — Breakdown penjualan per kategori dan per produk di dalamnya
- **Filter Fleksibel** — Filter laporan: hari ini, kemarin, minggu ini/lalu, bulan ini/lalu, tahun ini, rentang kustom
- **Export PDF** — Export laporan lengkap ke PDF (via jsPDF + autotable)

### Manajemen Toko & Kasir
- **Manajemen Shift** — Buka/tutup shift dengan kas awal, ringkasan penjualan per shift, dan breakdown per metode bayar
- **Multi-User + PIN** — Daftarkan kasir dengan PIN 4 digit; owner punya akses penuh, kasir akses terbatas
- **Manajemen Kategori** — CRUD kategori dengan warna dan ikon emoji
- **Manajemen Supplier** — Simpan data kontak dan catatan supplier
- **Metode Pembayaran** — Aktifkan/nonaktifkan metode bayar (Tunai, Transfer Bank, QRIS, Kartu Debit, Kartu Kredit, E-Wallet)
- **Pengaturan Toko** — Nama toko, alamat, nomor telepon, footer struk, logo
- **Struk Digital** — Cetak, unduh (PNG), bagikan via Web Share API, atau print via Bluetooth printer
- **Backup & Restore** — Export/import semua data sebagai JSON, dengan pengingat backup otomatis

### Tampilan & UX
- **Offline-First** — Semua fungsi kasir berjalan 100% tanpa internet (IndexedDB)
- **Responsif** — Mobile-first phone UI; landscape/tablet: tampilan side-by-side produk + keranjang
- **Dark Mode** — Tema gelap penuh
- **Kustomisasi Warna** — Pilih warna aksen toko (8 preset warna)
- **PWA** — Bisa diinstall ke home screen, service worker Workbox, mendukung semua orientasi
- **Onboarding** — Tutorial interaktif untuk pengguna baru

### Sinkronisasi (Opsional — Backend API)
- **Register & Login** — Akun dengan email + password untuk mengaktifkan sinkronisasi
- **Sync Real-time** — Perubahan data (produk, kategori, transaksi, shift, dll.) disinkronkan antar perangkat via Socket.IO
- **Multi-Tenant** — Setiap toko terisolasi secara ketat berdasarkan `storeId` di JWT
- **Offline Tetap Bekerja** — Sync hanya fire-and-forget; app tetap berfungsi tanpa koneksi server

---

## 🛠️ Tech Stack

### Frontend

| Layer | Teknologi |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Theming | next-themes (dark mode) |
| Database Lokal | IndexedDB via Dexie.js v4 |
| Charts | Recharts |
| Routing | React Router DOM v6 |
| Form & Validasi | React Hook Form + Zod |
| State / Query | @tanstack/react-query v5 |
| Icon | Lucide React |
| Tanggal | date-fns (locale id) |
| PWA | vite-plugin-pwa (Workbox) |
| Barcode | html5-qrcode (kamera + input manual) |
| Struk | html2canvas (PNG), Web Bluetooth Print |
| Export PDF | jsPDF + jsPDF-AutoTable |
| Real-time Sync | Socket.IO client |
| Font | Plus Jakarta Sans |

### Backend (linipos-api)

| Layer | Teknologi |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 + TypeScript |
| Database | MySQL 8 (via mysql2) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.IO (per-store rooms) |
| Validasi | Zod |
| Rate Limiting | express-rate-limit |
| Dev Server | tsx watch |
| Process Manager | PM2 (produksi) |

---

## 📁 Struktur Proyek

```
linipos/
├── src/                          # Frontend React
│   ├── App.tsx                   # Root component, routing (semua lazy-loaded)
│   ├── main.tsx                  # Entry point
│   ├── index.css                 # Design tokens (HSL CSS variables)
│   ├── lib/
│   │   ├── db.ts                 # Dexie schema (IndexedDB, v11), interfaces, seed
│   │   ├── api-client.ts         # HTTP client untuk sync ke backend
│   │   ├── auth-context.tsx      # AuthProvider (PIN login, role, session)
│   │   ├── export-pdf.ts         # Export laporan ke PDF
│   │   ├── hash-utils.ts         # SHA-256 PIN hashing
│   │   ├── image-utils.ts        # Kompresi gambar (base64)
│   │   ├── sounds.ts             # Suara scan & checkout
│   │   ├── units.ts              # Satuan produk (pcs, kg, liter, dll.)
│   │   ├── utils.ts              # cn() utility
│   │   └── version-check.ts     # Version check webhook
│   ├── hooks/
│   │   ├── use-socket.ts         # Socket.IO client + IndexedDB sync handler
│   │   ├── use-theme-color.ts    # Tema warna aksen (CSS variable)
│   │   ├── use-mobile.tsx        # Deteksi perangkat mobile
│   │   ├── use-pwa-install.ts    # PWA install prompt
│   │   └── use-toast.ts          # Toast notification hook
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx     # Layout utama (max-w-lg mobile, max-w-6xl tablet)
│   │   │   ├── BottomNav.tsx     # Bottom nav (5 tab owner / 3 tab kasir)
│   │   │   └── SideNav.tsx       # Side nav (tablet/landscape)
│   │   ├── Onboarding.tsx        # Tutorial & setup toko pertama kali
│   │   ├── BackupReminder.tsx    # Pengingat backup + export
│   │   ├── Receipt.tsx           # Struk (view, download, share, Bluetooth print)
│   │   ├── RefundDialog.tsx      # Dialog proses retur/refund
│   │   ├── BarcodeScanner.tsx    # Scanner barcode via kamera
│   │   ├── PinLogin.tsx          # UI login PIN kasir
│   │   ├── SetupOwnerPin.tsx     # Setup PIN owner pertama kali
│   │   ├── LucideIconPicker.tsx  # Picker ikon kategori
│   │   ├── ThemeColorPicker.tsx  # Picker warna aksen (8 preset)
│   │   └── ui/                   # shadcn/ui components (40+)
│   └── pages/
│       ├── Dashboard.tsx         # Beranda: statistik, aksi cepat, stok menipis
│       ├── Cashier.tsx           # Kasir POS (scan, keranjang, checkout, shift)
│       ├── Products.tsx          # CRUD produk + varian + drag reorder
│       ├── Reports.tsx           # Laporan penjualan, grafik, P&L, export PDF
│       ├── Settings.tsx          # Pengaturan toko, user, metode bayar, backup
│       ├── TransactionHistory.tsx# Riwayat transaksi + open bill
│       ├── Supplier.tsx          # CRUD supplier
│       ├── StockIn.tsx           # Stok masuk + kalkulasi HPP
│       ├── StockOut.tsx          # Stok keluar
│       ├── StockReport.tsx       # Laporan mutasi stok
│       ├── Shifts.tsx            # Manajemen shift (riwayat + status)
│       ├── Categories.tsx        # CRUD kategori (warna + ikon)
│       ├── AuthChoice.tsx        # Pilihan: pakai lokal / sinkronisasi
│       ├── Register.tsx          # Daftar akun baru (untuk sync)
│       ├── Login.tsx             # Login email + password (untuk sync)
│       └── NotFound.tsx          # Halaman 404
│
└── linipos-api/                  # Backend Express
    ├── src/
    │   ├── index.ts              # Entry point Express + Socket.IO
    │   ├── config.ts             # Env vars validation
    │   ├── db.ts                 # MySQL connection pool
    │   ├── socket.ts             # Socket.IO (per-store rooms, broadcast)
    │   ├── middleware/
    │   │   ├── auth.ts           # JWT auth middleware
    │   │   ├── validate.ts       # Zod request validation middleware
    │   │   └── requestLogger.ts  # HTTP request logger
    │   ├── routes/
    │   │   ├── auth.ts           # POST /auth/login, /register, /login-pin, /sync-user
    │   │   ├── sync.ts           # GET /sync/pull (full snapshot)
    │   │   ├── products.ts       # CRUD /products
    │   │   ├── categories.ts     # CRUD /categories
    │   │   ├── transactions.ts   # CRUD /transactions
    │   │   ├── variantGroups.ts  # CRUD /variant-groups
    │   │   ├── variantOptions.ts # CRUD /variant-options
    │   │   ├── paymentMethods.ts # CRUD /payment-methods
    │   │   ├── suppliers.ts      # CRUD /suppliers
    │   │   ├── storeSettings.ts  # GET/PUT /store-settings
    │   │   ├── shifts.ts         # CRUD /shifts
    │   │   ├── stockIns.ts       # CRUD /stock-ins
    │   │   └── stockOuts.ts      # CRUD /stock-outs
    │   ├── schemas/              # Zod schemas (auth, account, dll.)
    │   └── types/                # TypeScript type extensions (Express Request)
    ├── migrations/               # SQL migration scripts
    ├── migration_v2.sql          # Multi-tenant isolation (storeId per tabel)
    ├── migration_v3_payment.sql  # paymentMethodDefaults + paymentMethodConfigs
    └── .env.example              # Template konfigurasi environment
```

---

## 💾 Database

### IndexedDB (Frontend — Dexie.js) — Schema v11

| Tabel | Deskripsi |
|---|---|
| `categories` | Kategori produk (nama, warna, ikon emoji) |
| `products` | Master produk (nama, SKU unik, harga jual, HPP, stok, satuan, foto, sortOrder, isActive) |
| `suppliers` | Data kontak supplier |
| `stockIns` | Catatan stok masuk dari supplier |
| `stockOuts` | Catatan stok keluar (rusak, hilang, retur, dll.) |
| `hppHistory` | Riwayat perubahan HPP (audit trail) |
| `paymentMethods` | Metode pembayaran (Tunai, Transfer, QRIS, dll.) |
| `transactions` | Transaksi penjualan (status: open/completed, customer, meja, catatan, refund) |
| `transactionItems` | Item dalam transaksi (per-item diskon, catatan, variantOptionId) |
| `variantGroups` | Grup varian produk (Ukuran, Suhu, dll.) |
| `variantOptions` | Opsi varian (16oz/22oz/Hot/Iced — dengan harga & HPP masing-masing) |
| `storeSettings` | Pengaturan toko + deviceId + serverStoreId |
| `users` | Pengguna lokal (owner/kasir) dengan PIN SHA-256 |
| `shifts` | Data shift (buka/tutup, kas awal, userId) |

### MySQL (Backend — linipos-api)

**18 tabel aktif** di database produksi (`afif_linipos_db.sql`):

| Tabel | Deskripsi |
|---|---|
| `accounts` | Akun pemilik (email, passwordHash, nama) |
| `stores` | Toko milik akun (FK ke `accounts`) |
| `users` | Staff per toko (kasir/owner, PIN hash, isActive) |
| `categories` | Kategori produk per toko |
| `products` | Master produk (SKU, harga, HPP, stok, foto, varian, barcode) |
| `suppliers` | Data supplier per toko |
| `paymentMethodDefaults` | Template metode bayar global (Tunai, Transfer, QRIS, dll.) |
| `paymentMethodConfigs` | Konfigurasi metode bayar per toko (aktif/nonaktif, nama kustom) |
| `transactions` | Transaksi penjualan (open/completed, refund, receipt number) |
| `transactionItems` | Item dalam transaksi (qty, harga, diskon, variantOptionId) |
| `variantGroups` | Grup varian produk (misal: Ukuran, Suhu) |
| `variantOptions` | Opsi varian dengan harga & HPP masing-masing |
| `storeSettings` | Pengaturan toko (nama, alamat, logo, footer, tema) |
| `shifts` | Shift kasir (buka/tutup, kas awal, catatan) |
| `stockIns` | Penerimaan stok dari supplier |
| `stockOuts` | Pengeluaran stok (rusak, hilang, retur) |
| `hppHistory` | Riwayat perubahan HPP (audit trail weighted average) |
| `paymentMethods` | *(Legacy — tidak aktif, digantikan paymentMethodConfigs)* |

Semua tabel data dilindungi dengan kolom `storeId` untuk isolasi multi-tenant yang ketat.

> **Setup database:** Import file `afif_linipos_db.sql` (canonical dump dari server produksi) sebagai referensi schema utama. File migration (`migration_v2.sql`, `migration_v3_payment.sql`) digunakan untuk upgrade dari versi lama.

### Kalkulasi HPP (Weighted Average)

Saat stok masuk, HPP dihitung ulang otomatis:

```
HPP Baru = ((Stok Lama × HPP Lama) + (Qty Masuk × Harga Beli)) / (Stok Lama + Qty Masuk)
```

---

## 🔐 Sistem Autentikasi

### Mode Lokal (tanpa backend)
- User dibuat dan disimpan di IndexedDB
- Login dengan PIN 4 digit (hash SHA-256)
- Role: `owner` (akses penuh) dan `kasir` (akses terbatas: kasir, produk, riwayat)

### Mode Sinkronisasi (dengan backend)
1. **Register/Login** — Email + password → JWT 7 hari (`role: owner`)
2. **Login PIN kasir** → `POST /auth/login-pin` → JWT 24 jam (`role: kasir/owner`)
3. **Sync data** → `GET /sync/pull` (full snapshot dengan filter `since`) + push perubahan per entitas
4. **Real-time** — Socket.IO join room `store-{storeId}` via JWT; menerima event `data-changed`

---

## 🔄 Sinkronisasi Real-time

```
Device A                    Server (linipos-api)           Device B
   │                               │                           │
   │── POST /products ────────────►│                           │
   │                               │── emit data-changed ─────►│
   │                               │   (room: store-{id})      │
   │                               │                           │── update IndexedDB
   │                               │                           │   (Dexie put/update)
   │                               │                           │── UI re-render otomatis
   │                               │                           │   (useLiveQuery)
```

Perubahan yang disinkronkan: produk, kategori, supplier, metode bayar, varian, pengaturan toko, user, transaksi, shift.

---

## 🚀 Cara Menjalankan Lokal

### Prasyarat

- [Node.js](https://nodejs.org/) v18+ atau [Bun](https://bun.sh/)
- MySQL 8 (hanya jika menggunakan backend sync)

### Frontend

```bash
# Clone repository
git clone https://github.com/user/linipos.git
cd linipos

# Install dependencies
npm install

# Jalankan dev server
npm run dev
# App berjalan di http://localhost:8080
```

### Backend (Opsional — untuk sinkronisasi)

```bash
cd linipos-api

# Install dependencies
npm install

# Salin dan isi konfigurasi
cp .env.example .env
# Edit .env: isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, CORS_ORIGIN

# Jalankan database migrations
mysql -u root -p linipos_db < migration_v2.sql
mysql -u root -p linipos_db < migration_v3_payment.sql

# Jalankan dev server
npm run dev
# API berjalan di http://localhost:3001
```

### Environment Variables Backend (`.env`)

```env
PORT=3001
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_USER=linipos_user
DB_PASSWORD=your_strong_password_here
DB_NAME=linipos_db

# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_very_long_random_secret_here

# Domain frontend yang diizinkan akses API
CORS_ORIGIN=https://yourdomain.com
```

### Environment Variables Frontend (`.env.development`)

```env
VITE_API_URL=http://localhost:3001
```

---

## 📦 Build & Produksi

```bash
# Build frontend
npm run build
# Output: dist/

# Build backend
cd linipos-api && npm run build
# Output: linipos-api/dist/

# Jalankan backend (produksi)
node linipos-api/dist/index.js

# Atau dengan PM2
pm2 start linipos-api/ecosystem.config.cjs
```

---

## 🧪 Testing & Kualitas Kode

```bash
# Jalankan unit tests
npm run test

# Lint check
npm run lint

# Watch mode (test)
npm run test:watch
```

### Status Health Check (per commit ini)

| Check | Status |
|---|---|
| `npm run test` | ✅ 1 passed |
| `npm run build` (frontend) | ✅ Berhasil, tanpa warning chunk size |
| `npm run build` (backend) | ✅ Berhasil, 0 error TypeScript |
| `npm run lint` | ✅ 0 error, 0 warning |

### Perbaikan yang Telah Dilakukan

- **ESLint config** — Exclude `dist/`, `dev-dist/`, `.wrangler/`, `linipos-api/` dari scan lint
- **Code splitting** — Semua halaman di-lazy load via `React.lazy()` + `Suspense`; bundle utama turun dari **2.4 MB → 446 KB** (↓81%)
- **Vendor chunk splitting** — Library besar (jsPDF, html2canvas, Recharts, BarcodeScanner) dipisah ke chunk masing-masing
- **Empty catch blocks** — Semua `catch {}` kosong diberi comment yang jelas
- **`Infinity` shadowing** — Import dari lucide-react di-rename ke `InfinityIcon` untuk menghindari shadowing nama global JavaScript

---

## 🗺️ Role & Akses

| Fitur | Owner | Kasir |
|---|---|---|
| Dashboard / Statistik | ✅ | ❌ (redirect ke kasir) |
| Kasir (POS) | ✅ | ✅ |
| Produk (lihat) | ✅ | ✅ |
| Produk (edit/tambah/hapus) | ✅ | ❌ |
| Laporan | ✅ | ❌ |
| Pengaturan | ✅ | ❌ |
| Stok Masuk/Keluar | ✅ | ❌ |
| Supplier | ✅ | ❌ |
| Riwayat Transaksi | ✅ | ✅ |
| Shift (buka/tutup) | ✅ | ✅ |

---

## 🗺️ Roadmap

Lini POS dirancang dengan arsitektur yang memungkinkan evolusi bertahap menuju platform ERP penuh.

### Fase Saat Ini — Production POS
- [x] Offline-first dengan IndexedDB (Dexie.js)
- [x] Real-time sync via Socket.IO (multi-device)
- [x] Multi-tenant backend (isolasi data per toko via `storeId`)
- [x] Manajemen shift, stok, varian produk, refund
- [x] Export laporan PDF
- [x] PWA — installable, service worker, offline capable
- [x] Role-based access (owner / kasir)
- [x] Code splitting — bundle utama 446 KB

### Fase Berikutnya — Extended Commerce
- [ ] Manajemen pelanggan (CRM dasar: poin, histori, segmentasi)
- [ ] Purchase Order (PO) ke supplier dengan approval workflow
- [ ] Multi-outlet / multi-cabang dalam satu akun
- [ ] Integrasi marketplace (Tokopedia, Shopee) — sinkronisasi stok
- [ ] Loyalty program & voucher
- [ ] Employee management (jadwal, absensi)
- [ ] Notifikasi stok menipis via email/WhatsApp

### Fase ERP — Enterprise Resource Planning
- [ ] Akuntansi terintegrasi (jurnal otomatis dari transaksi POS)
- [ ] Laporan keuangan (Laba Rugi, Neraca, Arus Kas)
- [ ] Manajemen aset tetap
- [ ] Payroll & penggajian
- [ ] Multi-currency
- [ ] API publik + webhook untuk integrasi pihak ketiga
- [ ] Audit log lengkap per entitas

---

## 💬 Feedback & Kontribusi

Punya saran, laporan bug, atau ingin berkontribusi?

1. Fork repository ini
2. Buat feature branch: `git checkout -b feature/nama-fitur`
3. Commit dengan konvensi: `git commit -m 'feat: deskripsi perubahan'`
4. Push dan buat Pull Request

### Panduan Development

- Gunakan komponen `shadcn/ui` yang ada di `src/components/ui/`
- Semua nilai mata uang disimpan sebagai **integer Rupiah** (tanpa desimal)
- Format angka dengan `toLocaleString('id-ID')`
- Fitur baru harus bekerja **offline-first** — tidak boleh bergantung pada ketersediaan API
- Gunakan `useLiveQuery()` dari `dexie-react-hooks` untuk data reaktif dari IndexedDB
- Semua endpoint backend **harus** memvalidasi `storeId` dari JWT (isolasi multi-tenant)
- Tulis schema validasi dengan **Zod** di frontend maupun backend

---

## 📄 Lisensi

[MIT License](LICENSE)

---

## 🙏 Kredit

Dibuat dengan ❤️ untuk UMKM Indonesia.

- [React](https://react.dev/) — UI Framework
- [Vite](https://vitejs.dev/) — Build Tool
- [shadcn/ui](https://ui.shadcn.com/) — UI Components
- [Dexie.js](https://dexie.org/) — IndexedDB Wrapper
- [Tailwind CSS](https://tailwindcss.com/) — Utility CSS
- [Lucide Icons](https://lucide.dev/) — Icon Library
- [Recharts](https://recharts.org/) — Chart Library
- [Socket.IO](https://socket.io/) — Real-time Communication
- [jsPDF](https://github.com/parallax/jsPDF) — PDF Generation
