/**
 * use-socket.ts — Socket.IO client hook untuk Lini POS
 *
 * Mendengarkan event 'data-changed' dari server dan langsung
 * update IndexedDB. Karena UI menggunakan useLiveQuery (Dexie),
 * UI otomatis re-render tanpa perlu refresh.
 */
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { db, type Category, type PaymentMethod, type Product, type Shift, type StoreSettings, type Supplier, type Transaction, type User } from '@/lib/db';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)
  ?? 'https://api.afiframadhan.my.id';

type SocketVariantGroup = {
  id: number;
  name: string;
  sortOrder: number;
  options: Array<{ id: number; name: string; price: number; hpp: number; sortOrder: number }>;
};

type SocketData = Partial<Category & PaymentMethod & Product & Shift & StoreSettings & Supplier & Transaction & User> & {
  batch?: boolean;
  defaultName?: string;
  groups?: SocketVariantGroup[];
  icon?: string;
  isActive?: boolean | number;
  isDeleted?: number;
  productId?: number;
  type?: string;
};

interface DataChangedPayload {
  table: string;
  action: 'upsert' | 'delete';
  data: SocketData;
  ts: string;
}

let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(API_BASE, {
      transports: ['polling', 'websocket'], // polling dulu, upgrade ke WS kalau bisa
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 20,
      path: '/socket.io/',
    });
  }
  return socketInstance;
}

