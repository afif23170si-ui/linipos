/**
 * api-client.ts — Lini POS Backend API Client
 *
 * Alur auth:
 * 1. User login PIN lokal (IndexedDB) → berhasil
 * 2. syncUser(user) — kirim user ke server, TANPA token (endpoint bebas)
 * 3. apiLogin(pin)  — minta JWT dari server, simpan di localStorage
 * 4. Semua push berikutnya pakai JWT tersebut
 *
 * Semua fungsi push bersifat fire-and-forget:
 * - Tidak pernah throw ke caller
 * - Network error hanya di-log ke console.error
 * - JWT dihapus otomatis kalau server balas 401
 * - Timeout 10 detik per request
 */

import { db } from './db';
import type {
  Transaction,
  TransactionItemRecord,
  Product,
  User,
  Category,
  Supplier,
  PaymentMethod,
  VariantGroup,
  VariantOption,
  StoreSettings,
  StockIn,
  StockOut,
  HppHistory,
  Shift,
} from './db';

// ── Config ─────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)
  ?? 'https://api.afiframadhan.my.id';

const JWT_KEY = 'linipos-jwt';
const LAST_SYNC_KEY = 'linipos-last-sync';
const REQUEST_TIMEOUT_MS = 10_000;

// ── Types ──────────────────────────────────────────────────────
type DateLike = Date | string;

type ServerPaymentMethod = Omit<PaymentMethod, 'createdAt'> & {
  createdAt?: DateLike;
  defaultName?: string;
  icon?: string;
  isActive?: boolean | number;
  sortOrder?: number;
  type?: string;
};

type ServerUser = Omit<User, 'createdAt' | 'pin'> & {
  createdAt: DateLike;
  pin?: string;
};

type ServerTransaction = Omit<Transaction, 'date' | 'openedAt' | 'closedAt'> & {
  date: DateLike;
  openedAt?: DateLike;
  closedAt?: DateLike;
};

type ServerShift = Omit<Shift, 'openedAt' | 'closedAt'> & {
  openedAt: DateLike;
  closedAt?: DateLike;
};

type ServerStockIn = Omit<StockIn, 'date'> & { date: DateLike };
type ServerStockOut = Omit<StockOut, 'date'> & { date: DateLike };
type ServerHppHistory = Omit<HppHistory, 'date'> & { date: DateLike };

type ApiErrorResponse = {
  error?: string;
};

export interface SyncPullResult {
  storeId?: number | null;  // storeId dari JWT server
  categories: Category[];
  products: Product[];
  suppliers: Supplier[];
  paymentMethods: ServerPaymentMethod[];
  variantGroups: VariantGroup[];
  variantOptions: VariantOption[];
  storeSettings: Partial<StoreSettings> | null;
  users: ServerUser[];
  transactions?: ServerTransaction[];
  transactionItems?: TransactionItemRecord[];
  shifts?: ServerShift[];
  stockIns?: ServerStockIn[];
  stockOuts?: ServerStockOut[];
  hppHistory?: ServerHppHistory[];
  serverTimestamp: string;
}

export interface LoginResult {
  token: string;
  user: { id: number; name: string; role: 'owner' | 'kasir' };
}

// ── Helpers ────────────────────────────────────────────────────
function getJwt(): string | null {
  return localStorage.getItem(JWT_KEY);
}

function clearJwt(): void {
  localStorage.removeItem(JWT_KEY);
}

/**
 * Decode JWT payload (tidak verify signature — hanya untuk extract storeId client-side).
 * Returns null jika token tidak valid atau expired.
 */
