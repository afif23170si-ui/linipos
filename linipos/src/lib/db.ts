import Dexie, { type Table } from 'dexie';

// === Interfaces ===

export interface Category {
  id?: number;
  name: string;
  color: string;
  icon: string;
  createdAt: Date;
  isDeleted: number; // 0 = active, 1 = deleted (IndexedDB can't index booleans)
  deletedAt: Date | null;
}

export interface Product {
  id?: number;
  name: string;
  sku: string;
  categoryId: number;
  price: number; // harga jual
  hpp: number; // harga pokok penjualan
  stock: number;
  unit: string; // satuan: pcs, kg, liter, dll
  photo?: string; // base64 or blob URL
  description?: string; // deskripsi produk
  unlimitedStock?: boolean; // true = stok tidak terbatas (F&B bahan baku)
  barcode?: string;
  sortOrder?: number; // display order for manual sorting
  isActive?: number; // 1 = active (visible in cashier), 0 = inactive (hidden from cashier)
  createdAt: Date;
  updatedAt: Date;
  isDeleted: number; // 0 = active, 1 = deleted
  deletedAt: Date | null;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: Date;
  isDeleted: number; // 0 = active, 1 = deleted
  deletedAt: Date | null;
}

export interface StockIn {
  id?: number;
  productId: number;
  supplierId: number;
  quantity: number;
  buyPrice: number; // harga beli per unit
  totalPrice: number;
  date: Date;
  notes: string;
}

export interface StockOut {
  id?: number;
  productId: number;
  quantity: number;
  reason: string; // rusak, hilang, retur, dll
  date: Date;
  notes: string;
}

export interface HppHistory {
  id?: number;
  productId: number;
  oldHpp: number;
  newHpp: number;
  source: 'stock_in' | 'manual';
  date: Date;
}

export interface PaymentMethod {
  id?: number;
  name: string;
  category: string; // tunai, transfer, e-wallet, qris
  isDefault: boolean;
  createdAt: Date;
}

export interface Shift {
  id?: number;
  userId: number;
  userName: string;
  openedAt: Date;
  closedAt?: Date;
  status: 'open' | 'closed';
  openingCash: number;   // uang di laci saat buka shift
  notes?: string;
}

export interface Transaction {
  id?: number;
  subtotal: number;
  discountType: 'percentage' | 'nominal' | null;
  discountValue: number;
  discountAmount: number;
  total: number;
  paymentMethodId: number;
  paymentAmount: number;
  change: number;
  profit: number;
  date: Date;
  receiptNumber: string;
  status: 'open' | 'completed';
  type?: 'sale' | 'refund';    // default = 'sale'
  refundOf?: number;           // original transaction ID if type='refund'
  refundReason?: string;       // alasan retur
  orderNumber?: string;
  customerName?: string;
  tableNumber?: string;
  remarks?: string;
  openedAt?: Date;
  closedAt?: Date;
  userId?: number;
  userName?: string;
  shiftId?: number;
}

export interface TransactionItemRecord {
  id?: number;
  transactionId: number;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  hpp: number;
  discountType: 'percentage' | 'nominal' | null;
  discountValue: number;
  discountAmount: number;
  subtotal: number;
  notes?: string;
  variantOptionId?: number;  // FK to variantOptions
  variantName?: string;      // denormalized: "22oz" for receipts/history
}

export interface VariantGroup {
  id?: number;
  productId: number;   // FK to products
  name: string;        // "Ukuran", "Suhu", etc.
  sortOrder: number;   // display order
}

export interface VariantOption {
  id?: number;
  variantGroupId: number; // FK to variantGroups
  productId: number;      // FK to products (denormalized for fast query)
  name: string;           // "16oz", "22oz", "Hot", "Iced"
  price: number;          // selling price for this option
  hpp: number;            // cost price for this option
  sortOrder: number;      // display order
}

export interface StoreSettings {
  id?: number;
  storeName: string;
  address: string;
  phone: string;
  receiptFooter: string;
  onboardingDone: boolean;
  lastBackupAt: Date | null;
  themeColor?: string; // HSL hue string e.g. "25" for orange
  logo?: string; // base64 JPEG compressed via compressImage()
  deviceId: string;
  serverStoreId?: number; // storeId dari server (untuk login-pin kasir)
}

