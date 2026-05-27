import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useRef } from 'react';
import { Settings, Store, CreditCard, Tag, Download, Upload, Plus, Trash2, Edit2, Info, Truck, ArrowDownToLine, ArrowUpFromLine, ChevronRight, Receipt, Palette, HardDrive, Package, Camera, X, Users, Shield, ShieldAlert, Key, LogOut } from 'lucide-react';
import ThemeColorPicker from '@/components/ThemeColorPicker';
import { setThemeColor } from '@/hooks/use-theme-color';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { exportBackupData } from '@/components/BackupReminder';
import { compressImage } from '@/lib/image-utils';
import { useAuth } from '@/lib/auth-context';
import { hashPin } from '@/lib/hash-utils';
import {
  db,
  type Category,
  type HppHistory,
  type PaymentMethod,
  type Product,
  type Shift,
  type StockIn,
  type StockOut,
  type StoreSettings,
  type Supplier,
  type Transaction,
  type TransactionItemRecord,
  type User,
  type VariantGroup,
  type VariantOption,
} from '@/lib/db';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

type PaymentMethodDisplay = PaymentMethod & {
  defaultName?: string;
  icon?: string;
};

type BackupDateValue = Date | string | null | undefined;
type BackupCategory = Omit<Partial<Category>, 'createdAt' | 'deletedAt'> & { createdAt?: BackupDateValue; deletedAt?: BackupDateValue };
type BackupProduct = Omit<Partial<Product>, 'createdAt' | 'updatedAt' | 'deletedAt'> & { createdAt?: BackupDateValue; updatedAt?: BackupDateValue; deletedAt?: BackupDateValue };
type BackupSupplier = Omit<Partial<Supplier>, 'createdAt' | 'deletedAt'> & { createdAt?: BackupDateValue; deletedAt?: BackupDateValue };
type BackupDatedRecord = { date?: BackupDateValue };
type BackupPaymentMethod = Omit<Partial<PaymentMethod>, 'createdAt'> & { createdAt?: BackupDateValue };
type BackupTransaction = Omit<Partial<Transaction>, 'date' | 'openedAt' | 'closedAt'> & {
  date?: BackupDateValue;
  openedAt?: BackupDateValue;
  closedAt?: BackupDateValue;
  items?: BackupTransactionItem[];
};
type BackupTransactionItem = Partial<TransactionItemRecord>;
type BackupShift = Omit<Partial<Shift>, 'openedAt' | 'closedAt'> & { openedAt?: BackupDateValue; closedAt?: BackupDateValue };
type BackupStoreSettings = Omit<Partial<StoreSettings>, 'lastBackupAt'> & { lastBackupAt?: BackupDateValue };
type BackupData = {
  version?: number;
  exportedAt?: string;
  categories?: BackupCategory[];
  products?: BackupProduct[];
  variantGroups?: Partial<VariantGroup>[];
  variantOptions?: Partial<VariantOption>[];
  suppliers?: BackupSupplier[];
  stockIns?: Array<Partial<StockIn> & BackupDatedRecord>;
  stockOuts?: Array<Partial<StockOut> & BackupDatedRecord>;
  hppHistory?: Array<Partial<HppHistory> & BackupDatedRecord>;
  paymentMethods?: BackupPaymentMethod[];
  transactions?: BackupTransaction[];
  transactionItems?: BackupTransactionItem[];
  shifts?: BackupShift[];
  storeSettings?: BackupStoreSettings[];
};