function decodeJwtPayload(token: string): { storeId?: number; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    // Cek expired
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Ambil storeId dari JWT yang tersimpan di localStorage.
 * Dipakai sebagai fallback jika serverStoreId belum ada di IndexedDB.
 */
function getStoreIdFromExistingJwt(): number | null {
  const jwt = getJwt();
  if (!jwt) return null;
  const payload = decodeJwtPayload(jwt);
  return payload?.storeId ?? null;
}

async function getDeviceId(): Promise<string> {
  try {
    const settings = await db.storeSettings.toCollection().first();
    return settings?.deviceId ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function serializeDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return d;
}

/**
 * Buat HTTP request ke API server.
 * @param withAuth - kalau true, sertakan JWT header (default true)
 */
async function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  withAuth = true,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const deviceId = await getDeviceId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };

  if (withAuth) {
    const jwt = getJwt();
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // JWT kedaluwarsa — hapus supaya tidak dipakai lagi
    if (res.status === 401 && withAuth) {
      clearJwt();
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Login kasir ke server dengan PIN — call /auth/login-pin.
 * Ambil serverStoreId dari IndexedDB, simpan JWT ke localStorage.
 *
 * PENTING: Jika serverStoreId belum ada di IndexedDB (device lama yang upgrade),
 * decode JWT yang sudah ada (dari email login) untuk extract storeId,
 * simpan ke DB, lalu lanjut login PIN.
 * Returns null kalau gagal (offline, server down, storeId tidak ada).
 */
export async function apiLogin(pin: string): Promise<LoginResult | null> {
  try {
    const settings = await db.storeSettings.toCollection().first();
    let storeId = settings?.serverStoreId;

    if (!storeId) {
      // Fallback 1: decode dari JWT yang ada di localStorage (email login)
      const storeIdFromJwt = getStoreIdFromExistingJwt();
      if (storeIdFromJwt) {
        storeId = storeIdFromJwt;
        // Persist ke DB supaya login berikutnya tidak perlu decode ulang
        if (settings?.id) {
          await db.storeSettings.update(settings.id, { serverStoreId: storeIdFromJwt }).catch(() => {});
        }
        console.log('[api-client] apiLogin: storeId restored from JWT payload:', storeIdFromJwt);
      }
    }

    if (!storeId) {
      console.warn('[api-client] apiLogin: serverStoreId not found, skip');
      return null;
    }

    const res = await makeRequest('POST', '/auth/login-pin', { pin, storeId }, false);
    if (!res.ok) return null;
    const data = await res.json() as LoginResult;
    localStorage.setItem(JWT_KEY, data.token);

    // Persist storeId ke DB jika belum ada (sinkronisasi)
    if (!settings?.serverStoreId && settings?.id) {
      await db.storeSettings.update(settings.id, { serverStoreId: storeId }).catch(() => {});
    }

    return data;
  } catch (err) {
    console.error('[api-client] apiLogin failed:', err);
    return null;
  }
}

/**
 * Alias publik loginPin — sama dengan apiLogin tapi lebih eksplisit.
 * Dipanggil dari auth-context setelah PIN login lokal berhasil.
 */
export const loginPin = apiLogin;

/**
 * Bootstrap serverStoreId ke IndexedDB dari JWT yang sudah ada di localStorage.
 * Dipanggil saat app load (AppLayout) untuk fix device lama yang upgrade.
 * Idempotent \u2014 hanya update DB jika serverStoreId belum ada.
 */
export async function bootstrapStoreIdFromJwt(): Promise<void> {
  try {
    const settings = await db.storeSettings.toCollection().first();
    if (settings?.serverStoreId) return; // sudah ada, tidak perlu apa-apa
    const storeId = getStoreIdFromExistingJwt();
    if (storeId && settings?.id) {
      await db.storeSettings.update(settings.id, { serverStoreId: storeId });
      console.log('[api-client] bootstrapStoreIdFromJwt: storeId saved to DB:', storeId);
    }
  } catch (err) {
    console.error('[api-client] bootstrapStoreIdFromJwt failed:', err);
  }
}

/**
 * Sync user ke server.
 * Kalau JWT tersedia, kirim dengan auth (supaya storeId ter-set di server).
 * Kalau tidak ada JWT, kirim tanpa auth (bootstrap).
 */
export async function syncUser(user: User): Promise<void> {
  try {
    const withAuth = !!getJwt();
    await makeRequest('POST', '/auth/sync-user', {
      localId: user.id,
      name: user.name,
      pin: user.pin,
      role: user.role,
      isActive: user.isActive ? 1 : 0,
    }, withAuth);
  } catch (err) {
    console.error('[api-client] syncUser failed:', err);
  }
}

/**
 * Push transaksi ke server (fire-and-forget).
 * Skip kalau tidak ada JWT.
 */
export async function pushTransaction(
  tx: Transaction,
  items: TransactionItemRecord[]
): Promise<void> {
  try {
    if (!getJwt()) return;

    const payload = {
      subtotal: tx.subtotal,
      discountType: tx.discountType ?? null,
      discountValue: tx.discountValue ?? 0,
      discountAmount: tx.discountAmount ?? 0,
      total: tx.total,
      paymentMethodId: tx.paymentMethodId,
      paymentAmount: tx.paymentAmount,
      change: tx.change,
      profit: tx.profit,
      date: serializeDate(tx.date) ?? new Date().toISOString(),
      receiptNumber: tx.receiptNumber,
      status: tx.status ?? 'completed',
      type: tx.type ?? 'sale',
      refundOf: tx.refundOf ?? null,
      refundReason: tx.refundReason ?? null,
      orderNumber: tx.orderNumber ?? null,
      customerName: tx.customerName ?? null,
      tableNumber: tx.tableNumber ?? null,
      remarks: tx.remarks ?? null,
      openedAt: serializeDate(tx.openedAt),
      closedAt: serializeDate(tx.closedAt),
      userId: tx.userId ?? null,
      userName: tx.userName ?? null,
      shiftId: tx.shiftId ?? null,
      items: items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        price: i.price,
        hpp: i.hpp,
        discountType: i.discountType ?? null,
        discountValue: i.discountValue ?? 0,
        discountAmount: i.discountAmount ?? 0,
        subtotal: i.subtotal,
        notes: i.notes ?? null,
        variantOptionId: i.variantOptionId ?? null,
        variantName: i.variantName ?? null,
      })),
    };

    await makeRequest('POST', '/transactions', payload);

    // Setelah transaksi berhasil: push stock update semua produk yang terlibat
    // supaya device lain mendapat stok terkini via WebSocket broadcast
    const uniqueProductIds = [...new Set(items.map(i => i.productId))];
    for (const productId of uniqueProductIds) {
      const product = await db.products.get(productId);
      if (product) {
        // pushProduct akan broadcast ke semua device lain via socket
        pushProduct(product).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[api-client] pushTransaction failed:', err);
  }
}

/**
 * Push produk ke server — upsert by SKU (fire-and-forget).
 * Skip kalau tidak ada JWT.
 */
export async function pushProduct(product: Product): Promise<void> {
  try {
    if (!getJwt()) return;

    await makeRequest('POST', '/products', {
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      price: product.price,
      hpp: product.hpp,
      stock: product.stock,
      unit: product.unit,
      photo: product.photo ?? null,
      description: product.description ?? null,
      unlimitedStock: product.unlimitedStock ? 1 : 0,
      barcode: product.barcode ?? null,
      sortOrder: product.sortOrder ?? 0,
      isActive: product.isActive ?? 1,
      createdAt: serializeDate(product.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(product.updatedAt) ?? new Date().toISOString(),
      isDeleted: product.isDeleted ?? 0,
      deletedAt: serializeDate(product.deletedAt),
    });
  } catch (err) {
    console.error('[api-client] pushProduct failed:', err);
  }
}

/**
 * Pull semua data dari server sejak last sync.
 * Simpan serverTimestamp ke localStorage.
 * Returns null kalau error.
 */
export async function pullSync(since?: string): Promise<SyncPullResult | null> {
  try {
    if (!getJwt()) return null;

    const lastSync = since ?? localStorage.getItem(LAST_SYNC_KEY) ?? undefined;
    const queryParam = lastSync ? `?since=${encodeURIComponent(lastSync)}` : '';

    const res = await makeRequest('GET', `/sync/pull${queryParam}`);
    if (!res.ok) return null;

    const data = await res.json() as SyncPullResult;
    if (data.serverTimestamp) {
      localStorage.setItem(LAST_SYNC_KEY, data.serverTimestamp);
    }
    return data;
  } catch (err) {
    console.error('[api-client] pullSync failed:', err);
    return null;
  }
}

/**
 * Pull semua data dari server dan upsert ke IndexedDB.
 * Dipanggil setelah login berhasil untuk sinkronisasi device baru.
 * Fire-and-forget safe — tidak pernah throw ke caller.
 */
export async function syncFromServer(): Promise<void> {
  try {
    const data = await pullSync();
    if (!data) return;

    // Upsert categories
    if (data.categories?.length) {
      await db.categories.bulkPut(
        data.categories.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
        }))
      );
    }

    // Upsert products
    if (data.products?.length) {
      await db.products.bulkPut(
        data.products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          categoryId: p.categoryId,
          price: Number(p.price),
          hpp: Number(p.hpp),
          stock: Number(p.stock),
          unit: p.unit ?? 'pcs',
          photo: p.photo ?? undefined,
          description: p.description ?? undefined,
          unlimitedStock: Boolean(p.unlimitedStock),
          barcode: p.barcode ?? undefined,
          sortOrder: p.sortOrder ?? 0,
          isActive: p.isActive ?? 1,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          isDeleted: p.isDeleted ?? 0,
          deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
        }))
      );
    }

    // Upsert suppliers
    if (data.suppliers?.length) {
      await db.suppliers.bulkPut(
        data.suppliers.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
        }))
      );
    }

    // Upsert paymentMethods dari paymentMethodConfigs (struktur baru)
    if (data.paymentMethods?.length) {
      await db.paymentMethods.bulkPut(
        data.paymentMethods.map((pm) => ({
          id: pm.id,
          name: pm.name,                        // COALESCE(displayName, defaultName)
          category: pm.type ?? pm.category,     // type = tunai/transfer/qris/etc
          isDefault: Boolean(pm.isActive ?? pm.isDefault ?? true), // isActive dari server
          createdAt: pm.createdAt ? new Date(pm.createdAt) : new Date(),
          // Extra fields untuk UI (disimpan sebagai any, tidak ada di schema tapi tersedia di runtime)
          ...(pm.defaultName !== undefined ? { defaultName: pm.defaultName } : {}),
          ...(pm.icon !== undefined ? { icon: pm.icon } : {}),
          ...(pm.sortOrder !== undefined ? { sortOrder: pm.sortOrder } : {}),
        }))
      );
    }

    // Upsert variantGroups
    if (data.variantGroups?.length) {
      await db.variantGroups.bulkPut(
        data.variantGroups.map((vg) => ({
          id: vg.id,
          productId: vg.productId,
          name: vg.name,
          sortOrder: vg.sortOrder ?? 0,
        }))
      );
    }

    // Upsert variantOptions
    if (data.variantOptions?.length) {
      await db.variantOptions.bulkPut(
        data.variantOptions.map((vo) => ({
          id: vo.id,
          variantGroupId: vo.variantGroupId,
          productId: vo.productId,
          name: vo.name,
          price: Number(vo.price),
          hpp: Number(vo.hpp),
          sortOrder: vo.sortOrder ?? 0,
        }))
      );
    }

    // Upsert users (dengan pin hash untuk PIN login lokal)
    // ✅ FIX: Jika server tidak mengembalikan pin (misal Omit<User,'pin'>),
    // jangan timpa pin lokal yang sudah ada — user harus bisa tetap login.
    if (data.users?.length) {
      for (const u of data.users) {
        const hasServerPin = u.pin && u.pin.length > 0;

        if (!hasServerPin) {
          // Server tidak punya / tidak kirim PIN — update field lain saja, pertahankan pin lokal
          const existing = await db.users.get(u.id);
          if (existing) {
            await db.users.update(u.id, {
              name: u.name,
              role: u.role as 'owner' | 'kasir',
              isActive: Boolean(u.isActive),
            });
          } else {
            // User baru dari device lain, belum ada lokal — simpan dengan pin kosong
            // (user ini belum bisa login PIN sampai setup ulang PIN di device-nya sendiri)
            await db.users.put({
              id: u.id,
              name: u.name,
              pin: '',
              role: u.role as 'owner' | 'kasir',
              isActive: Boolean(u.isActive),
              createdAt: new Date(u.createdAt),
            });
          }
        } else {
          // Server ada PIN — upsert lengkap (PIN hash tersinkron)
          await db.users.put({
            id: u.id,
            name: u.name,
              pin: u.pin,
            role: u.role as 'owner' | 'kasir',
            isActive: Boolean(u.isActive),
            createdAt: new Date(u.createdAt),
          });
        }
      }
    }

    // Upsert storeSettings — HANYA update storeName, address, phone, receiptFooter, themeColor, logo
    // Jangan overwrite onboardingDone, lastBackupAt, deviceId dari server
    if (data.storeSettings) {
      const local = await db.storeSettings.toCollection().first();
      const remote = data.storeSettings;
      if (local?.id) {
        // Hanya update field yang aman — TIDAK overwrite onboardingDone atau deviceId
        const safeUpdate: Record<string, unknown> = {};
        if (remote.storeName) safeUpdate.storeName = remote.storeName;
        if (remote.address !== undefined) safeUpdate.address = remote.address;
        if (remote.phone !== undefined) safeUpdate.phone = remote.phone;
        if (remote.receiptFooter !== undefined) safeUpdate.receiptFooter = remote.receiptFooter;
        if (remote.themeColor !== undefined) safeUpdate.themeColor = remote.themeColor;
        if (remote.logo !== undefined) safeUpdate.logo = remote.logo;
        // Simpan serverStoreId supaya login-pin kasir bisa pakai
        if (data.storeId) safeUpdate.serverStoreId = data.storeId;
        if (Object.keys(safeUpdate).length > 0) {
          await db.storeSettings.update(local.id, safeUpdate);
        }
      } else if (remote.storeName) {
        // Device baru — buat storeSettings dari server tapi set onboardingDone = true
        await db.storeSettings.add({
          storeName: remote.storeName,
          address: remote.address ?? '',
          phone: remote.phone ?? '',
          receiptFooter: remote.receiptFooter ?? 'Terima kasih atas kunjungan Anda!',
          onboardingDone: true, // sudah punya akun, skip onboarding
          lastBackupAt: null,
          themeColor: remote.themeColor,
          logo: remote.logo,
          deviceId: crypto.randomUUID(),
          serverStoreId: data.storeId ?? undefined,
        });
      }
    } else if (data.storeId) {
      // Tidak ada storeSettings dari server tapi ada storeId — tetap simpan serverStoreId
      const local = await db.storeSettings.toCollection().first();
      if (local?.id) {
        await db.storeSettings.update(local.id, { serverStoreId: data.storeId });
      }
    }

    // Upsert transactions
    if (data.transactions?.length) {
      for (const t of data.transactions) {
        await db.transactions.put({
          id: t.id,
          subtotal: Number(t.subtotal),
          discountType: t.discountType ?? null,
          discountValue: Number(t.discountValue ?? 0),
          discountAmount: Number(t.discountAmount ?? 0),
          total: Number(t.total),
          paymentMethodId: t.paymentMethodId,
          paymentAmount: Number(t.paymentAmount ?? 0),
          change: Number(t.change ?? 0),
          profit: Number(t.profit ?? 0),
          date: new Date(t.date),
          receiptNumber: t.receiptNumber,
          status: t.status ?? 'completed',
          type: t.type ?? 'sale',
          refundOf: t.refundOf ?? undefined,
          refundReason: t.refundReason ?? undefined,
          orderNumber: t.orderNumber ?? undefined,
          customerName: t.customerName ?? undefined,
          tableNumber: t.tableNumber ?? undefined,
          remarks: t.remarks ?? undefined,
          openedAt: t.openedAt ? new Date(t.openedAt) : undefined,
          closedAt: t.closedAt ? new Date(t.closedAt) : undefined,
          userId: t.userId ?? undefined,
          userName: t.userName ?? undefined,
          shiftId: t.shiftId ?? undefined,
        });
      }
    }

    // Upsert transactionItems
    if (data.transactionItems?.length) {
      for (const ti of data.transactionItems) {
        await db.transactionItems.put({
          id: ti.id,
          transactionId: ti.transactionId,
          productId: ti.productId,
          productName: ti.productName,
          quantity: ti.quantity,
          price: Number(ti.price),
          hpp: Number(ti.hpp),
          discountType: ti.discountType ?? null,
          discountValue: Number(ti.discountValue ?? 0),
          discountAmount: Number(ti.discountAmount ?? 0),
          subtotal: Number(ti.subtotal),
          notes: ti.notes ?? undefined,
          variantOptionId: ti.variantOptionId ?? undefined,
          variantName: ti.variantName ?? undefined,
        });
      }
    }

    // Upsert shifts
    if (data.shifts?.length) {
      for (const s of data.shifts) {
        await db.shifts.put({
          id: s.id,
          userId: s.userId,
          userName: s.userName,
          openedAt: new Date(s.openedAt),
          closedAt: s.closedAt ? new Date(s.closedAt) : undefined,
          status: s.status,
          openingCash: Number(s.openingCash ?? 0),
          notes: s.notes ?? undefined,
        });
      }
    }

    // Upsert stockIns
    if (data.stockIns?.length) {
      for (const si of data.stockIns) {
        await db.stockIns.put({
          id: si.id,
          productId: si.productId,
          supplierId: si.supplierId,
          quantity: si.quantity,
          buyPrice: Number(si.buyPrice),
          totalPrice: Number(si.totalPrice),
          date: new Date(si.date),
          notes: si.notes ?? '',
        });
      }
    }

    // Upsert stockOuts
    if (data.stockOuts?.length) {
      for (const so of data.stockOuts) {
        await db.stockOuts.put({
          id: so.id,
          productId: so.productId,
          quantity: so.quantity,
          reason: so.reason ?? '',
          date: new Date(so.date),
          notes: so.notes ?? '',
        });
      }
    }

    // Upsert hppHistory
    if (data.hppHistory?.length) {
      for (const h of data.hppHistory) {
        await db.hppHistory.put({
          id: h.id,
          productId: h.productId,
          oldHpp: Number(h.oldHpp),
          newHpp: Number(h.newHpp),
          source: h.source,
          date: new Date(h.date),
        });
      }
    }

    console.log('[api-client] syncFromServer: ALL data synced from server ✅');
  } catch (err) {
    console.error('[api-client] syncFromServer failed:', err);
  }
}