export interface User {
  id?: number;
  name: string;
  pin: string;           // SHA-256 hash of 4-digit PIN
  role: 'owner' | 'kasir';
  isActive: boolean;
  createdAt: Date;
}

type LegacyTransactionItem = Partial<TransactionItemRecord>;
type LegacyTransaction = Partial<Transaction> & {
  items?: LegacyTransactionItem[];
};
type LegacyProduct = Partial<Product> & {
  id?: number;
  sku?: string;
};

// === Database ===

class PosDatabase extends Dexie {
  categories!: Table<Category>;
  products!: Table<Product>;
  suppliers!: Table<Supplier>;
  stockIns!: Table<StockIn>;
  stockOuts!: Table<StockOut>;
  hppHistory!: Table<HppHistory>;
  paymentMethods!: Table<PaymentMethod>;
  transactions!: Table<Transaction>;
  transactionItems!: Table<TransactionItemRecord>;
  storeSettings!: Table<StoreSettings>;
  users!: Table<User>;
  variantGroups!: Table<VariantGroup>;
  variantOptions!: Table<VariantOption>;
  shifts!: Table<Shift>;

  constructor() {
    super('kasirgratisan-db');

    // Version 1 — original schema (must remain for migration path)
    this.version(1).stores({
      categories: '++id, name',
      products: '++id, name, sku, categoryId, barcode',
      suppliers: '++id, name',
      stockIns: '++id, productId, supplierId, date',
      stockOuts: '++id, productId, date',
      hppHistory: '++id, productId, date',
      paymentMethods: '++id, name, category',
      transactions: '++id, date, receiptNumber, paymentMethodId',
      storeSettings: '++id',
    });

    // Version 2 — CR-1 to CR-5
    this.version(2).stores({
      categories: '++id, name, isDeleted',
      products: '++id, name, sku, categoryId, barcode, isDeleted',
      suppliers: '++id, name, isDeleted',
      stockIns: '++id, productId, supplierId, date',
      stockOuts: '++id, productId, date',
      hppHistory: '++id, productId, date',
      paymentMethods: '++id, name, category',
      transactions: '++id, date, &receiptNumber, paymentMethodId',
      transactionItems: '++id, transactionId, productId',
      storeSettings: '++id',
    }).upgrade(async (tx) => {
      // CR-2: Set soft delete defaults on existing records
      const catTable = tx.table('categories');
      await catTable.toCollection().modify((cat: Partial<Category>) => {
        cat.isDeleted = 0;
        cat.deletedAt = null;
      });

      const prodTable = tx.table('products');
      await prodTable.toCollection().modify((prod: Partial<Product>) => {
        prod.isDeleted = 0;
        prod.deletedAt = null;
      });

      const supTable = tx.table('suppliers');
      await supTable.toCollection().modify((sup: Partial<Supplier>) => {
        sup.isDeleted = 0;
        sup.deletedAt = null;
      });

      // CR-1: Generate deviceId for existing storeSettings
      const storeTable = tx.table('storeSettings');
      await storeTable.toCollection().modify((s: Partial<StoreSettings>) => {
        s.deviceId = crypto.randomUUID();
      });

      // CR-5: Migrate embedded items[] from transactions to transactionItems table
      const txTable = tx.table('transactions');
      const itemsTable = tx.table('transactionItems');
      const allTx = await txTable.toArray() as LegacyTransaction[];

      for (const t of allTx) {
        const items = t.items;
        if (Array.isArray(items) && items.length > 0) {
          const records = items.map((item) => ({
            transactionId: t.id!,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            hpp: item.hpp,
            discountType: item.discountType,
            discountValue: item.discountValue,
            discountAmount: item.discountAmount,
            subtotal: item.subtotal,
          })) as TransactionItemRecord[];
          await itemsTable.bulkAdd(records);
        }
        // Remove embedded items field
        delete t.items;
        await txTable.put(t);
      }
    });

    // Version 3 — Open Bill: status, orderNumber, customer/table, item notes
    this.version(3).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
    }).upgrade(async (tx) => {
      // Set all existing transactions to 'completed' status
      await tx.table('transactions').toCollection().modify((t: Partial<Transaction>) => {
        t.status = 'completed';
      });
    });

    // Version 4 — SKU unique constraint
    this.version(4).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
    }).upgrade(async (tx) => {
      // Deduplicate SKUs before applying unique constraint
      const prodTable = tx.table('products');
      const allProducts = await prodTable.toArray() as LegacyProduct[];
      const seenSku = new Map<string, number>(); // sku -> first occurrence index

      for (const p of allProducts) {
        const sku = p.sku;
        if (!sku || sku.trim() === '') continue;

        if (seenSku.has(sku)) {
          // Duplicate SKU found — append suffix to make unique
          let counter = 1;
          let newSku = `${sku}_dup${counter}`;
          while (seenSku.has(newSku)) {
            counter++;
            newSku = `${sku}_dup${counter}`;
          }
          seenSku.set(newSku, p.id);
          await prodTable.update(p.id!, { sku: newSku });
        } else {
          seenSku.set(sku, p.id);
        }
      }
    });

    // Version 5 — User management (PIN login + roles)
    this.version(5).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
    });

    // Version 6 — Product Variants (variant groups + options)
    this.version(6).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
    });

    // Version 7 — Shift management
    this.version(7).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId, shiftId',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
      shifts:           '++id, userId, status, openedAt',
    });

    // Version 8 — Refund/Retur support
    this.version(8).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId, shiftId, type, refundOf',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
      shifts:           '++id, userId, status, openedAt',
    }).upgrade(async (tx) => {
      // Set existing transactions to type='sale'
      await tx.table('transactions').toCollection().modify((t: Partial<Transaction>) => {
        if (!t.type) t.type = 'sale';
      });
    });

    // Version 9 — product manual sort order
    this.version(9).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId, shiftId, type, refundOf',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
      shifts:           '++id, userId, status, openedAt',
    }).upgrade(async (tx) => {
      // Initialize sortOrder for existing products based on their id order
      const allProducts = await tx.table('products').toArray() as LegacyProduct[];
      allProducts.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      for (let i = 0; i < allProducts.length; i++) {
        await tx.table('products').update(allProducts[i].id, { sortOrder: i + 1 });
      }
    });

    // Version 10 — product active/inactive status
    this.version(10).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted, isActive',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId, shiftId, type, refundOf',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
      shifts:           '++id, userId, status, openedAt',
    }).upgrade(async (tx) => {
      // Set all existing products to isActive = 1
      await tx.table('products').toCollection().modify((p: Partial<Product>) => {
        if (p.isActive === undefined || p.isActive === null) p.isActive = 1;
      });
    });

    // Version 11 — tambah serverStoreId di storeSettings (optional field, no schema change needed)
    this.version(11).stores({
      categories:       '++id, name, isDeleted',
      products:         '++id, name, &sku, categoryId, barcode, isDeleted, isActive',
      suppliers:        '++id, name, isDeleted',
      stockIns:         '++id, productId, supplierId, date',
      stockOuts:        '++id, productId, date',
      hppHistory:       '++id, productId, date',
      paymentMethods:   '++id, name, category',
      transactions:     '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, userId, shiftId, type, refundOf',
      transactionItems: '++id, transactionId, productId',
      storeSettings:    '++id',
      users:            '++id, name, role',
      variantGroups:    '++id, productId',
      variantOptions:   '++id, variantGroupId, productId',
      shifts:           '++id, userId, status, openedAt',
    });
  }
}

export const db = new PosDatabase();

// Seed default data — hanya storeSettings (template device, bukan data bisnis)
// Kategori dan payment method TIDAK di-seed karena akan bentrok ID antar akun saat sync.
// User mengisi sendiri setelah login.
export async function seedDefaultData() {
  const storeCount = await db.storeSettings.count();
  if (storeCount === 0) {
    await db.storeSettings.add({
      storeName: 'Toko Saya',
      address: '',
      phone: '',
      receiptFooter: 'Terima kasih atas kunjungan Anda!',
      onboardingDone: false,
      lastBackupAt: null,
      deviceId: crypto.randomUUID(),
    });
  } else {
    // Fallback: if storeSettings exists but has no deviceId, generate one
    const settings = await db.storeSettings.toCollection().first();
    if (settings && !settings.deviceId) {
      await db.storeSettings.update(settings.id!, { deviceId: crypto.randomUUID() });
    }
  }
}