export default function Pengaturan() {
  const { isOwner, currentUser, logout } = useAuth();
  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());
  const categories = useLiveQuery(() => db.categories.where('isDeleted').equals(0).toArray());
  const allUsers = useLiveQuery(() => db.users.toArray());
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ version: number; exportedAt: string; productCount: number; transactionCount: number; categoryCount: number } | null>(null);
  const [importRawData, setImportRawData] = useState<BackupData | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Store edit
  const [storeDialog, setStoreDialog] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeAddr, setStoreAddr] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeLogo, setStoreLogo] = useState<string | undefined>(undefined);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Payment method — new type-based system
  const [pmRenameDialog, setPmRenameDialog] = useState(false);
  const [pmRenameType, setPmRenameType] = useState('');
  const [pmRenameValue, setPmRenameValue] = useState('');
  const [pmRenameDefault, setPmRenameDefault] = useState('');



  // User Management
  const [userDialog, setUserDialog] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<'owner' | 'kasir'>('kasir');
  const [userPin, setUserPin] = useState('');
  const [userConfirmPin, setUserConfirmPin] = useState('');
  const [userEditId, setUserEditId] = useState<number | null>(null);
  const [userPinStep, setUserPinStep] = useState<'info' | 'pin' | 'confirm'>('info');
  const [userPinError, setUserPinError] = useState('');

  // Change Own PIN Dialog
  const [ownPinDialog, setOwnPinDialog] = useState(false);
  const [ownPinNew, setOwnPinNew] = useState('');
  const [ownPinConfirm, setOwnPinConfirm] = useState('');
  const [ownPinStep, setOwnPinStep] = useState<'pin' | 'confirm'>('pin');
  const [ownPinError, setOwnPinError] = useState('');

  // Storage info (CR-9)
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => {
        setStorageUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      });
    }
  }, []);

  const openStoreEdit = () => {
    setStoreName(storeSettings?.storeName ?? '');
    setStoreAddr(storeSettings?.address ?? '');
    setStorePhone(storeSettings?.phone ?? '');
    setStoreLogo(storeSettings?.logo);
    setStoreDialog(true);
  };

  const saveStore = async () => {
    if (storeSettings?.id) {
      await db.storeSettings.update(storeSettings.id, { storeName: storeName.trim(), address: storeAddr.trim(), phone: storePhone.trim(), logo: storeLogo || undefined });
      toast.success('Info toko disimpan');
      setStoreDialog(false);
      // Push ke server → broadcast ke device lain
      const updated = await db.storeSettings.get(storeSettings.id);
      if (updated) import('@/lib/api-client').then(({ pushStoreSettings }) => pushStoreSettings(updated));
    }
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setStoreLogo(compressed);
    } catch {
      toast.error('Gagal memproses gambar');
    }
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const openPmRename = (pm: PaymentMethod) => {
    const display = pm as PaymentMethodDisplay;
    setPmRenameType(pm.category);
    setPmRenameValue(pm.name !== display.defaultName ? pm.name : '');
    setPmRenameDefault(display.defaultName ?? pm.name);
    setPmRenameDialog(true);
  };
  const savePmRename = async () => {
    const newName = pmRenameValue.trim() || null;
    const displayName = newName ?? pmRenameDefault;

    // Ambil data terbaru dari IndexedDB
    const existing = await db.paymentMethods.where('category').equals(pmRenameType).first();
    if (!existing?.id) { setPmRenameDialog(false); return; }

    // Optimistic update lokal — put() lebih reliable dari update() untuk useLiveQuery
    await db.paymentMethods.put({
      ...existing,
      name: displayName,
    });

    setPmRenameDialog(false);
    toast.success('Nama metode diperbarui');

    // Push HANYA displayName ke server — TIDAK kirim isActive agar toggle tidak berubah
    import('@/lib/api-client').then(({ pushPaymentMethodConfig }) =>
      pushPaymentMethodConfig(pmRenameType, newName, undefined)
    );
  };

  const togglePm = async (pm: PaymentMethod) => {
    const newActive = pm.isDefault ? false : true;

    // Optimistic update — langsung put() agar useLiveQuery re-render instan
    if (pm.id) {
      await db.paymentMethods.put({
        ...pm,
        isDefault: newActive,
      });
    }
    toast.success(newActive ? 'Metode diaktifkan' : 'Metode dinonaktifkan');

    // Push HANYA isActive ke server — TIDAK kirim displayName agar nama tidak berubah
    import('@/lib/api-client').then(({ pushPaymentMethodConfig }) =>
      pushPaymentMethodConfig(pm.category, undefined, newActive ? 1 : 0)
    );
  };



  // User management functions
  const PIN_LENGTH = 4;
  const openUserAdd = () => {
    setUserEditId(null);
    setUserName('');
    setUserRole('kasir');
    setUserPin('');
    setUserConfirmPin('');
    setUserPinStep('info');
    setUserPinError('');
    setUserDialog(true);
  };
  const openUserEdit = (u: User) => {
    setUserEditId(u.id!);
    setUserName(u.name);
    setUserRole(u.role);
    setUserPin('');
    setUserConfirmPin('');
    setUserPinStep('info');
    setUserPinError('');
    setUserDialog(true);
  };

  const handleUserPinDigit = (digit: string, target: 'pin' | 'confirm') => {
    if (target === 'pin' && userPin.length < PIN_LENGTH) {
      setUserPin(prev => prev + digit);
      setUserPinError('');
    } else if (target === 'confirm' && userConfirmPin.length < PIN_LENGTH) {
      const newVal = userConfirmPin + digit;
      setUserConfirmPin(newVal);
      setUserPinError('');
      if (newVal.length === PIN_LENGTH && newVal !== userPin) {
        setUserPinError('PIN tidak cocok');
        setTimeout(() => { setUserConfirmPin(''); setUserPinError(''); }, 800);
      }
    }
  };

  const handleUserPinBackspace = (target: 'pin' | 'confirm') => {
    if (target === 'pin') setUserPin(prev => prev.slice(0, -1));
    else setUserConfirmPin(prev => prev.slice(0, -1));
    setUserPinError('');
  };

  const openOwnPinChange = () => {
    setOwnPinNew('');
    setOwnPinConfirm('');
    setOwnPinStep('pin');
    setOwnPinError('');
    setOwnPinDialog(true);
  };

  const handleOwnPinDigit = (digit: string, target: 'pin' | 'confirm') => {
    if (target === 'pin' && ownPinNew.length < PIN_LENGTH) {
      setOwnPinNew(prev => prev + digit);
      setOwnPinError('');
    } else if (target === 'confirm' && ownPinConfirm.length < PIN_LENGTH) {
      const newVal = ownPinConfirm + digit;
      setOwnPinConfirm(newVal);
      setOwnPinError('');
      if (newVal.length === PIN_LENGTH && newVal !== ownPinNew) {
        setOwnPinError('PIN tidak cocok');
        setTimeout(() => { setOwnPinConfirm(''); setOwnPinError(''); }, 800);
      }
    }
  };

  const handleOwnPinBackspace = (target: 'pin' | 'confirm') => {
    if (target === 'pin') setOwnPinNew(prev => prev.slice(0, -1));
    else setOwnPinConfirm(prev => prev.slice(0, -1));
    setOwnPinError('');
  };

  const saveOwnPin = async () => {
    if (!currentUser?.id) return;
    if (ownPinNew.length < PIN_LENGTH) { toast.error(`PIN harus ${PIN_LENGTH} digit`); return; }
    if (ownPinNew !== ownPinConfirm) { toast.error('PIN tidak cocok'); return; }
    try {
      const hashedPin = await hashPin(ownPinNew);
      await db.users.update(currentUser.id, { pin: hashedPin });
      toast.success('PIN Anda berhasil diperbarui!');
      setOwnPinDialog(false);
      const updatedUser = await db.users.get(currentUser.id);
      if (updatedUser) {
        import('@/lib/api-client').then(({ syncUser }) => syncUser(updatedUser));
      }
    } catch {
      toast.error('Gagal memperbarui PIN');
    }
  };

  const saveUser = async () => {
    if (!userName.trim()) { toast.error('Nama harus diisi'); return; }

    if (userEditId) {
      // Update existing user
      const update: Partial<User> = { name: userName.trim(), role: userRole };
      if (userPin.length === PIN_LENGTH && userPin === userConfirmPin) {
        update.pin = await hashPin(userPin);
      }
      await db.users.update(userEditId, update);
      toast.success('User berhasil diperbarui');
      // Sync perubahan ke server
      const updatedUser = await db.users.get(userEditId);
      if (updatedUser) {
        import('@/lib/api-client').then(({ syncUser }) => syncUser(updatedUser));
      }
    } else {
      // Create new user
      if (userPin.length < PIN_LENGTH) { toast.error(`PIN harus ${PIN_LENGTH} digit`); return; }
      if (userPin !== userConfirmPin) { toast.error('PIN tidak cocok'); return; }
      const hashedPin = await hashPin(userPin);
      const newUserId = await db.users.add({
        name: userName.trim(),
        pin: hashedPin,
        role: userRole,
        isActive: true,
        createdAt: new Date(),
      });
      toast.success('User baru berhasil ditambahkan');
      // Sync user baru ke server
      const newUser = await db.users.get(newUserId as number);
      if (newUser) {
        import('@/lib/api-client').then(({ syncUser }) => syncUser(newUser));
      }
    }
    setUserDialog(false);
  };

  const toggleUserActive = async (userId: number, currentlyActive: boolean) => {
    if (userId === currentUser?.id) { toast.error('Tidak bisa menonaktifkan diri sendiri'); return; }
    await db.users.update(userId, { isActive: !currentlyActive });
    toast.success(!currentlyActive ? 'User diaktifkan' : 'User dinonaktifkan');
    // Sync perubahan ke server
    const updatedUser = await db.users.get(userId);
    if (updatedUser) {
      import('@/lib/api-client').then(({ syncUser }) => syncUser(updatedUser));
    }
  };

  // Step-1: pick file, parse, show preview dialog
  const handleImportPick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (!text.trim()) { toast.error('File kosong'); return; }
        const data = JSON.parse(text) as BackupData;
        if (!data.version) { toast.error('File tidak valid — bukan format backup Lini POS'); return; }
        const hasSomeData = ['categories', 'products', 'transactions', 'paymentMethods'].some(
          (key: string) => Array.isArray(data[key]) && data[key].length > 0
        );
        if (!hasSomeData) { toast.error('File backup kosong / tidak berisi data'); return; }
        setImportRawData(data);
        setImportPreview({
          version: data.version,
          exportedAt: data.exportedAt,
          productCount: data.products?.length ?? 0,
          transactionCount: data.transactions?.length ?? 0,
          categoryCount: data.categories?.length ?? 0,
        });
        setImportConfirmOpen(true);
      } catch { toast.error('Gagal membaca file. Pastikan file valid (.json).'); }
    };
    input.click();
  };

  // Step-2: user confirmed — do actual restore with rollback
  const handleImportConfirm = async () => {
    if (!importRawData || isImporting) return;
    setIsImporting(true);
    const data = importRawData;
    // Snapshot for rollback
    const snapshot = {
      categories: await db.categories.toArray(),
      products: await db.products.toArray(),
      variantGroups: await db.variantGroups.toArray(),
      variantOptions: await db.variantOptions.toArray(),
      suppliers: await db.suppliers.toArray(),
      stockIns: await db.stockIns.toArray(),
      stockOuts: await db.stockOuts.toArray(),
      hppHistory: await db.hppHistory.toArray(),
      paymentMethods: await db.paymentMethods.toArray(),
      transactions: await db.transactions.toArray(),
      transactionItems: await db.transactionItems.toArray(),
      shifts: await db.shifts.toArray(),
      storeSettings: await db.storeSettings.toArray(),
    };
    try {
      await db.categories.clear(); await db.products.clear(); await db.suppliers.clear();
      await db.variantGroups.clear(); await db.variantOptions.clear();
      await db.stockIns.clear(); await db.stockOuts.clear(); await db.hppHistory.clear();
      await db.paymentMethods.clear(); await db.transactions.clear(); await db.transactionItems.clear();
      await db.shifts.clear(); await db.storeSettings.clear();

      const d = (v: BackupDateValue) => v ? new Date(v) : null;
      const fixCat = (r: BackupCategory) => ({ ...r, createdAt: d(r.createdAt), deletedAt: d(r.deletedAt) }) as Category;
      const fixProd = (r: BackupProduct) => ({ ...r, createdAt: d(r.createdAt), updatedAt: d(r.updatedAt), deletedAt: d(r.deletedAt) }) as Product;
      const fixSupp = (r: BackupSupplier) => ({ ...r, createdAt: d(r.createdAt), deletedAt: d(r.deletedAt) }) as Supplier;
      const fixDate = <T extends BackupDatedRecord>(r: T) => ({ ...r, date: d(r.date) });
      const fixPM = (r: BackupPaymentMethod) => ({ ...r, createdAt: d(r.createdAt) }) as PaymentMethod;
      const fixTx = (r: BackupTransaction) => ({ ...r, date: d(r.date), openedAt: d(r.openedAt), closedAt: d(r.closedAt) }) as Transaction;
      const fixShift = (r: BackupShift) => ({ ...r, openedAt: d(r.openedAt), closedAt: d(r.closedAt) }) as Shift;
      const fixSS = (r: BackupStoreSettings) => ({ ...r, lastBackupAt: d(r.lastBackupAt) }) as StoreSettings;

      if (data.categories?.length) await db.categories.bulkAdd(data.categories.map(fixCat));
      if (data.products?.length) await db.products.bulkAdd(data.products.map(fixProd));
      if (data.variantGroups?.length) await db.variantGroups.bulkAdd(data.variantGroups as VariantGroup[]);
      if (data.variantOptions?.length) await db.variantOptions.bulkAdd(data.variantOptions as VariantOption[]);
      if (data.suppliers?.length) await db.suppliers.bulkAdd(data.suppliers.map(fixSupp));
      if (data.stockIns?.length) await db.stockIns.bulkAdd(data.stockIns.map(fixDate) as StockIn[]);
      if (data.stockOuts?.length) await db.stockOuts.bulkAdd(data.stockOuts.map(fixDate) as StockOut[]);
      if (data.hppHistory?.length) await db.hppHistory.bulkAdd(data.hppHistory.map(fixDate) as HppHistory[]);
      // Restore paymentMethods lokal — update isActive/displayName per type
      // TIDAK push ke server via pushAllData untuk PM, karena server pakai tabel baru
      // PM akan di-sync via pushPaymentMethodConfig per type
      if (data.paymentMethods?.length) {
        const pmsFromBackup = data.paymentMethods.map(fixPM);
        for (const pm of pmsFromBackup) {
          const type = pm.category;
          if (!type) continue;
          const existing = await db.paymentMethods.where('category').equals(type).first();
          if (existing?.id) {
            // Update lokal — jaga isDefault (isActive) dan nama dari backup
            await db.paymentMethods.put({
              ...existing,
              name: pm.name ?? existing.name,
              isDefault: Boolean(pm.isDefault ?? existing.isDefault),
            });
          }
        }
      }

      // Restore transactions, shifts, storeSettings
      if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions.map(fixTx));
      if (data.shifts?.length) await db.shifts.bulkAdd(data.shifts.map(fixShift));
      if (data.storeSettings?.length) await db.storeSettings.bulkAdd(data.storeSettings.map(fixSS));
      if (data.transactionItems?.length) {
        await db.transactionItems.bulkAdd(data.transactionItems);
      } else if (data.version === 1 && data.transactions?.length) {
        // Kompatibilitas format backup v1 — items embedded di transactions
        for (const t of data.transactions) {
          if (Array.isArray(t.items) && t.items.length > 0) {
            await db.transactionItems.bulkAdd(t.items.map((item) => ({
              transactionId: t.id, productId: item.productId, productName: item.productName,
              quantity: item.quantity, price: item.price, hpp: item.hpp,
              discountType: item.discountType, discountValue: item.discountValue,
              discountAmount: item.discountAmount, subtotal: item.subtotal,
            })) as TransactionItemRecord[]);
          }
        }
      }

      toast.success('✅ Data berhasil di-restore!');
      // Background push semua data yang baru di-restore ke server (kecuali PM — sudah handled)
      import('@/lib/api-client').then(({ pushAllData }) => {
        setTimeout(() => pushAllData(), 1000); // delay 1 detik biar IndexedDB settle
      });
    } catch {
      try {
        await db.categories.clear(); await db.products.clear(); await db.suppliers.clear();
        await db.variantGroups.clear(); await db.variantOptions.clear();
        await db.stockIns.clear(); await db.stockOuts.clear(); await db.hppHistory.clear();
        await db.paymentMethods.clear(); await db.transactions.clear(); await db.transactionItems.clear();
        await db.shifts.clear(); await db.storeSettings.clear();
        if (snapshot.categories.length) await db.categories.bulkAdd(snapshot.categories);
        if (snapshot.products.length) await db.products.bulkAdd(snapshot.products);
        if (snapshot.variantGroups.length) await db.variantGroups.bulkAdd(snapshot.variantGroups);
        if (snapshot.variantOptions.length) await db.variantOptions.bulkAdd(snapshot.variantOptions);
        if (snapshot.suppliers.length) await db.suppliers.bulkAdd(snapshot.suppliers);
        if (snapshot.stockIns.length) await db.stockIns.bulkAdd(snapshot.stockIns);
        if (snapshot.stockOuts.length) await db.stockOuts.bulkAdd(snapshot.stockOuts);
        if (snapshot.hppHistory.length) await db.hppHistory.bulkAdd(snapshot.hppHistory);
        if (snapshot.paymentMethods.length) await db.paymentMethods.bulkAdd(snapshot.paymentMethods);
        if (snapshot.transactions.length) await db.transactions.bulkAdd(snapshot.transactions);
        if (snapshot.transactionItems.length) await db.transactionItems.bulkAdd(snapshot.transactionItems);
        if (snapshot.shifts.length) await db.shifts.bulkAdd(snapshot.shifts);
        if (snapshot.storeSettings.length) await db.storeSettings.bulkAdd(snapshot.storeSettings);
        toast.error('Restore gagal — data dikembalikan ke kondisi sebelumnya');
      } catch { toast.error('Restore dan rollback gagal. Mohon restore manual dari file backup.'); }
      setImportConfirmOpen(false);
    } finally { setIsImporting(false); }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportBackupData();
      toast.success('Backup berhasil diunduh!');
    } catch { toast.error('Gagal membuat backup'); }
    finally { setIsExporting(false); }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      await db.transactions.clear();
      await db.transactionItems.clear();
      await db.shifts.clear();
      toast.success('✅ Riwayat transaksi & shift berhasil di-reset!');
      setResetDialogOpen(false);
    } catch {
      toast.error('Gagal melakukan reset data');
    } finally {
      setIsResetting(false);
    }
  };


  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Pengaturan
        </h1>
        <p className="text-xs text-muted-foreground mt-1 leading-normal">
          Konfigurasi profil toko, metode pembayaran, dan manajemen pengguna
        </p>
      </div>

      {/* Kasir: Profil Page */}
      {!isOwner ? (
        <div className="space-y-4">
          {/* Profile Card */}
          <Card className="border-0 shadow-sm overflow-hidden rounded-2xl">
            <div className="h-24 bg-gradient-to-br from-primary/80 to-primary" />
            <CardContent className="px-4 pb-5 -mt-10">
              <div className="flex items-end gap-3 mb-4">
                <div className="w-20 h-20 rounded-2xl bg-card border-4 border-card shadow-md flex items-center justify-center text-3xl font-bold text-primary">
                  {currentUser?.name.charAt(0).toUpperCase()}
                </div>
                <div className="pb-1.5">
                  <p className="text-lg font-bold">{currentUser?.name}</p>
                  <span className="text-[10px] bg-accent/10 text-accent font-semibold px-2.5 py-0.5 rounded-full capitalize">{currentUser?.role}</span>
                </div>
              </div>
              
              {storeSettings && (
                <div className="flex items-center gap-3 bg-muted/40 rounded-2xl px-4 py-3 mb-4">
                  <Store className="w-5 h-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{storeSettings.storeName}</p>
                    {storeSettings.address && <p className="text-[10px] text-muted-foreground truncate">{storeSettings.address}</p>}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  variant="outline"
                  className="h-11 text-xs gap-1.5 border-primary/20 text-primary hover:bg-primary/5 rounded-xl font-semibold justify-center"
                  onClick={() => openOwnPinChange()}
                >
                  <Key className="w-3.5 h-3.5" />
                  Ubah PIN Staf
                </Button>
                <Button
                  variant="outline"
                  className="h-11 text-xs gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl font-semibold justify-center"
                  onClick={() => logout()}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Kunci / Ganti User
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Storage Info & Version (Borderless sleek bar, single line on desktop) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-muted-foreground pt-4 border-t border-border/40 mt-4 px-1">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-primary" />
              <span>Versi Aplikasi</span>
              <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[10px]">v1.2.0</span>
            </div>
            
            {storageUsage && (
              <div className="flex items-center gap-3 w-full sm:w-auto sm:max-w-xs flex-1">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  <HardDrive className="w-3.5 h-3.5 text-primary" />
                  <span>Penyimpanan:</span>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, (storageUsage.usage / storageUsage.quota) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0 whitespace-nowrap">
                    {formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <Tabs defaultValue="toko" className="w-full space-y-4">
            <TabsList className="w-full grid grid-cols-4 bg-muted/60 p-1 rounded-xl h-11 shrink-0">
              <TabsTrigger value="toko" className="rounded-lg text-xs py-1.5 px-3 font-semibold flex items-center justify-center gap-1.5 transition-all">
                <Store className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Toko & Tema</span>
                <span className="sm:hidden">Toko</span>
              </TabsTrigger>
              <TabsTrigger value="pembayaran" className="rounded-lg text-xs py-1.5 px-3 font-semibold flex items-center justify-center gap-1.5 transition-all">
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pembayaran</span>
                <span className="sm:hidden">Bayar</span>
              </TabsTrigger>
              <TabsTrigger value="user" className="rounded-lg text-xs py-1.5 px-3 font-semibold flex items-center justify-center gap-1.5 transition-all">
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pengguna</span>
                <span className="sm:hidden">User</span>
              </TabsTrigger>
              <TabsTrigger value="sistem" className="rounded-lg text-xs py-1.5 px-3 font-semibold flex items-center justify-center gap-1.5 transition-all">
                <HardDrive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sistem & Data</span>
                <span className="sm:hidden">Data</span>
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: TOKO & TEMA ── */}
            <TabsContent value="toko" className="space-y-4 outline-none">
              {/* Store Info */}
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-2xl overflow-hidden" onClick={openStoreEdit}>
                <CardContent className="p-4 flex items-center gap-4 bg-card">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center overflow-hidden shrink-0">
                    {storeSettings?.logo ? (
                      <img src={storeSettings.logo} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <Store className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{storeSettings?.storeName || 'Toko Saya'}</p>
                    <p className="text-xs text-muted-foreground truncate">{storeSettings?.address || 'Belum diatur'}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                </CardContent>
              </Card>

              {/* Theme Color */}
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5 font-bold"><Palette className="w-4 h-4 text-primary" /> Warna Tema</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Sesuaikan warna primer Lini POS untuk seluruh perangkat.</p>
                </CardHeader>
                <CardContent>
                  <ThemeColorPicker
                    value={storeSettings?.themeColor ?? '220'}
                    onChange={async (hue) => {
                      setThemeColor(hue);
                      if (storeSettings?.id) {
                        await db.storeSettings.update(storeSettings.id, { themeColor: hue });
                        const updated = await db.storeSettings.get(storeSettings.id);
                        if (updated) {
                          import('@/lib/api-client').then(({ pushStoreSettings }) => pushStoreSettings(updated));
                        }
                      }
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB: PEMBAYARAN ── */}
            <TabsContent value="pembayaran" className="space-y-4 outline-none">
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5 font-bold"><CreditCard className="w-4 h-4 text-primary" /> Metode Pembayaran</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Aktifkan/nonaktifkan dan ubah nama tampilan metode pembayaran.</p>
                </CardHeader>
                <CardContent className="divide-y divide-border/40 p-0 px-4 pb-2">
                  {paymentMethods?.map(pm => {
                    const display = pm as PaymentMethodDisplay;
                    const isActive = pm.isDefault;
                    const defaultName = display.defaultName ?? pm.name;
                    const iconMap: Record<string, string> = {
                      'banknote': '💵', 'building': '🏦', 'smartphone': '📱',
                      'credit-card': '💳', 'wallet': '📲',
                    };
                    const icon = iconMap[display.icon ?? ''] ?? '💳';
                    return (
                      <div key={pm.category ?? pm.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">{icon}</span>
                          <div>
                            <p className={cn('text-sm font-semibold text-foreground', !isActive && 'text-muted-foreground line-through')}>{pm.name}</p>
                            {pm.name !== defaultName && (
                              <p className="text-[10px] text-muted-foreground">Default: {defaultName}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                            title="Ubah nama tampilan"
                            onClick={() => openPmRename(pm)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <button
                            onClick={() => togglePm(pm)}
                            className={cn(
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                              isActive ? 'bg-primary' : 'bg-muted'
                            )}
                            title={isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            <span className={cn(
                              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                              isActive ? 'translate-x-4' : 'translate-x-1'
                            )} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB: PENGGUNA ── */}
            <TabsContent value="user" className="space-y-4 outline-none">
              {/* Active User Profile */}
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      {currentUser?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground leading-tight">{currentUser?.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{currentUser?.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs rounded-xl font-semibold border-primary/20 text-primary hover:bg-primary/5 flex-1 sm:flex-initial justify-center"
                      onClick={() => openOwnPinChange()}
                    >
                      <Key className="w-3.5 h-3.5" />
                      Ubah PIN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs rounded-xl font-semibold border-destructive/20 text-destructive hover:bg-destructive/5 flex-1 sm:flex-initial justify-center"
                      onClick={() => logout()}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Kunci / Ganti User
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* User Management */}
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-1.5 font-bold"><Users className="w-4 h-4 text-primary" /> Manajemen Pengguna</CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 rounded-lg text-primary hover:text-primary hover:bg-primary/5" onClick={openUserAdd}>
                      <Plus className="w-3.5 h-3.5" />
                      Tambah
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Kelola pengguna, perbarui PIN, dan hak akses staf kasir.</p>
                </CardHeader>
                <CardContent className="divide-y divide-border/40 p-0 px-4 pb-2">
                  {allUsers?.map(u => (
                    <div key={u.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold shrink-0',
                          u.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                        )}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground">{u.name}</p>
                            {u.role === 'owner' && <Shield className="w-3.5 h-3.5 text-primary" />}
                            {u.id === currentUser?.id && (
                              <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">Anda</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                            {u.role} • <span className={u.isActive ? 'text-success font-medium' : 'text-muted-foreground'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => openUserEdit(u)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn('h-8 w-8 rounded-xl', u.isActive ? 'text-destructive/70 hover:text-destructive' : 'text-success/70 hover:text-success')}
                            onClick={() => toggleUserActive(u.id!, u.isActive)}
                          >
                            {u.isActive ? <X className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB: SISTEM & DATA ── */}
            <TabsContent value="sistem" className="space-y-4 outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                
                {/* Column 1: Backup & Restore */}
                <div className="space-y-4">
                  {/* Backup & Restore */}
                  <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5 font-bold">
                        <HardDrive className="w-4 h-4 text-primary" /> Backup & Restore Data
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground">Unduh atau pulihkan database POS lokal Anda secara manual.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-muted/40 rounded-xl px-3 py-2.5 flex items-center gap-3">
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', storeSettings?.lastBackupAt ? 'bg-success' : 'bg-warning animate-pulse')} />
                        <div className="flex-1 min-w-0">
                          {storeSettings?.lastBackupAt ? (
                            <p className="text-[11px] text-muted-foreground">
                              Terakhir backup: <span className="font-semibold text-foreground">{new Date(storeSettings.lastBackupAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-warning font-semibold">Belum pernah backup — lakukan sekarang!</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-11 text-xs gap-1.5 border-primary/20 hover:bg-primary/5 hover:border-primary/40 rounded-xl flex-1 justify-center"
                          onClick={handleExport}
                          disabled={isExporting}
                        >
                          {isExporting ? (
                            <><div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Ekspor...</>
                          ) : (
                            <><Download className="w-3.5 h-3.5 text-primary" /> Ekspor (.json)</>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          className="h-11 text-xs gap-1.5 border-warning/30 hover:bg-warning/5 hover:border-warning/50 text-foreground rounded-xl flex-1 justify-center"
                          onClick={handleImportPick}
                          disabled={isImporting}
                        >
                          <Upload className="w-3.5 h-3.5 text-warning" /> Impor / Restore
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Column 2: Danger Zone */}
                <div className="space-y-4">
                  {/* Danger Actions: Reset & Logout Device */}
                  <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5 font-bold text-destructive"><Trash2 className="w-4 h-4" /> Zona Bahaya</CardTitle>
                      <p className="text-[11px] text-muted-foreground">Tindakan ini permanen dan dapat menghapus data lokal perangkat Anda.</p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full h-10 text-xs gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl font-semibold justify-center"
                        onClick={() => setResetDialogOpen(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Reset Transaksi & Shift
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-10 text-xs gap-1.5 border-destructive/25 text-destructive bg-destructive/5 hover:bg-destructive/10 rounded-xl font-semibold justify-center"
                        onClick={async () => {
                          const { clearAccountJwt } = await import('@/lib/api-client');
                          clearAccountJwt();
                          await db.transactions.clear();
                          await db.transactionItems.clear();
                          await db.products.clear();
                          await db.categories.clear();
                          await db.users.clear();
                          await db.shifts.clear();
                          await db.suppliers.clear();
                          await db.paymentMethods.clear();
                          await db.variantGroups.clear();
                          await db.variantOptions.clear();
                          await db.stockIns.clear();
                          await db.stockOuts.clear();
                          await db.hppHistory.clear();
                          await db.storeSettings.clear();
                          window.location.href = '/';
                        }}
                      >
                        <LogOut className="w-3.5 h-3.5" /> Logout Akun & Hapus Perangkat
                      </Button>
                    </CardContent>
                  </Card>
                </div>

              </div>

              {/* Storage Info & Version (Borderless sleek bar, single line on desktop) */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-muted-foreground pt-4 border-t border-border/40 mt-4 px-1">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>Versi Aplikasi</span>
                  <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[10px]">v1.2.0</span>
                </div>
                
                {storageUsage && (
                  <div className="flex items-center gap-3 w-full sm:w-auto sm:max-w-xs flex-1">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <HardDrive className="w-3.5 h-3.5 text-primary" />
                      <span>Penyimpanan:</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(100, (storageUsage.usage / storageUsage.quota) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground shrink-0 whitespace-nowrap">
                        {formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Store Dialog */}
          <Dialog open={storeDialog} onOpenChange={setStoreDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
                  <Store className="w-5 h-5 text-primary" />
                  Pengaturan Toko
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Logo picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Logo Toko</Label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-20 h-20 rounded-2xl bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {storeLogo ? (
                        <img src={storeLogo} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-6 h-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 rounded-lg"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Camera className="w-3.5 h-3.5 text-primary" />
                        {storeLogo ? 'Ganti Logo' : 'Pilih Logo'}
                      </Button>
                      {storeLogo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive gap-1.5 rounded-lg hover:bg-destructive/5"
                          onClick={() => setStoreLogo(undefined)}
                        >
                          <X className="w-3.5 h-3.5" />
                          Hapus Logo
                        </Button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nama Toko</Label>
                  <Input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Contoh: Toko Kopi Kita" className="h-11 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Alamat</Label>
                  <Input value={storeAddr} onChange={e => setStoreAddr(e.target.value)} placeholder="Contoh: Jl. Merdeka No. 45" className="h-11 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Telepon</Label>
                  <Input value={storePhone} onChange={e => setStorePhone(e.target.value)} placeholder="Contoh: 0812345678" className="h-11 rounded-xl text-sm" type="tel" />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setStoreDialog(false)}>
                    Batal
                  </Button>
                  <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={saveStore}>
                    Simpan Perubahan
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* User Add/Edit Dialog */}
          <Dialog open={userDialog} onOpenChange={setUserDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
                  <Users className="w-5 h-5 text-primary" />
                  {userEditId ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {userPinStep === 'info' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Nama Lengkap</Label>
                      <Input value={userName} onChange={e => setUserName(e.target.value)} placeholder="Contoh: Siti Rahma" className="h-11 rounded-xl text-sm" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Hak Akses (Role)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['owner', 'kasir'] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setUserRole(r)}
                            className={cn(
                              'p-3 rounded-2xl border-2 text-center transition-all duration-150 active:scale-[0.98]',
                              userRole === r ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-muted text-muted-foreground hover:bg-muted/35'
                            )}
                          >
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                              {r === 'owner' ? <Shield className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                              <span className="text-xs capitalize">{r}</span>
                            </div>
                            <p className="text-[9px] opacity-80">{r === 'owner' ? 'Akses Penuh Toko' : 'Hanya Akses Kasir'}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setUserDialog(false)}>
                        Batal
                      </Button>
                      <Button
                        className="flex-1 h-11 rounded-xl text-xs font-semibold"
                        onClick={() => { if (userName.trim()) setUserPinStep('pin'); else toast.error('Nama harus diisi'); }}
                        disabled={!userName.trim()}
                      >
                        {userEditId ? 'Lanjut (Reset PIN)' : 'Lanjut Buat PIN'}
                      </Button>
                    </div>
                    {userEditId && (
                      <Button variant="ghost" className="w-full h-10 rounded-xl text-[11px] text-muted-foreground hover:text-foreground" onClick={saveUser}>
                        Simpan Tanpa Ubah PIN
                      </Button>
                    )}
                  </>
                )}

                {userPinStep === 'pin' && (
                  <div className="space-y-4 text-center">
                    <div>
                      <p className="text-sm font-semibold">{userEditId ? 'Reset PIN' : 'Buat PIN Baru'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Masukkan {PIN_LENGTH} digit PIN masuk</p>
                    </div>
                    <div className={cn('flex gap-3 justify-center py-2', userPinError && 'animate-shake')}>
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <div key={i} className={cn('w-3.5 h-3.5 rounded-full transition-all duration-150', i < userPin.length ? 'bg-primary scale-110' : 'bg-muted-foreground/20')} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button key={d} onClick={() => handleUserPinDigit(d, 'pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">{d}</button>
                      ))}
                      <div />
                      <button onClick={() => handleUserPinDigit('0', 'pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">0</button>
                      <button onClick={() => handleUserPinBackspace('pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-all active:scale-90 mx-auto"><Delete className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setUserPinStep('info')}>
                        Kembali
                      </Button>
                      <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={() => setUserPinStep('confirm')} disabled={userPin.length < PIN_LENGTH}>
                        Lanjut
                      </Button>
                    </div>
                  </div>
                )}

                {userPinStep === 'confirm' && (
                  <div className="space-y-4 text-center">
                    <div>
                      <p className="text-sm font-semibold">Konfirmasi PIN</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Masukkan ulang PIN yang sama untuk konfirmasi</p>
                    </div>
                    <div className={cn('flex gap-3 justify-center py-2', userPinError && 'animate-shake')}>
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <div key={i} className={cn('w-3.5 h-3.5 rounded-full transition-all duration-150', i < userConfirmPin.length ? 'bg-primary scale-110' : 'bg-muted-foreground/20')} />
                      ))}
                    </div>
                    {userPinError && <p className="text-xs text-destructive font-semibold -mt-2">{userPinError}</p>}
                    <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button key={d} onClick={() => handleUserPinDigit(d, 'confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">{d}</button>
                      ))}
                      <div />
                      <button onClick={() => handleUserPinDigit('0', 'confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">0</button>
                      <button onClick={() => handleUserPinBackspace('confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-all active:scale-90 mx-auto"><Delete className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setUserPinStep('pin')}>
                        Kembali
                      </Button>
                      <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={saveUser} disabled={userConfirmPin.length < PIN_LENGTH || userPin !== userConfirmPin}>
                        Simpan Pengguna
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Ubah PIN Dialog */}
          <Dialog open={ownPinDialog} onOpenChange={setOwnPinDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-2xl p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
                  <Key className="w-5 h-5 text-primary" />
                  Ubah PIN Akun Saya
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {ownPinStep === 'pin' && (
                  <div className="space-y-4 text-center">
                    <div>
                      <p className="text-sm font-semibold">Buat PIN Baru</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Masukkan {PIN_LENGTH} digit PIN baru Anda</p>
                    </div>
                    <div className={cn('flex gap-3 justify-center py-2', ownPinError && 'animate-shake')}>
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <div key={i} className={cn('w-3.5 h-3.5 rounded-full transition-all duration-150', i < ownPinNew.length ? 'bg-primary scale-110' : 'bg-muted-foreground/20')} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button key={d} onClick={() => handleOwnPinDigit(d, 'pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">{d}</button>
                      ))}
                      <div />
                      <button onClick={() => handleOwnPinDigit('0', 'pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">0</button>
                      <button onClick={() => handleOwnPinBackspace('pin')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-all active:scale-90 mx-auto"><Delete className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setOwnPinDialog(false)}>Batal</Button>
                      <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={() => setOwnPinStep('confirm')} disabled={ownPinNew.length < PIN_LENGTH}>Lanjut</Button>
                    </div>
                  </div>
                )}

                {ownPinStep === 'confirm' && (
                  <div className="space-y-4 text-center">
                    <div>
                      <p className="text-sm font-semibold">Konfirmasi PIN Baru</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Masukkan ulang PIN baru yang sama</p>
                    </div>
                    <div className={cn('flex gap-3 justify-center py-2', ownPinError && 'animate-shake')}>
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <div key={i} className={cn('w-3.5 h-3.5 rounded-full transition-all duration-150', i < ownPinConfirm.length ? 'bg-primary scale-110' : 'bg-muted-foreground/20')} />
                      ))}
                    </div>
                    {ownPinError && <p className="text-xs text-destructive font-semibold -mt-2">{ownPinError}</p>}
                    <div className="grid grid-cols-3 gap-2.5 max-w-[200px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button key={d} onClick={() => handleOwnPinDigit(d, 'confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">{d}</button>
                      ))}
                      <div />
                      <button onClick={() => handleOwnPinDigit('0', 'confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted text-base font-bold transition-all active:scale-90 flex items-center justify-center mx-auto">0</button>
                      <button onClick={() => handleOwnPinBackspace('confirm')} className="h-11 w-11 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-all active:scale-90 mx-auto"><Delete className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setOwnPinStep('pin')}>Kembali</Button>
                      <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={saveOwnPin} disabled={ownPinConfirm.length < PIN_LENGTH || ownPinNew !== ownPinConfirm}>Simpan PIN</Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Rename Payment Method Dialog */}
          <Dialog open={pmRenameDialog} onOpenChange={setPmRenameDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-2xl p-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-bold text-sm sm:text-base">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Ubah Nama Metode
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nama Tampilan Baru</Label>
                  <Input
                    value={pmRenameValue}
                    onChange={e => setPmRenameValue(e.target.value)}
                    placeholder={`Contoh: Transfer ${pmRenameDefault}`}
                    className="h-11 rounded-xl text-sm"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Nama bawaan: <span className="font-semibold text-foreground">{pmRenameDefault}</span>. Kosongkan untuk kembali ke nama bawaan.
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setPmRenameDialog(false)}>
                    Batal
                  </Button>
                  <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={savePmRename}>
                    Simpan
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Reset Dialog */}
          <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <AlertDialogContent className="max-w-[90vw] sm:max-w-sm rounded-2xl p-5">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold text-sm sm:text-base">
                  <ShieldAlert className="w-5 h-5" />
                  Reset Transaksi & Shift?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-xs text-muted-foreground pt-1.5 leading-relaxed">
                    <p>Tindakan ini akan <span className="font-bold text-destructive">menghapus secara permanen</span> data berikut dari perangkat ini:</p>
                    <ul className="list-disc list-inside space-y-1 pl-1 bg-destructive/5 p-2 rounded-xl border border-destructive/10 text-[11px] text-destructive/80 font-medium">
                      <li>Semua Riwayat Transaksi Penjualan</li>
                      <li>Semua Detail Item Transaksi</li>
                      <li>Semua Riwayat Pembukaan & Penutupan Shift</li>
                    </ul>
                    <p className="text-[10px] font-semibold text-muted-foreground">Katalog produk, kategori, warna tema, dan daftar pengguna akan tetap aman.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 pt-3">
                <AlertDialogCancel disabled={isResetting} className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetData}
                  disabled={isResetting}
                  className="flex-1 h-11 rounded-xl text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {isResetting ? 'Memproses...' : 'Ya, Reset Data!'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Import Confirmation Dialog */}
          <AlertDialog open={importConfirmOpen} onOpenChange={open => { if (!isImporting) { setImportConfirmOpen(open); if (!open) { setImportRawData(null); setImportPreview(null); } } }}>
            <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl p-5">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-warning font-bold text-sm sm:text-base">
                  <Upload className="w-5 h-5" />
                  Restore Database POS?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3.5 text-xs text-muted-foreground pt-1.5 leading-relaxed">
                    <p>Semua data saat ini akan <span className="font-bold text-destructive">dihapus dan diganti sepenuhnya</span> dengan data dari file backup ini:</p>
                    {importPreview && (
                      <div className="bg-muted/55 border border-border/50 rounded-2xl p-3.5 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Versi Backup</span>
                          <span className="font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px]">v{importPreview.version}</span>
                        </div>
                        {importPreview.exportedAt && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Dibuat Pada</span>
                            <span className="font-semibold text-foreground">{new Date(importPreview.exportedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          </div>
                        )}
                        <div className="border-t border-border/40 pt-2.5 mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className="bg-card p-1.5 rounded-xl border border-border/20">
                            <p className="text-sm font-extrabold text-primary">{importPreview.productCount}</p>
                            <p className="text-[9px] text-muted-foreground font-semibold">Produk</p>
                          </div>
                          <div className="bg-card p-1.5 rounded-xl border border-border/20">
                            <p className="text-sm font-extrabold text-primary">{importPreview.categoryCount}</p>
                            <p className="text-[9px] text-muted-foreground font-semibold">Kategori</p>
                          </div>
                          <div className="bg-card p-1.5 rounded-xl border border-border/20">
                            <p className="text-sm font-extrabold text-primary">{importPreview.transactionCount}</p>
                            <p className="text-[9px] text-muted-foreground font-semibold">Transaksi</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground font-semibold">Proses restore tidak dapat dibatalkan. Pastikan file backup Anda benar.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 pt-3">
                <AlertDialogCancel disabled={isImporting} className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleImportConfirm}
                  disabled={isImporting}
                  className="flex-1 h-11 rounded-xl text-xs bg-warning hover:bg-warning/90 text-warning-foreground"
                >
                  {isImporting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-warning-foreground/30 border-t-warning-foreground rounded-full animate-spin mr-1.5" /> Memproses...</>
                  ) : 'Ya, Restore Sekarang!'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </>
      )}
    </div>
  );
}