// ── Account Auth (Register + Login email) ──────────────────────

export interface RegisterResult {
  token: string;
  accountId: number;
  storeId: number;
  name: string;
  email: string;
}

/**
 * Daftar akun baru (email + password).
 * Simpan JWT ke localStorage kalau berhasil.
 */
export async function register(
  email: string,
  password: string,
  name: string
): Promise<RegisterResult | null> {
  try {
    const res = await makeRequest('POST', '/auth/register', { email, password, name }, false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as ApiErrorResponse;
      throw new Error(err.error || 'Registrasi gagal');
    }
    const data = await res.json() as RegisterResult;
    localStorage.setItem(JWT_KEY, data.token);
    return data;
  } catch (err) {
    console.error('[api-client] register failed:', err);
    throw err; // biarkan UI handle error ini
  }
}

/**
 * Login dengan email + password.
 * Simpan JWT dan serverStoreId ke localStorage/IndexedDB kalau berhasil.
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<RegisterResult | null> {
  try {
    const res = await makeRequest('POST', '/auth/login', { email, password }, false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as ApiErrorResponse;
      throw new Error(err.error || 'Login gagal');
    }
    const data = await res.json() as RegisterResult;
    localStorage.setItem(JWT_KEY, data.token);
    // Simpan serverStoreId ke IndexedDB supaya loginPin bisa pakai
    if (data.storeId) {
      const settings = await db.storeSettings.toCollection().first();
      if (settings?.id) {
        await db.storeSettings.update(settings.id, { serverStoreId: data.storeId });
      }
    }
    return data;
  } catch (err) {
    console.error('[api-client] loginWithEmail failed:', err);
    throw err;
  }
}

/**
 * Push shift ke server (fire-and-forget).
 */