// Handle incoming data-changed events → upsert to IndexedDB
async function handleDataChanged(payload: DataChangedPayload) {
  const { table, action, data } = payload;

  // Handle variants-replaced — event khusus yang replace semua variant untuk satu produk
  if (table === 'variants-replaced' && data?.productId) {
    try {
      const productId = data.productId as number;
      const groups = (data.groups ?? []) as Array<{
        id: number; name: string; sortOrder: number;
        options: Array<{ id: number; name: string; price: number; hpp: number; sortOrder: number }>;
      }>;
      // 1. Hapus semua variant lama untuk produk ini di IndexedDB lokal
      const oldGroups = await db.variantGroups.where('productId').equals(productId).toArray();
      for (const og of oldGroups) {
        await db.variantOptions.where('variantGroupId').equals(og.id!).delete();
      }
      await db.variantGroups.where('productId').equals(productId).delete();
      // 2. PUT semua variant baru (dengan server IDs)
      for (const g of groups) {
        await db.variantGroups.put({ id: g.id, productId, name: g.name, sortOrder: g.sortOrder ?? 0 });
        for (const o of g.options) {
          await db.variantOptions.put({
            id: o.id, variantGroupId: g.id, productId,
            name: o.name, price: Number(o.price ?? 0), hpp: Number(o.hpp ?? 0), sortOrder: o.sortOrder ?? 0,
          });
        }
      }
    } catch (err) {
      console.error('[socket] variants-replaced error:', err);
    }
    return;
  }

  if (!data || data.batch) return;

  try {
    switch (table) {
      case 'products':
        if (data.id) {
          if (action === 'delete') {
            // Soft delete dari device lain
            await db.products.update(data.id, { isDeleted: 1, deletedAt: new Date() }).catch(() => {});
          } else {
            await db.products.put({
              ...data,
              price: Number(data.price ?? 0),
              hpp: Number(data.hpp ?? 0),
              stock: Number(data.stock ?? 0),
              unlimitedStock: Boolean(data.unlimitedStock),
              isDeleted: data.isDeleted ?? 0,
              isActive: data.isActive ?? 1,
              sortOrder: data.sortOrder ?? 0,
              createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
              updatedAt: new Date(),
              deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
            });
          }
        }
        break;

      case 'categories':
        if (data.id) {
          await db.categories.put({
            ...data,
            isDeleted: data.isDeleted ?? 0,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
          });
        }
        break;

      case 'transactions':
        if (data.id && data.receiptNumber) {
          // Upsert transaction langsung ke IndexedDB
          const existingTx = await db.transactions.get(data.id);
          if (existingTx) {
            // Update field yang mungkin berubah
            await db.transactions.update(data.id, {
              status: data.status ?? existingTx.status,
              total: data.total ? Number(data.total) : existingTx.total,
              closedAt: data.closedAt ? new Date(data.closedAt) : existingTx.closedAt,
            });
          } else {
            // Transaksi baru dari device lain (termasuk open bill) — pull data lengkap
            import('@/lib/api-client').then(async ({ syncFromServer }) => {
              await syncFromServer();
            });
          }
        }
        break;

      case 'shifts':
        if (data.id) {
          await db.shifts.put({
            id: data.id,
            userId: data.userId,
            userName: data.userName,
            openedAt: data.openedAt ? new Date(data.openedAt) : new Date(),
            closedAt: data.closedAt ? new Date(data.closedAt) : undefined,
            status: data.status ?? 'open',
            openingCash: Number(data.openingCash ?? 0),
            notes: data.notes ?? undefined,
          });
        }
        break;

      case 'users':
        if (data.id) {
          const existing = await db.users.get(data.id);
          await db.users.put({
            id: data.id,
            name: data.name,
            pin: data.pin ?? existing?.pin ?? '',
            role: data.role,
            isActive: data.isActive !== undefined ? Boolean(data.isActive) : (existing?.isActive ?? true),
            createdAt: existing?.createdAt ?? new Date(),
          });
        }
        break;

      case 'paymentMethods':
        if (data.id) {
          // Server kirim isActive (bukan isDefault) dari paymentMethodConfigs
          const pmExisting = await db.paymentMethods.get(data.id);
          await db.paymentMethods.put({
            id: data.id,
            name: data.name ?? pmExisting?.name ?? '',
            category: data.type ?? data.category ?? pmExisting?.category ?? 'tunai',
            isDefault: data.isActive !== undefined
              ? Boolean(data.isActive)
              : Boolean(data.isDefault ?? pmExisting?.isDefault ?? true),
            createdAt: pmExisting?.createdAt ?? new Date(),
            // Extra fields
            ...(data.defaultName !== undefined ? { defaultName: data.defaultName } : {}),
            ...(data.icon !== undefined ? { icon: data.icon } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          });
        }
        break;

      case 'variantGroups':
        // Variant dikirim via 'variants-replaced' — ini fallback jika ada event lama
        // Tidak di-handle disini untuk cegah duplikasi
        break;

      case 'variantOptions':
        // Sama, skip — ditangani via 'variants-replaced'
        break;

      case 'suppliers':
        if (data.id) {
          await db.suppliers.put({
            id: data.id,
            name: data.name,
            phone: data.phone ?? '',
            address: data.address ?? '',
            notes: data.notes ?? '',
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            isDeleted: data.isDeleted ?? 0,
            deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
          });
        }
        break;

      case 'storeSettings': {
        // Pull langsung dari server untuk dapat semua field termasuk logo
        import('@/lib/api-client').then(async ({ pullSync }) => {
          const result = await pullSync();
          if (result?.storeSettings) {
            const localSettings = await db.storeSettings.toCollection().first();
            const remote = result.storeSettings as Partial<StoreSettings>;
            if (localSettings?.id) {
              const safeUpdate: Record<string, unknown> = {};
              if (remote.storeName) safeUpdate.storeName = remote.storeName;
              if (remote.address !== undefined) safeUpdate.address = remote.address;
              if (remote.phone !== undefined) safeUpdate.phone = remote.phone;
              if (remote.receiptFooter !== undefined) safeUpdate.receiptFooter = remote.receiptFooter;
              if (remote.themeColor !== undefined) safeUpdate.themeColor = remote.themeColor;
              if (remote.logo !== undefined) safeUpdate.logo = remote.logo;
              if (Object.keys(safeUpdate).length > 0) {
                await db.storeSettings.update(localSettings.id, safeUpdate);
                // Apply theme color langsung ke CSS supaya UI langsung berubah
                if (remote.themeColor !== undefined) {
                  import('@/hooks/use-theme-color').then(({ setThemeColor }) => {
                    setThemeColor(remote.themeColor);
                  });
                }
              }
            }
          }
        });
        break;
      }

      default:
        // Unknown table — do nothing, let manual sync handle it
        break;
    }
  } catch (err) {
    console.error('[socket] handleDataChanged error:', err);
  }
}

export function useSocket(enabled: boolean) {
  const [isConnected, setIsConnected] = useState(false);
  const handlerRef = useRef(handleDataChanged);

  useEffect(() => {
    if (!enabled) {
      console.log('[socket] disabled (no JWT)');
      return;
    }

    const socket = getSocket();
    console.log('[socket] connecting to', API_BASE);

    const onConnect = () => {
      setIsConnected(true);
      console.log('[socket] connected');
      // Join store-specific room agar hanya menerima event dari toko sendiri
      const jwt = localStorage.getItem('linipos-jwt');
      if (jwt) {
        socket.emit('join-store', jwt);
        console.log('[socket] join-store emitted');
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
      console.log('[socket] disconnected');
    };

    const onDataChanged = (payload: DataChangedPayload) => {
      handlerRef.current(payload);
    };

    const onStoreJoined = (data: { storeId: number; room: string }) => {
      console.log(`[socket] joined store room: ${data.room}`);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('data-changed', onDataChanged);
    socket.on('store-joined', onStoreJoined);
    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error:', err.message);
    });

    if (!socket.connected) {
      socket.connect();
    } else {
      setIsConnected(true);
      // Sudah connect — langsung join store room
      const jwt = localStorage.getItem('linipos-jwt');
      if (jwt) {
        socket.emit('join-store', jwt);
      }
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('data-changed', onDataChanged);
      socket.off('store-joined', onStoreJoined);
    };
  }, [enabled]);

  return { isConnected };
}