export async function pushShift(shift: import('./db').Shift): Promise<void> {
  try {
    if (!getJwt()) return;
    await makeRequest('POST', '/shifts', {
      id: shift.id,
      userId: shift.userId,
      userName: shift.userName,
      openedAt: serializeDate(shift.openedAt),
      closedAt: serializeDate(shift.closedAt ?? null),
      status: shift.status,
      openingCash: shift.openingCash,
      notes: shift.notes ?? null,
    });
  } catch (err) {
    console.error('[api-client] pushShift failed:', err);
  }
}

/**
 * Push semua variant untuk satu produk ke server.
 * Menggunakan SKU sebagai identifier (bukan local productId) karena
 * local IndexedDB ID ≠ server MySQL ID (auto-increment berbeda).
 * Endpoint atomic: DELETE all + INSERT all + broadcast satu event 'variants-replaced'.
 * Fire-and-forget, tidak pernah throw.
 */
export async function pushVariantsForProduct(localProductId: number): Promise<void> {
  try {
    if (!getJwt()) return;

    // Ambil produk dari IndexedDB untuk mendapatkan SKU
    const product = await db.products.get(localProductId);
    if (!product?.sku) {
      console.warn('[api-client] pushVariantsForProduct: produk tidak ditemukan atau tidak ada SKU');
      return;
    }

    const [groups, options] = await Promise.all([
      db.variantGroups.where('productId').equals(localProductId).toArray(),
      db.variantOptions.where('productId').equals(localProductId).toArray(),
    ]);

    // Susun payload: groups + options nested
    const groupsPayload = groups.map(vg => ({
      name: vg.name,
      sortOrder: vg.sortOrder ?? 0,
      options: options
        .filter(vo => vo.variantGroupId === vg.id)
        .map(vo => ({
          name: vo.name,
          price: vo.price,
          hpp: vo.hpp,
          sortOrder: vo.sortOrder ?? 0,
        })),
    }));

    // Satu call atomic via SKU — server akan cari productId sendiri
    const res = await makeRequest('POST', '/variant-groups/replace-by-sku', {
      sku: product.sku,
      groups: groupsPayload,
    }).catch(() => null);

    if (res && !res.ok && res.status === 202) {
      // Produk belum ada di server — coba push product dulu, lalu retry sekali
      console.log('[api-client] pushVariantsForProduct: produk belum di server, push product dulu...');
      await pushProduct(product);
      // Tunggu sebentar lalu retry
      await new Promise(r => setTimeout(r, 500));
      await makeRequest('POST', '/variant-groups/replace-by-sku', {
        sku: product.sku,
        groups: groupsPayload,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[api-client] pushVariantsForProduct failed:', err);
  }
}



/** Expose alias untuk Cashier.tsx dynamic import */
export const makeShiftPush = pushShift;
export function hasJwt(): boolean {
  return !!localStorage.getItem(JWT_KEY);
}

/** Hapus JWT dari localStorage (logout dari akun cloud) */
export function clearAccountJwt(): void {
  clearJwt();
  localStorage.removeItem(LAST_SYNC_KEY);
}

/**
 * Push semua data lokal ke server sekaligus.
 * Dipakai setelah restore backup atau setelah onboarding setup.
 */
export async function pushAllData(): Promise<void> {
  try {
    if (!getJwt()) return;

    const [categories, products, settings, variantGroups, variantOptions, users, paymentMethods, suppliers, shifts, stockIns, stockOuts, transactions, transactionItems] = await Promise.all([
      db.categories.toArray(),
      db.products.filter(p => p.isDeleted === 0).toArray(),
      db.storeSettings.toCollection().first(),
      db.variantGroups.toArray(),
      db.variantOptions.toArray(),
      db.users.toArray(),
      db.paymentMethods.toArray(),
      db.suppliers.toArray(),
      db.shifts.toArray(),
      db.stockIns.toArray(),
      db.stockOuts.toArray(),
      db.transactions.toArray(),
      db.transactionItems.toArray(),
    ]);

    // Push categories in batch
    if (categories.length > 0) {
      await makeRequest('POST', '/categories/batch', {
        categories: categories.map(c => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          isDeleted: c.isDeleted ?? 0,
          deletedAt: serializeDate(c.deletedAt),
        }))
      });
    }

    // Push products
    for (const p of products) {
      await pushProduct(p);
    }

    // Push variant groups & options per produk (SKU-based, sama seperti add produk)
    // Grup per productId supaya atomic replace per produk
    const productIdsWithVariants = [...new Set(variantGroups.map(vg => vg.productId))];
    for (const pid of productIdsWithVariants) {
      await pushVariantsForProduct(pid);
    }

    // Push users
    for (const u of users) {
      await syncUser(u);
    }

    // Push payment methods — pakai endpoint baru PUT /payment-methods/:type
    // Hanya push displayName dan isActive, type adalah stable key
    for (const pm of paymentMethods) {
      const type = pm.category; // category = type (tunai/transfer/qris/dll)
      if (!type) continue;
      // displayName hanya dikirim jika berbeda dari nama default
      const display = pm as PaymentMethod & { defaultName?: string };
      const customName = display.defaultName && pm.name !== display.defaultName
        ? pm.name : null;
      await pushPaymentMethodConfig(type, customName, pm.isDefault ? 1 : 0);
    }

    // Push suppliers
    for (const s of suppliers) {
      await makeRequest('POST', '/suppliers', {
        id: s.id, name: s.name, phone: s.phone, address: s.address,
        notes: s.notes, isDeleted: s.isDeleted ?? 0, deletedAt: serializeDate(s.deletedAt),
      });
    }

    // Push shifts
    for (const s of shifts) {
      await makeRequest('POST', '/shifts', {
        id: s.id, userId: s.userId, userName: s.userName,
        openedAt: serializeDate(s.openedAt), closedAt: serializeDate(s.closedAt),
        status: s.status, openingCash: s.openingCash, notes: s.notes ?? null,
      });
    }

    // Push stockIns
    for (const si of stockIns) {
      await makeRequest('POST', '/stock-ins', {
        id: si.id, productId: si.productId, supplierId: si.supplierId,
        quantity: si.quantity, buyPrice: si.buyPrice, totalPrice: si.totalPrice,
        date: serializeDate(si.date), notes: si.notes,
      });
    }

    // Push stockOuts
    for (const so of stockOuts) {
      await makeRequest('POST', '/stock-outs', {
        id: so.id, productId: so.productId, quantity: so.quantity,
        reason: so.reason, date: serializeDate(so.date), notes: so.notes,
      });
    }

    // Push transactions
    for (const tx of transactions) {
      const items = transactionItems.filter(ti => ti.transactionId === tx.id);
      await pushTransaction(tx, items);
    }

    // Push store settings
    if (settings) {
      await pushStoreSettings(settings);
    }

    console.log('[api-client] pushAllData complete ✅');
  } catch (err) {
    console.error('[api-client] pushAllData failed:', err);
  }
}

/**
 * Push category ke server (fire-and-forget).
 */
export async function pushCategory(cat: Category): Promise<void> {
  try {
    if (!getJwt()) return;
    await makeRequest('POST', '/categories', {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      isDeleted: cat.isDeleted ?? 0,
      deletedAt: serializeDate(cat.deletedAt),
      createdAt: serializeDate(cat.createdAt) ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api-client] pushCategory failed:', err);
  }
}

/**
 * Push storeSettings ke server (fire-and-forget). Termasuk logo.
 */
export async function pushStoreSettings(s: StoreSettings): Promise<void> {
  try {
    if (!getJwt()) return;
    await makeRequest('POST', '/store-settings', {
      storeName: s.storeName,
      address: s.address,
      phone: s.phone,
      receiptFooter: s.receiptFooter,
      themeColor: s.themeColor ?? null,
      logo: s.logo ?? null,
      deviceId: s.deviceId,
    });
  } catch (err) {
    console.error('[api-client] pushStoreSettings failed:', err);
  }
}

/**
 * Push perubahan payment method config ke server.
 * Menggunakan `type` sebagai key — tidak pernah bentrok antar store.
 * `displayName` dan `isActive` keduanya optional — hanya field yang disertakan yang diupdate.
 */
export async function pushPaymentMethodConfig(
  type: string,
  displayName: string | null | undefined,
  isActive: number | undefined
): Promise<void> {
  try {
    if (!getJwt()) return;
    const body: Record<string, unknown> = {};
    if (displayName !== undefined) body.displayName = displayName?.trim() || null;
    if (isActive !== undefined) body.isActive = isActive;
    await makeRequest('PUT', `/payment-methods/${type}`, body);
  } catch (err) {
    console.error('[api-client] pushPaymentMethodConfig failed:', err);
  }
}
