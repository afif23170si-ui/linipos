import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Category, type Transaction, type TransactionItemRecord, type VariantOption, type Shift } from '@/lib/db';
import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { Search, Plus, Minus, ShoppingCart, X, Percent, Tag, CreditCard, Banknote, Check, ScanBarcode, Package as PackageIcon, ClipboardList, Save, Pencil, User, Hash, Trash2, Barcode, Clock, DollarSign, ChevronRight, AlertCircle, LayoutGrid, List, FileText, TrendingUp, Wallet, AlertTriangle, Scissors, Split } from 'lucide-react';
import Receipt from '@/components/Receipt';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useAuth } from '@/lib/auth-context';
import { playAddSound, playClickSound, playRemoveSound, playSuccessSound, playSaveSound, playScanSound } from '@/lib/sounds';
import { pushTransaction, syncUser } from '@/lib/api-client';

const BarcodeScanner = lazy(() => import('@/components/BarcodeScanner'));

interface CartItem {
  product: Product;
  qty: number;
  discountType: 'percentage' | 'nominal' | null;
  discountValue: number;
  notes?: string;
  variantOption?: VariantOption; // selected variant option
}

export default function Kasir() {
  const { currentUser, isOwner } = useAuth();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [txDiscountType, setTxDiscountType] = useState<'percentage' | 'nominal' | null>(null);
  const [txDiscountValue, setTxDiscountValue] = useState('');
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [tempDiscountType, setTempDiscountType] = useState<'percentage' | 'nominal'>('nominal');
  const [tempDiscountValue, setTempDiscountValue] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [lastTxItems, setLastTxItems] = useState<TransactionItemRecord[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [openBillsOpen, setOpenBillsOpen] = useState(false);
  const [editingItemNotes, setEditingItemNotes] = useState<string | null>(null);
  const [tempItemNotes, setTempItemNotes] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTargetTx, setCancelTargetTx] = useState<Transaction | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [productView, setProductView] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem('linipos-cashier-view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });
  const scanInputRef = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(() => db.products.filter(p => p.isDeleted === 0 && p.isActive !== 0).toArray());
  const categories = useLiveQuery(() => db.categories.where('isDeleted').equals(0).toArray());
  const paymentMethods = useLiveQuery(() => db.paymentMethods.filter(pm => pm.isDefault === true).toArray());
  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
  const openBills = useLiveQuery(() => db.transactions.where('status').equals('open').reverse().sortBy('date'));
  const allVariantOptions = useLiveQuery(() => db.variantOptions.toArray());
  const allVariantGroups = useLiveQuery(() => db.variantGroups.toArray());
  const activeShift = useLiveQuery(() => db.shifts.where('status').equals('open').first());
  const todayTxs = useLiveQuery(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return db.transactions.filter(t => t.status === 'completed' && t.type !== 'refund' && new Date(t.date) >= today).toArray();
  });

  // Shift state
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [closeShiftDialogOpen, setCloseShiftDialogOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  // Split Bill
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<Array<{id: string; methodId: string; amount: string}>>(
    [{ id: '1', methodId: '', amount: '' }]
  );
  const [shiftSummary, setShiftSummary] = useState<{
    totalTx: number; totalSales: number; totalProfit: number;
    cashSales: number; nonCashSales: number;
    paymentBreakdown: { name: string; total: number; count: number }[];
    userName: string; openedAt: Date; closedAt: Date; openingCash: number;
  } | null>(null);

  // Variant picker state
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);

  const cartItemKey = (c: CartItem) => `${c.product.id}-${c.variantOption?.id ?? 'base'}`;
  const cartProductIds = new Set(cart.map(c => c.product.id));

  const filtered = products?.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === 'all' || p.categoryId === Number(filterCategory);
    return matchSearch && matchCategory && (p.unlimitedStock || p.stock > 0 || cartProductIds.has(p.id!));
  }) ?? [];

  const doFullReset = () => {
    setCart([]);
    setEditingTxId(null);
    setTxDiscountType(null);
    setTxDiscountValue('');
    setPaymentMethodId('');
    setPaymentAmount('');
    setCustomerName('');
    setTableNumber('');
    setRemarks('');
    setIsQuickAdding(false);
    setSplitMode(false);
    setSplits([{ id: '1', methodId: '', amount: '' }]);
  };

  // === Cart Operations ===

  const getProductVariantOptions = (productId: number) => {
    return allVariantOptions?.filter(v => v.productId === productId) ?? [];
  };

  const addToCart = (product: Product) => {
    const variants = getProductVariantOptions(product.id!);
    if (variants.length > 0) {
      // Product has variants → show picker
      playClickSound();
      setVariantPickerProduct(product);
      setVariantPickerOpen(true);
      return;
    }
    // No variants → add directly
    addToCartDirect(product);
  };

  const addToCartDirect = (product: Product, variantOption?: VariantOption) => {
    setCart(prev => {
      const key = `${product.id}-${variantOption?.id ?? 'base'}`;
      const existing = prev.find(c => cartItemKey(c) === key);
      if (existing) {
        if (!product.unlimitedStock && existing.qty >= product.stock) {
          toast.error('Stok tidak cukup');
          return prev;
        }
        playClickSound();
        return prev.map(c => cartItemKey(c) === key ? { ...c, qty: c.qty + 1 } : c);
      }
      playAddSound();
      return [...prev, { product, qty: 1, discountType: null, discountValue: 0, variantOption }];
    });
  };

  const updateQty = (itemKey: string, delta: number) => {
    playClickSound();
    setCart(prev => prev.map(c => {
      if (cartItemKey(c) !== itemKey) return c;
      const newQty = c.qty + delta;
      if (newQty <= 0) return c;
      if (!c.product.unlimitedStock && newQty > c.product.stock) { toast.error('Stok tidak cukup'); return c; }
      return { ...c, qty: newQty };
    }));
  };

  const removeFromCart = (itemKey: string) => {
    playRemoveSound();
    setCart(prev => prev.filter(c => cartItemKey(c) !== itemKey));
  };

  const updateItemNotes = (itemKey: string, notes: string) => {
    setCart(prev => prev.map(c => cartItemKey(c) === itemKey ? { ...c, notes: notes.trim() || undefined } : c));
  };

  const getItemPrice = (item: CartItem) => item.variantOption?.price ?? item.product.price;
  const getItemHpp = (item: CartItem) => item.variantOption?.hpp ?? item.product.hpp;

  const getItemSubtotal = (item: CartItem) => {
    const unitPrice = getItemPrice(item);
    const base = unitPrice * item.qty;
    if (item.discountType === 'percentage') return base * (1 - item.discountValue / 100);
    if (item.discountType === 'nominal') return base - item.discountValue;
    return base;
  };

  const subtotal = cart.reduce((sum, item) => sum + getItemSubtotal(item), 0);
  const txDiscountAmount = txDiscountType === 'percentage' ? subtotal * (Number(txDiscountValue) || 0) / 100 : txDiscountType === 'nominal' ? Number(txDiscountValue) || 0 : 0;
  const total = Math.max(0, subtotal - txDiscountAmount);
  const paidAmount = Number(paymentAmount) || 0;
  const change = paidAmount - total;
  const totalProfit = cart.reduce((sum, item) => sum + (getItemPrice(item) - getItemHpp(item)) * item.qty, 0) - txDiscountAmount;

  // Helper: create TransactionItemRecords from cart (with variant support)
  const makeItemRecords = (txId: number): TransactionItemRecord[] => cart.map(c => {
    const itemPrice = getItemPrice(c);
    const itemHpp = getItemHpp(c);
    const variantLabel = c.variantOption ? ` - ${c.variantOption.name}` : '';
    return {
      transactionId: txId,
      productId: c.product.id!,
      productName: c.product.name + variantLabel,
      quantity: c.qty,
      price: itemPrice,
      hpp: itemHpp,
      discountType: c.discountType,
      discountValue: c.discountValue,
      discountAmount: c.discountType === 'percentage' ? itemPrice * c.qty * c.discountValue / 100 : c.discountType === 'nominal' ? c.discountValue : 0,
      subtotal: getItemSubtotal(c),
      notes: c.notes,
      variantOptionId: c.variantOption?.id,
      variantName: c.variantOption?.name,
    };
  });

  // === Open Bill Operations ===

  const saveOpenBill = async () => {
    if (cart.length === 0) { toast.error('Keranjang kosong'); return; }
    if (!activeShift) { toast.error('Buka shift terlebih dahulu!'); setShiftDialogOpen(true); return; }

    const now = new Date();

    if (editingTxId) {
      // Update existing open bill
      const oldItems = await db.transactionItems.where('transactionId').equals(editingTxId).toArray();

      await db.transactions.update(editingTxId, {
        subtotal,
        discountType: txDiscountType,
        discountValue: Number(txDiscountValue) || 0,
        discountAmount: txDiscountAmount,
        total,
        customerName: customerName.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        remarks: remarks.trim() || undefined,
        date: now,
      });

      await db.transactionItems.where('transactionId').equals(editingTxId).delete();
      const itemRecords = makeItemRecords(editingTxId);
      await db.transactionItems.bulkAdd(itemRecords);

      // Adjust stock deltas
      for (const cartItem of cart) {
        const oldItem = oldItems.find(oi => oi.productId === cartItem.product.id);
        const oldQty = oldItem?.quantity ?? 0;
        const newQty = cartItem.qty;
        const delta = newQty - oldQty;
        if (delta !== 0) {
          await db.products.update(cartItem.product.id!, { stock: cartItem.product.stock - delta, updatedAt: new Date() });
        }
      }
      // Restore stock for removed items that were in old bill
      for (const oldItem of oldItems) {
        const stillInCart = cart.find(c => c.product.id === oldItem.productId);
        if (!stillInCart) {
          const product = await db.products.get(oldItem.productId);
          if (product) {
            await db.products.update(oldItem.productId, { stock: product.stock + oldItem.quantity });
          }
        }
      }

      const updatedTx = await db.transactions.get(editingTxId);
      toast.success(`Bill ${updatedTx?.receiptNumber} diperbarui!`);
      playSaveSound();
      // Push update ke server
      if (updatedTx) pushTransaction(updatedTx, itemRecords);
    } else {
      const receiptNumber = `TX${Date.now()}`;

      const txData: Transaction = {
        subtotal,
        discountType: txDiscountType,
        discountValue: Number(txDiscountValue) || 0,
        discountAmount: txDiscountAmount,
        total,
        paymentMethodId: 0,
        paymentAmount: 0,
        change: 0,
        profit: 0,
        date: now,
        receiptNumber,
        status: 'open',
        customerName: customerName.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        remarks: remarks.trim() || undefined,
        openedAt: now,
        userId: currentUser?.id,
        userName: currentUser?.name,
        shiftId: activeShift?.id,
      };

      const txId = await db.transactions.add(txData);

      const newItemRecords = makeItemRecords(txId as number);
      await db.transactionItems.bulkAdd(newItemRecords);

      for (const item of cart) {
        await db.products.update(item.product.id!, { stock: item.product.stock - item.qty, updatedAt: new Date() });
      }

      toast.success(`Bill ${receiptNumber} disimpan!`);
      playSaveSound();
      // Push open bill ke server → broadcast ke device lain
      const savedOpenBill = await db.transactions.get(txId as number);
      if (savedOpenBill) pushTransaction(savedOpenBill, newItemRecords);
    }

    doFullReset();
    setCartOpen(false);
  };

  const loadOpenBill = async (tx: Transaction) => {
    if (!tx.id) return;
    const items = await db.transactionItems.where('transactionId').equals(tx.id).toArray();
    const allProducts = await db.products.where('isDeleted').equals(0).toArray();

    const cartItems: CartItem[] = items.map(item => {
      const product = allProducts.find(p => p.id === item.productId);
      if (!product) throw new Error(`Produk "${item.productName}" tidak ditemukan`);
      // Restore variant option if it was saved
      const variantOption = item.variantOptionId
        ? allVariantOptions?.find(v => v.id === item.variantOptionId)
        : undefined;
      return {
        product,
        qty: item.quantity,
        discountType: item.discountType as 'percentage' | 'nominal' | null,
        discountValue: item.discountValue,
        notes: item.notes,
        variantOption,
      };
    });

    setCart(cartItems);
    setEditingTxId(tx.id);
    setTxDiscountType(tx.discountType);
    setTxDiscountValue(tx.discountType ? String(tx.discountValue) : '');
    setCustomerName(tx.customerName || '');
    setTableNumber(tx.tableNumber || '');
    setRemarks(tx.remarks || '');
    setOpenBillsOpen(false);
    setCartOpen(true);
  };

  const cancelOpenBill = async (tx: Transaction) => {
    if (!tx.id) return;
    const items = await db.transactionItems.where('transactionId').equals(tx.id).toArray();
    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (product) {
        await db.products.update(item.productId, { stock: product.stock + item.quantity });
      }
    }
    await db.transactionItems.where('transactionId').equals(tx.id).delete();
    await db.transactions.delete(tx.id);
    toast.success(`Bill ${tx.receiptNumber} dibatalkan`);
    setCancelDialogOpen(false);
    setCancelTargetTx(null);
    if (editingTxId === tx.id) {
      doFullReset();
      setCartOpen(false);
    }
  };

  const handleCancelFromCart = () => {
    const tx = openBills?.find(b => b.id === editingTxId);
    if (tx) {
      setCancelTargetTx(tx);
      setCancelDialogOpen(true);
    }
  };

  const handleCancelFromList = (bill: Transaction) => {
    setCancelTargetTx(bill);
    setCancelDialogOpen(true);
  };

  // Split Bill helpers
  const addSplit = () => setSplits(prev => [...prev, { id: Date.now().toString(), methodId: '', amount: '' }]);
  const removeSplit = (id: string) => setSplits(prev => prev.filter(s => s.id !== id));
  const updateSplit = (id: string, field: 'methodId' | 'amount', value: string) =>
    setSplits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));

  // === Checkout ===

  const handleCheckout = async () => {
    if (splitMode) {
      const allFilled = splits.every(sp => sp.methodId && Number(sp.amount) > 0);
      if (!allFilled) { toast.error('Lengkapi semua metode dan nominal pembayaran'); return; }
      const splitTotal = splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
      if (Math.abs(splitTotal - total) >= 1) { toast.error('Jumlah split belum sesuai total'); return; }
    } else {
      if (!paymentMethodId || paidAmount < total) return;
    }
    if (!activeShift) { toast.error('Buka shift terlebih dahulu!'); setShiftDialogOpen(true); return; }

    // Resolve effective payment values
    const splitDetail = splitMode && splits.length > 0
      ? splits.map(sp => {
          const pm = paymentMethods?.find(p => p.id === Number(sp.methodId));
          return `${pm?.name || '?'}: Rp ${Number(sp.amount).toLocaleString('id-ID')}`;
        }).join(' | ')
      : undefined;
    const effectiveMethodId = splitMode ? Number(splits[0].methodId) : Number(paymentMethodId);
    const effectiveAmount = splitMode ? total : paidAmount;
    const effectiveChange = splitMode ? 0 : change;

    if (editingTxId) {
      // Update existing open bill → paid
      const oldItems = await db.transactionItems.where('transactionId').equals(editingTxId).toArray();

      await db.transactions.update(editingTxId, {
        status: 'completed',
        subtotal,
        discountType: txDiscountType,
        discountValue: Number(txDiscountValue) || 0,
        discountAmount: txDiscountAmount,
        total,
        paymentMethodId: effectiveMethodId,
        paymentAmount: effectiveAmount,
        change: effectiveChange,
        profit: totalProfit,
        customerName: customerName.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        remarks: splitDetail ? (remarks.trim() ? `${remarks.trim()} | ${splitDetail}` : splitDetail) : (remarks.trim() || undefined),
        closedAt: new Date(),
        userId: currentUser?.id,
        userName: currentUser?.name,
        shiftId: activeShift?.id,
      });

      await db.transactionItems.where('transactionId').equals(editingTxId).delete();
      const itemRecords = makeItemRecords(editingTxId);
      await db.transactionItems.bulkAdd(itemRecords);

      // Adjust stock deltas (same as saveOpenBill)
      for (const cartItem of cart) {
        const oldItem = oldItems.find(oi => oi.productId === cartItem.product.id);
        const oldQty = oldItem?.quantity ?? 0;
        const newQty = cartItem.qty;
        const delta = newQty - oldQty;
        if (delta !== 0) {
          await db.products.update(cartItem.product.id!, { stock: cartItem.product.stock - delta, updatedAt: new Date() });
        }
      }
      for (const oldItem of oldItems) {
        const stillInCart = cart.find(c => c.product.id === oldItem.productId);
        if (!stillInCart) {
          const product = await db.products.get(oldItem.productId);
          if (product) {
            await db.products.update(oldItem.productId, { stock: product.stock + oldItem.quantity });
          }
        }
      }

      const updatedTx = await db.transactions.get(editingTxId);
      toast.success(`Transaksi berhasil! ${updatedTx?.receiptNumber}`);
      playSuccessSound();
      setLastTransaction(updatedTx || null);
      setLastTxItems(itemRecords);
      // Background push ke server — fire-and-forget, tidak block UI
      pushTransaction(updatedTx!, itemRecords);
      setReceiptOpen(true);
    } else {
      const receiptNumber = `TX${Date.now()}`;

      const txData: Transaction = {
        subtotal,
        discountType: txDiscountType,
        discountValue: Number(txDiscountValue) || 0,
        discountAmount: txDiscountAmount,
        total,
        paymentMethodId: effectiveMethodId,
        paymentAmount: effectiveAmount,
        change: effectiveChange,
        profit: totalProfit,
        date: new Date(),
        receiptNumber,
        status: 'completed',
        customerName: customerName.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        remarks: splitDetail ? (remarks.trim() ? `${remarks.trim()} | ${splitDetail}` : splitDetail) : (remarks.trim() || undefined),
        userId: currentUser?.id,
        userName: currentUser?.name,
        shiftId: activeShift?.id,
      };

      const txId = await db.transactions.add(txData);

      const itemRecords = makeItemRecords(txId as number);
      await db.transactionItems.bulkAdd(itemRecords);

      for (const item of cart) {
        await db.products.update(item.product.id!, { stock: item.product.stock - item.qty, updatedAt: new Date() });
      }

      toast.success(`Transaksi berhasil! ${receiptNumber}`);
      playSuccessSound();
      setLastTransaction({ ...txData, id: txId as number });
      setLastTxItems(itemRecords);
      // Background push ke server — fire-and-forget, tidak block UI
      pushTransaction({ ...txData, id: txId as number }, itemRecords);
      setReceiptOpen(true);
    }

    doFullReset();
    setCheckoutOpen(false);
    setCartOpen(false);
  };

  // === Shift Operations ===

  const handleOpenShift = async () => {
    if (!currentUser?.id) { toast.error('Login terlebih dahulu'); return; }
    const cash = Number(openingCash) || 0;
    const shiftId = await db.shifts.add({
      userId: currentUser.id,
      userName: currentUser.name,
      openedAt: new Date(),
      status: 'open',
      openingCash: cash,
    });
    setOpeningCash('');
    setShiftDialogOpen(false);
    toast.success(`Shift dibuka • Kas awal Rp ${cash.toLocaleString('id-ID')}`);
    // Push shift ke server → broadcast ke device lain via WebSocket
    const newShift = await db.shifts.get(shiftId as number);
    if (newShift) {
      import('@/lib/api-client').then(({ pushShift }) => pushShift(newShift));
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift?.id) return;
    const closedAt = new Date();
    // Gather all completed transactions in this shift
    const txs = await db.transactions
      .where('shiftId').equals(activeShift.id)
      .filter(t => t.status === 'completed')
      .toArray();
    const allPMs = await db.paymentMethods.toArray();
    const countMap: Record<number, number> = {};
    const breakdown: Record<number, number> = {};
    let totalSales = 0, totalProfit = 0, cashSales = 0;
    for (const t of txs) {
      totalSales += t.total;
      totalProfit += t.profit;
      breakdown[t.paymentMethodId] = (breakdown[t.paymentMethodId] ?? 0) + t.total;
      countMap[t.paymentMethodId] = (countMap[t.paymentMethodId] ?? 0) + 1;
      const pm = allPMs.find(p => p.id === t.paymentMethodId);
      if (pm?.category === 'tunai') cashSales += t.total;
    }
    const paymentBreakdown = Object.entries(breakdown).map(([pmId, total]) => ({
      name: allPMs.find(p => p.id === Number(pmId))?.name ?? 'Lainnya',
      total,
      count: countMap[Number(pmId)] ?? 0,
    }));
    setShiftSummary({
      totalTx: txs.length,
      totalSales,
      totalProfit,
      cashSales,
      nonCashSales: totalSales - cashSales,
      paymentBreakdown,
      userName: activeShift.userName,
      openedAt: new Date(activeShift.openedAt),
      closedAt,
      openingCash: activeShift.openingCash,
    });
    setActualCash('');
    await db.shifts.update(activeShift.id, { status: 'closed', closedAt });
    // Push shift tutup ke server → broadcast ke device lain via WebSocket
    const closedShift = await db.shifts.get(activeShift.id);
    if (closedShift) {
      import('@/lib/api-client').then(({ pushShift }) => pushShift(closedShift));
    }
    setCloseShiftDialogOpen(true);
  };

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const openBillsCount = openBills?.length ?? 0;

  const handleScan = (barcode: string) => {
    setScannerOpen(false);
    playScanSound();
    const product = products?.find(p => p.sku === barcode || p.barcode === barcode);
    if (product) {
      if (product.stock <= 0) {
        toast.error(`Stok ${product.name} habis`);
        return;
      }
      addToCart(product);
      toast.success(`Ditambahkan: ${product.name}`);
    } else {
      toast.error(`Produk dengan SKU/Barcode "${barcode}" tidak ditemukan`);
    }
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      const code = scanInput.trim();
      setScanInput('');
      const product = products?.find(p => p.sku === code || p.barcode === code);
      if (product) {
        if (product.stock <= 0) {
          toast.error(`Stok ${product.name} habis`);
          return;
        }
        addToCart(product);
        toast.success(`Ditambahkan: ${product.name}`);
      } else {
        toast.error(`Produk dengan SKU/Barcode "${code}" tidak ditemukan`);
      }
    }
  };

  // Auto-focus scan input after it clears
  useEffect(() => {
    if (scanInput === '' && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [scanInput]);

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const todayTxCount = todayTxs?.length ?? 0;
  const todayRevenue = todayTxs?.reduce((s, t) => s + t.total, 0) ?? 0;

  return (
    <div className="px-4 pt-4 h-[calc(100dvh-3.5rem)] overflow-hidden flex flex-col">
      <div className="flex flex-col md:flex-row gap-0 md:gap-4 h-full">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Header — outside scroll, overflow-visible so badge doesn't clip */}
          <div className="flex items-center justify-between mb-4 overflow-visible shrink-0">
            {/* Heading & Subheading */}
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Selamat Bertugas, {currentUser?.name || 'User'}
              </h1>
              <p className="text-xs text-muted-foreground mt-1 leading-normal">
                {storeSettings?.storeName || 'Lini POS'}
              </p>
            </div>

            {/* Actions & Badges */}
            <div className="flex items-center gap-2">
              {editingTxId && (
                <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                  Editing Bill
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold"
                onClick={() => setOpenBillsOpen(true)}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Open Bill</span>
                {openBillsCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] text-[9px] px-1 bg-destructive text-destructive-foreground rounded-full font-bold leading-none">
                    {openBillsCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

      {/* Shift Banner */}
      {activeShift ? (
        <div className="flex items-center justify-between bg-success/10 border border-success/20 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <div>
              <p className="text-xs font-semibold text-success">Shift Aktif</p>
              <p className="text-[10px] text-muted-foreground">
                {activeShift.userName} • sejak {format(new Date(activeShift.openedAt), 'HH:mm', { locale: localeId })} • Kas awal Rp {activeShift.openingCash.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px] border-success/30 text-success hover:bg-success/10" onClick={handleCloseShift}>
            <Clock className="w-3 h-3 mr-1" />
            Tutup Shift
          </Button>
        </div>
      ) : (
        <button
          className="flex items-center justify-between w-full bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mb-3 group"
          onClick={() => { setOpeningCash(''); setShiftDialogOpen(true); }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Belum ada shift aktif — tap untuk buka shift</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Search + View Toggle */}
      <div className="flex items-center gap-2 mb-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input 
            placeholder="Cari produk..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-10 h-10.5 rounded-xl border-border/40 bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground/50 transition-all text-xs font-medium w-full" 
          />
        </div>

        {/* View Toggle + Scan — compact icon strip */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-xl p-1 border border-border/30 h-10.5">
            <button
              onClick={() => {
                setProductView('grid');
                try { localStorage.setItem('linipos-cashier-view', 'grid'); } catch {
                  // localStorage may be unavailable in restricted browser modes.
                }
              }}
              className={cn(
                'w-[34px] h-[34px] rounded-lg transition-all duration-200 flex items-center justify-center shrink-0',
                productView === 'grid'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Tampilan Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setProductView('list');
                try { localStorage.setItem('linipos-cashier-view', 'list'); } catch {
                  // localStorage may be unavailable in restricted browser modes.
                }
              }}
              className={cn(
                'w-[34px] h-[34px] rounded-lg transition-all duration-200 flex items-center justify-center shrink-0',
                productView === 'list'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Tampilan List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <button 
            type="button"
            className="w-10.5 h-10.5 shrink-0 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary transition-all flex items-center justify-center" 
            onClick={() => setScannerOpen(true)}
            title="Scan Barcode"
          >
            <ScanBarcode className="w-4.5 h-4.5 text-muted-foreground/70" />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-3 pb-1 pr-4" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <button onClick={() => setFilterCategory('all')} className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', filterCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          Semua
        </button>
        {categories?.map(c => (
          <button key={c.id} onClick={() => setFilterCategory(c.id!.toString())}
            className={cn('shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', filterCategory === c.id!.toString() ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: filterCategory === c.id!.toString() ? 'white' : (c.color ?? '#999') }} />
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {/* Product Grid / List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-0.5 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              {products && products.length > 0
                ? 'Semua produk stoknya habis. Tambah stok dulu di menu Stok Masuk.'
                : 'Belum ada produk. Tambah produk dulu di menu Produk.'}
            </p>
          </div>
        ) : productView === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {filtered.map(p => {
              const pvOptions = getProductVariantOptions(p.id!);
              const inCart = cartProductIds.has(p.id!);
              const category = categories?.find(c => c.id === p.categoryId);
              const catColor = category?.color ?? '#999';
              const priceDisplay = pvOptions.length > 0
                ? (() => { const min = Math.min(...pvOptions.map(v=>v.price)); const max = Math.max(...pvOptions.map(v=>v.price)); return min===max ? `Rp ${min.toLocaleString('id-ID')}` : `Rp ${min.toLocaleString('id-ID')}+`; })()
                : `Rp ${p.price.toLocaleString('id-ID')}`;
              return (
                <Card
                  key={p.id}
                  className={cn(
                    'border border-border/30 hover:border-primary/20 shadow-sm hover:shadow-md rounded-2xl cursor-pointer transition-all active:scale-[0.98] overflow-hidden group flex flex-col justify-between',
                    inCart ? 'border-primary ring-2 ring-primary/20 shadow-md' : ''
                  )}
                  onClick={() => addToCart(p)}
                >
                  <CardContent className="p-0 flex-1 flex flex-col justify-between">
                    {/* Product Image Container */}
                    <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden shrink-0 border-b border-border/10">
                      {p.photo ? (
                        <img src={p.photo} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PackageIcon className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Category Badge overlay on top-left */}
                      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
                        <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-background/80 backdrop-blur-md text-foreground border border-border/25 shadow-sm">
                          <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                          <span className="truncate max-w-[50px] sm:max-w-none">{category?.name ?? '-'}</span>
                        </span>
                      </div>
                      {/* Stock status overlay */}
                      {!p.unlimitedStock && p.stock <= 3 && p.stock > 0 && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-background/80 backdrop-blur-md text-warning border border-border/25 shadow-sm">
                            <span className="w-1 h-1 rounded-full bg-warning animate-pulse" />
                            Sisa {p.stock}
                          </span>
                        </div>
                      )}
                      {!p.unlimitedStock && p.stock <= 0 && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-background/80 backdrop-blur-md text-destructive border border-border/25 shadow-sm">
                            <span className="w-1 h-1 rounded-full bg-destructive animate-pulse" />
                            Habis
                          </span>
                        </div>
                      )}
                      {/* Checkbox/InCart overlay */}
                      {inCart && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md z-10 transition-all">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info & Action section */}
                    <div className="p-2 sm:p-3 relative flex-1 flex flex-col justify-between min-h-[72px] sm:min-h-[84px]">
                      <div className="space-y-0.5 pr-6">
                        <h3 className="text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors min-h-[26px] sm:min-h-[32px]">{p.name}</h3>
                        <p className="text-[11px] sm:text-xs font-extrabold text-primary">{priceDisplay}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        {p.unlimitedStock ? (
                          <span className="text-[8px] sm:text-[9px] text-primary/70 font-semibold">∞ Tak terbatas</span>
                        ) : (
                          <span className={cn('text-[8px] sm:text-[9px] font-bold', p.stock <= 0 ? 'text-destructive' : p.stock <= 3 ? 'text-warning' : 'text-success')}>
                            Stok {p.stock}
                          </span>
                        )}
                      </div>
                      {/* Add Button */}
                      <button
                        className="absolute bottom-2 right-2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all text-primary-foreground"
                        onClick={e => { e.stopPropagation(); addToCart(p); }}
                        aria-label={`Tambah ${p.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-1.5">
            {filtered.map(p => {
              const pvOptions = getProductVariantOptions(p.id!);
              const minPrice = pvOptions.length > 0 ? Math.min(...pvOptions.map(v => v.price)) : p.price;
              const maxPrice = pvOptions.length > 0 ? Math.max(...pvOptions.map(v => v.price)) : p.price;
              const priceLabel = pvOptions.length > 0
                ? (minPrice === maxPrice ? `Rp ${minPrice.toLocaleString('id-ID')}` : `Rp ${minPrice.toLocaleString('id-ID')}+`)
                : `Rp ${p.price.toLocaleString('id-ID')}`;
              const inCart = cartProductIds.has(p.id!);
              const catColor = categories?.find(c => c.id === p.categoryId)?.color ?? '#999';
              return (
                <div
                  key={p.id}
                  className={cn('flex items-center gap-0 bg-card rounded-xl shadow-sm active:scale-[0.99] cursor-pointer transition-all overflow-hidden', inCart ? 'ring-2 ring-primary/50' : 'hover:bg-muted/30')}
                  onClick={() => addToCart(p)}
                >
                  <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: catColor }} />
                  <div className="w-12 h-12 bg-muted overflow-hidden flex items-center justify-center shrink-0 mx-3 my-2.5 rounded-lg">
                    {p.photo ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" /> : <PackageIcon className="w-5 h-5 text-muted-foreground/30" />}
                  </div>
                  <div className="flex-1 min-w-0 py-2.5">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-xs font-bold text-primary">{priceLabel}</p>
                    {pvOptions.length > 0 && <p className="text-[10px] text-muted-foreground">{pvOptions.length} variant</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pr-3">
                    {!p.unlimitedStock && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', p.stock <= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                        {p.stock} {p.unit}
                      </span>
                    )}
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', inCart ? 'bg-primary text-white' : 'bg-primary/10 text-primary')}>
                      {inCart ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* Desktop Cart Panel */}
      <div className="hidden md:flex md:w-80 xl:w-96 flex-col overflow-hidden bg-card rounded-2xl border border-border/30 shadow-md shrink-0 mb-4">
        <div className="p-4 border-b border-border/30 shrink-0 bg-muted/15">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Keranjang Belanja
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {cartCount}
            </span>
            {editingTxId && (
              <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full ml-auto">
                Edit Bill
              </span>
            )}
          </h3>
        </div>
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Customer + table always visible */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Nama pelanggan" value={customerName} onChange={e => setCustomerName(e.target.value)} className="pl-8 h-10 text-xs rounded-xl" />
              </div>
              <div className="relative w-20">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Meja" value={tableNumber} onChange={e => setTableNumber(e.target.value)} className="pl-8 h-10 text-xs rounded-xl" />
              </div>
            </div>

            {/* Open bills shortcut */}
            {openBills && openBills.length > 0 && (
              <button
                className="flex items-center justify-between px-3 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-2xl hover:bg-amber-500/10 transition-colors text-left"
                onClick={() => setOpenBillsOpen(true)}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{openBills.length} Open Bill Aktif</p>
                    <p className="text-[10px] text-muted-foreground">Ketuk untuk lihat & lanjutkan</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
              </button>
            )}

            {/* Empty visual */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center animate-pulse">
                <ShoppingCart className="w-8 h-8 text-primary/40" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground">Keranjang Kosong</p>
                <p className="text-xs text-muted-foreground/60 max-w-[200px] mx-auto">Pilih produk lezat di sebelah kiri untuk ditambahkan ke keranjang</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {cart.map(item => {
                const key = cartItemKey(item);
                const itemPrice = getItemPrice(item);
                return (
                  <div key={key} className="bg-card border border-border/40 p-3.5 rounded-2xl space-y-3 hover:border-primary/20 hover:shadow-sm hover:-translate-y-[1px] transition-all duration-200">
                    <div className="flex items-center gap-3">
                      {item.product.photo ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-border/20 shadow-sm">
                          <img src={item.product.photo} alt={item.product.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-muted border border-border/20 flex items-center justify-center shrink-0 shadow-sm">
                          <PackageIcon className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-foreground truncate leading-snug">{item.product.name}</p>
                        {item.variantOption && (
                          <span className="inline-flex items-center text-[9px] text-accent bg-accent/5 px-2 py-0.5 rounded-full font-bold mt-1 border border-accent/10">
                            {item.variantOption.name}
                          </span>
                        )}
                        <p className="text-[10px] sm:text-xs text-muted-foreground/80 mt-1">
                          Rp {itemPrice.toLocaleString('id-ID')} × {item.qty}
                        </p>
                      </div>
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 shrink-0 bg-background border border-border/40 rounded-full p-0.5 shadow-sm">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-transform"
                          onClick={() => item.qty === 1 ? removeFromCart(key) : updateQty(key, -1)}
                        >
                          {item.qty === 1 ? <X className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        </Button>
                        <span className="w-6 text-center text-xs font-black">{item.qty}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-primary hover:text-primary hover:bg-primary/10 active:scale-90 transition-transform"
                          onClick={() => updateQty(key, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {/* Price and Notes row */}
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-border/20">
                      <span className="text-xs font-black text-primary">{rp(getItemSubtotal(item))}</span>
                      {item.notes ? (
                        <button
                          className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded-full transition-colors border border-accent/20"
                          onClick={() => { setEditingItemNotes(key); setTempItemNotes(item.notes || ''); }}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          {item.notes}
                        </button>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:underline transition-colors"
                          onClick={() => { setEditingItemNotes(key); setTempItemNotes(''); }}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          Catatan
                        </button>
                      )}
                    </div>
                    {/* Inline notes editor */}
                    {editingItemNotes === key && (
                      <div className="flex gap-1.5 items-center pt-1">
                        <Input
                          autoFocus
                          value={tempItemNotes}
                          onChange={e => setTempItemNotes(e.target.value)}
                          placeholder="Contoh: less sugar..."
                          className="h-8 text-xs rounded-lg flex-1"
                          onKeyDown={e => {
                            if (e.key === 'Enter') { updateItemNotes(key, tempItemNotes); setEditingItemNotes(null); }
                            if (e.key === 'Escape') setEditingItemNotes(null);
                          }}
                        />
                        <Button size="sm" className="h-8 text-xs rounded-lg px-3" onClick={() => { updateItemNotes(key, tempItemNotes); setEditingItemNotes(null); }}>Simpan</Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => setEditingItemNotes(null)}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 px-4 mb-2">
              <div className="relative flex-1">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Nama pelanggan"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="pl-8 h-10 text-xs rounded-xl"
                />
              </div>
              <div className="relative flex-[0.6]">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Meja"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  className="pl-8 h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── CART SUMMARY — selalu muncul ── */}
        <div className="border-t border-border/30 pt-4 space-y-3 px-4 pb-4 shrink-0 bg-muted/15">
          {/* Subtotal & Discount row */}
          {cart.length > 0 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold">{rp(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Diskon</span>
                {txDiscountAmount > 0 ? (
                  <button
                    onClick={() => { setTempDiscountType(txDiscountType!); setTempDiscountValue(txDiscountValue); setDiscountDialogOpen(true); }}
                    className="flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2.5 py-0.5 font-bold text-[10px] hover:bg-destructive/20 transition-all shadow-sm"
                  >
                    <Tag className="w-3 h-3" />
                    -{rp(txDiscountAmount)} ({txDiscountType === 'percentage' ? `${txDiscountValue}%` : 'Nominal'})
                  </button>
                ) : (
                  <button
                    onClick={() => { setTempDiscountType('nominal'); setTempDiscountValue(''); setDiscountDialogOpen(true); }}
                    className="flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline font-bold text-[11px] transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Tambah Diskon
                  </button>
                )}
              </div>
            </>
          )}

          {/* Total */}
          <div className="flex justify-between text-sm font-bold border-t border-border/20 pt-3">
            <span className="text-foreground/90">Total Bayar</span>
            <span className="text-primary text-base sm:text-lg font-black">{rp(total)}</span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-11 text-xs font-bold rounded-xl shadow-sm hover:bg-muted active:scale-[0.98] transition-all"
              onClick={saveOpenBill}
              disabled={cart.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              Simpan Bill
            </Button>
            <Button
              className="flex-1 h-11 text-xs font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all"
              disabled={cart.length === 0}
              onClick={() => { setCheckoutOpen(true); setPaymentMethodId(paymentMethods?.[0]?.id?.toString() ?? ''); setPaymentAmount(total.toString()); setIsQuickAdding(false); }}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Bayar
            </Button>
          </div>

          {editingTxId && (
            <Button
              variant="outline"
              className="w-full h-9 text-[10px] font-bold text-destructive border-destructive/25 hover:bg-destructive/10 rounded-xl transition-colors"
              onClick={handleCancelFromCart}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Batalkan Bill Ini
            </Button>
          )}
        </div>
      </div>
      </div>{/* end flex row */}

      {/* Cart FAB (mobile only) */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="md:hidden fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 flex items-center justify-between gap-3 bg-gradient-to-r from-primary via-primary/95 to-primary/90 text-primary-foreground pl-4 pr-3 py-3.5 rounded-2xl shadow-xl shadow-primary/25 border border-white/10 active:scale-[0.98] transition-all z-40"
        >
          <div className="flex items-center gap-3">
            <div className="relative p-2 bg-white/10 rounded-xl shrink-0">
              <ShoppingCart className="w-4.5 h-4.5 text-white" />
              <span className="absolute -top-1.5 -right-1.5 h-4.5 min-w-[18px] px-1 bg-red-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center shadow-sm">
                {cartCount}
              </span>
            </div>
            <div className="text-left">
              <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider leading-none">Keranjang Belanja</p>
              <p className="text-sm font-black tracking-tight mt-1 leading-none">Rp {total.toLocaleString('id-ID')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold bg-white/10 pl-3 pr-2 py-1.5 rounded-xl shrink-0">
            <span>Lihat Keranjang</span>
            <ChevronRight className="w-3.5 h-3.5 text-white" />
          </div>
        </button>
      )}

      {/* Cart Sheet (mobile only) */}
      <div className="md:hidden">
      <Sheet open={cartOpen} onOpenChange={(open) => { setCartOpen(open); if (!open) setEditingItemNotes(null); }}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl max-w-lg mx-auto flex flex-col p-6">
          <SheetHeader className="pb-3 border-b border-border/30">
            <SheetTitle className="text-left flex items-center gap-2 text-base font-bold">
              <ShoppingCart className="w-4 h-4 text-primary" />
              Keranjang Belanja
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {cartCount}
              </span>
              {editingTxId && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full ml-auto">
                  Edit Bill
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col flex-1 overflow-hidden mt-4">
            {/* Items List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
              {cart.map(item => {
                const key = cartItemKey(item);
                const itemPrice = getItemPrice(item);
                return (
                  <div key={key} className="bg-card border border-border/40 p-3.5 rounded-2xl space-y-3 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3">
                      {item.product.photo ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-border/20 shadow-sm">
                          <img src={item.product.photo} alt={item.product.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-muted border border-border/20 flex items-center justify-center shrink-0 shadow-sm">
                          <PackageIcon className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-foreground truncate leading-snug">{item.product.name}</p>
                        {item.variantOption && (
                          <span className="inline-flex items-center text-[9px] text-accent bg-accent/5 px-2 py-0.5 rounded-full font-bold mt-1 border border-accent/10">
                            {item.variantOption.name}
                          </span>
                        )}
                        <p className="text-[10px] sm:text-xs text-muted-foreground/80 mt-1">
                          Rp {itemPrice.toLocaleString('id-ID')} × {item.qty}
                        </p>
                      </div>
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 shrink-0 bg-background border border-border/40 rounded-full p-0.5 shadow-sm">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-transform"
                          onClick={() => item.qty === 1 ? removeFromCart(key) : updateQty(key, -1)}
                        >
                          {item.qty === 1 ? <X className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        </Button>
                        <span className="w-6 text-center text-xs font-black">{item.qty}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-primary hover:text-primary hover:bg-primary/10 active:scale-90 transition-transform"
                          onClick={() => updateQty(key, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {/* Price and Notes row */}
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-border/20">
                      <span className="text-xs font-black text-primary">{rp(getItemSubtotal(item))}</span>
                      {item.notes ? (
                        <button
                          className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded-full transition-colors border border-accent/20"
                          onClick={() => { setEditingItemNotes(key); setTempItemNotes(item.notes || ''); }}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          {item.notes}
                        </button>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:underline transition-colors"
                          onClick={() => { setEditingItemNotes(key); setTempItemNotes(''); }}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          Catatan
                        </button>
                      )}
                    </div>
                    {/* Inline notes editor */}
                    {editingItemNotes === key && (
                      <div className="flex gap-1.5 items-center pt-1">
                        <Input
                          autoFocus
                          value={tempItemNotes}
                          onChange={e => setTempItemNotes(e.target.value)}
                          placeholder="Contoh: less sugar..."
                          className="h-8 text-xs rounded-lg flex-1"
                          onKeyDown={e => {
                            if (e.key === 'Enter') { updateItemNotes(key, tempItemNotes); setEditingItemNotes(null); }
                            if (e.key === 'Escape') setEditingItemNotes(null);
                          }}
                        />
                        <Button size="sm" className="h-8 text-xs rounded-lg px-3" onClick={() => { updateItemNotes(key, tempItemNotes); setEditingItemNotes(null); }}>Simpan</Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => setEditingItemNotes(null)}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Customer / Table quick inputs */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Nama pelanggan"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="pl-8 h-10 text-xs rounded-xl"
                />
              </div>
              <div className="relative flex-[0.6]">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Meja"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  className="pl-8 h-10 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="border-t border-border/30 pt-4 space-y-3 pb-6 bg-muted/15 -mx-6 px-6">
              {cart.length > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-semibold">{rp(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Diskon</span>
                    {txDiscountAmount > 0 ? (
                      <button
                        onClick={() => { setTempDiscountType(txDiscountType!); setTempDiscountValue(txDiscountValue); setDiscountDialogOpen(true); }}
                        className="flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2.5 py-0.5 font-bold text-[10px] hover:bg-destructive/20 transition-all shadow-sm"
                      >
                        <Tag className="w-3 h-3" />
                        -{rp(txDiscountAmount)} ({txDiscountType === 'percentage' ? `${txDiscountValue}%` : 'Nominal'})
                      </button>
                    ) : (
                      <button
                        onClick={() => { setTempDiscountType('nominal'); setTempDiscountValue(''); setDiscountDialogOpen(true); }}
                        className="flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline font-bold text-[11px] transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Tambah Diskon
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm font-bold border-t border-border/20 pt-3">
                <span className="text-foreground/90">Total Bayar</span>
                <span className="text-primary text-base sm:text-lg font-black">{rp(total)}</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-11 text-xs font-bold rounded-xl shadow-sm hover:bg-muted active:scale-[0.98] transition-all"
                  onClick={saveOpenBill}
                  disabled={cart.length === 0}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Simpan Bill
                </Button>
                <Button
                  className="flex-1 h-11 text-xs font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all"
                  disabled={cart.length === 0}
                  onClick={() => { setCheckoutOpen(true); setPaymentMethodId(paymentMethods?.[0]?.id?.toString() ?? ''); setPaymentAmount(total.toString()); setIsQuickAdding(false); }}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Bayar
                </Button>
              </div>

              {editingTxId && (
                <Button
                  variant="outline"
                  className="w-full h-9 text-[10px] font-bold text-destructive border-destructive/25 hover:bg-destructive/10 rounded-xl transition-colors"
                  onClick={handleCancelFromCart}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Batalkan Bill Ini
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      </div>{/* end mobile cart wrapper */}

      {/* Open Bills Sheet */}
      <Sheet open={openBillsOpen} onOpenChange={setOpenBillsOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl max-w-lg md:max-w-xl mx-auto">
          <SheetHeader>
            <SheetTitle className="text-left flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Open Bills ({openBillsCount})
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 overflow-y-auto pb-6 space-y-2">
            {!openBills || openBills.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Tidak ada open bill</p>
              </div>
            ) : (
              openBills.map(bill => (
                <Card key={bill.id} className="border-0 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{bill.receiptNumber}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {bill.openedAt ? format(new Date(bill.openedAt), 'dd/MM HH:mm', { locale: localeId }) : ''}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-primary">{rp(bill.total)}</span>
                    </div>
                    <div className="flex gap-1.5 text-[10px] text-muted-foreground mb-2">
                      {bill.customerName && <span>👤 {bill.customerName}</span>}
                      {bill.tableNumber && <span>🪑 Meja {bill.tableNumber}</span>}
                      {bill.remarks && <span className="truncate max-w-[120px]">📝 {bill.remarks}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8 text-xs flex-1" onClick={() => loadOpenBill(bill)}>
                        Lanjutkan
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive border-destructive/30"
                        onClick={() => handleCancelFromList(bill)}
                      >
                        Batal
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl overflow-hidden p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogTitle className="text-lg font-bold">Pembayaran</DialogTitle>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto max-h-[80vh] px-5 pb-5 space-y-4">
            {/* Total card + mode toggle */}
            <div className="bg-primary/5 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground text-center">Total Tagihan</p>
              <p className="text-3xl font-black text-primary text-center mt-0.5">{rp(total)}</p>
              {/* Discount summary if any */}
              {txDiscountAmount > 0 && (
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  Sebelum diskon: {rp(subtotal)} · Hemat {rp(txDiscountAmount)}
                </p>
              )}
              {/* Mode Toggle */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setSplitMode(false); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold transition-all',
                    !splitMode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background/60 text-muted-foreground hover:bg-background'
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Bayar Normal
                </button>
                <button
                  onClick={() => {
                    setSplitMode(true);
                    setSplits([{ id: '1', methodId: '', amount: '' }, { id: '2', methodId: '', amount: '' }]);
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold transition-all',
                    splitMode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background/60 text-muted-foreground hover:bg-background'
                  )}
                >
                  <Scissors className="w-3.5 h-3.5" /> Split Bill
                </button>
              </div>
            </div>

            {/* ── SPLIT MODE ── */}
            {splitMode ? (
              <div className="space-y-4">
                {/* Order Summary */}
                <div className="bg-muted/40 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/40">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Ringkasan Pesanan</p>
                  </div>
                  <div className="divide-y divide-border/30">
                    {cart.map(item => {
                      const unitPrice = item.variantOption?.price ?? item.product.price;
                      const discAmt = item.discountType === 'percentage'
                        ? Math.round(unitPrice * item.qty * item.discountValue / 100)
                        : (item.discountType === 'nominal' ? item.discountValue * item.qty : 0);
                      const lineTotal = unitPrice * item.qty - discAmt;
                      return (
                        <div key={`${item.product.id}-${item.variantOption?.id}`} className="flex items-center justify-between px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {item.product.name}
                              {item.variantOption && <span className="text-muted-foreground"> · {item.variantOption.name}</span>}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.qty} × {rp(unitPrice)}
                              {discAmt > 0 && <span className="text-success"> −{rp(discAmt)}</span>}
                            </p>
                          </div>
                          <p className="text-xs font-bold shrink-0 ml-2">{rp(lineTotal)}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center px-3 py-2 bg-muted/30 border-t border-border/40">
                    <span className="text-xs font-semibold">Total</span>
                    <span className="text-sm font-black text-primary">{rp(total)}</span>
                  </div>
                </div>

                {/* Bagi Rata Quick Dividers */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Bagi Rata Otomatis</p>
                  <div className="flex gap-2">
                    {[2, 3, 4].map(n => {
                      const perPerson = Math.round(total / n);
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            const newSplits = Array.from({ length: n }, (_, i) => ({
                              id: (i + 1).toString(),
                              methodId: splits[i]?.methodId || '',
                              amount: String(i < n - 1 ? perPerson : total - perPerson * (n - 1))
                            }));
                            setSplits(newSplits);
                          }}
                          className="flex-1 flex flex-col items-center py-2 px-1 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary transition-colors text-center"
                        >
                          <span className="text-xs font-bold">÷{n} orang</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">{rp(perPerson)}/org</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Split Entries */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Detail Pembayaran</p>
                    {splits.length < 6 && (
                      <button
                        onClick={addSplit}
                        className="text-xs text-primary font-semibold flex items-center gap-1 hover:opacity-80"
                      >
                        <Plus className="w-3 h-3" /> Tambah
                      </button>
                    )}
                  </div>
                  {splits.map((sp, i) => {
                    const splitPaid = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
                    const rem = total - splitPaid;
                    const isLast = i === splits.length - 1;
                    return (
                      <div key={sp.id} className="flex items-center gap-2 bg-muted/30 rounded-xl p-2.5">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                          {i + 1}
                        </div>
                        <Select value={sp.methodId} onValueChange={v => updateSplit(sp.id, 'methodId', v)}>
                          <SelectTrigger className="flex-1 h-9 text-xs bg-background">
                            <SelectValue placeholder="Pilih metode" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods?.map(pm => (
                              <SelectItem key={pm.id} value={pm.id!.toString()}>
                                {pm.category === 'tunai' ? '💵' : pm.category === 'qris' ? '📱' : '🏦'} {pm.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Rp</span>
                          <Input
                            type="number"
                            placeholder="0"
                            value={sp.amount}
                            onChange={e => updateSplit(sp.id, 'amount', e.target.value)}
                            className="pl-6 h-9 text-xs text-right pr-2"
                          />
                          {/* Quick-fill remaining */}
                          {rem > 0 && sp.amount === '' && (
                            <button
                              onClick={() => updateSplit(sp.id, 'amount', String(rem))}
                              className="absolute -bottom-4 right-0 text-[9px] text-primary font-medium hover:underline leading-none"
                            >
                              Isi sisa
                            </button>
                          )}
                        </div>
                        {splits.length > 2 && (
                          <button
                            onClick={() => removeSplit(sp.id)}
                            className="w-7 h-7 shrink-0 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Running total progress */}
                {(() => {
                  const splitPaid = splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
                  const rem = total - splitPaid;
                  const done = Math.abs(rem) < 1;
                  const pct = Math.min((splitPaid / total) * 100, 100);
                  return (
                    <div className={cn('rounded-xl overflow-hidden border transition-colors', done ? 'border-success/30 bg-success/5' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20')}>
                      <div className="flex justify-between items-center px-3 py-2.5">
                        <div>
                          <p className={cn('text-xs font-semibold', done ? 'text-success' : 'text-amber-700 dark:text-amber-400')}>
                            {done ? '✓ Semua terbayar' : `Sisa: ${rp(Math.abs(rem))}`}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Terbayar: {rp(splitPaid)} dari {rp(total)}
                          </p>
                        </div>
                        {done && <Check className="w-5 h-5 text-success" />}
                      </div>
                      {/* Progress bar */}
                      <div className="h-1 w-full bg-muted/50">
                        <div
                          className={cn('h-full transition-all duration-300 rounded-full', done ? 'bg-success' : 'bg-amber-400')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* ── NORMAL PAYMENT ── */
              <>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Metode Pembayaran</p>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods?.map(pm => {
                      const isCash = pm.category === 'tunai';
                      return (
                        <button
                          key={pm.id}
                          onClick={() => {
                            setPaymentMethodId(pm.id!.toString());
                            if (!isCash) {
                              setPaymentAmount(total.toString());
                              setIsQuickAdding(false);
                            }
                          }}
                          className={cn('p-3 rounded-xl text-xs font-semibold border-2 transition-all', paymentMethodId === pm.id!.toString() ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-muted bg-muted/50 text-muted-foreground hover:border-primary/30')}
                        >
                          {pm.category === 'tunai' ? '💵' : pm.category === 'qris' ? '📱' : '🏦'} {pm.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment amount */}
                {(() => {
                  const selectedPM = paymentMethods?.find(p => p.id === Number(paymentMethodId));
                  const isCash = selectedPM?.category === 'tunai';
                  if (!selectedPM) return null;
                  if (!isCash) {
                    return (
                      <div className="bg-primary/5 p-3 rounded-xl text-center space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Bayar via {selectedPM.name}</p>
                        <p className="text-xl font-bold text-primary">{rp(total)}</p>
                        <p className="text-[10px] text-muted-foreground">Nominal otomatis sesuai total (tidak ada kembalian)</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Jumlah Bayar (Tunai)</p>
                      <div className="h-12 flex items-center justify-center rounded-md border border-input bg-background text-lg font-bold text-center px-3">
                        {paidAmount > 0 ? `Rp ${paidAmount.toLocaleString('id-ID')}` : 'Rp 0'}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map(nom => (
                          <button
                            key={nom}
                            onClick={() => {
                              if (!isQuickAdding) { setPaymentAmount(String(nom)); setIsQuickAdding(true); }
                              else { setPaymentAmount(prev => String((Number(prev) || 0) + nom)); }
                            }}
                            className="flex-1 min-w-[calc(25%-6px)] h-9 rounded-lg border border-border bg-muted/50 text-xs font-semibold hover:bg-primary/10 hover:border-primary hover:text-primary active:scale-95 transition-all"
                          >
                            {nom >= 1000 ? `${(nom / 1000)}K` : nom}
                          </button>
                        ))}
                        <button
                          onClick={() => { setPaymentAmount(total.toString()); setIsQuickAdding(false); }}
                          className="flex-1 min-w-[calc(25%-6px)] h-9 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 active:scale-95 transition-all"
                        >
                          Uang Pas
                        </button>
                      </div>
                      <button
                        onClick={() => { setPaymentAmount('0'); setIsQuickAdding(false); }}
                        className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
                      >
                        Reset
                      </button>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Customer + Table + Remarks */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Nama pelanggan" value={customerName} onChange={e => setCustomerName(e.target.value)} className="pl-8 h-10 text-sm" />
                </div>
                <div className="relative flex-[0.7]">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Meja" value={tableNumber} onChange={e => setTableNumber(e.target.value)} className="pl-8 h-10 text-sm" />
                </div>
              </div>
              <Input placeholder="Catatan tambahan (opsional)" value={remarks} onChange={e => setRemarks(e.target.value)} className="h-10" />
            </div>

            {/* Kembalian — normal cash only */}
            {!splitMode && paidAmount >= total && paymentMethods?.find(p => p.id === Number(paymentMethodId))?.category === 'tunai' && change > 0 && (
              <div className="flex justify-between items-center bg-success/10 border border-success/20 p-3 rounded-xl">
                <span className="text-sm font-medium">Kembalian</span>
                <span className="text-lg font-bold text-success">Rp {change.toLocaleString('id-ID')}</span>
              </div>
            )}

            {/* Confirm button */}
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl"
              onClick={handleCheckout}
              disabled={splitMode
                ? splits.some(sp => !sp.methodId || !Number(sp.amount)) || Math.abs(splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0) - total) >= 1
                : (!paymentMethodId || paidAmount < total)
              }
            >
              <Check className="w-5 h-5 mr-2" />
              {splitMode ? `Konfirmasi Split (${splits.length} org)` : 'Konfirmasi Transaksi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Discount Dialog */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>Diskon Transaksi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Jenis Diskon</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTempDiscountType('nominal')}
                  className={cn('p-3 rounded-xl text-sm font-semibold border-2 transition-colors', tempDiscountType === 'nominal' ? 'border-primary bg-primary/5 text-primary' : 'border-muted bg-muted/50 text-muted-foreground')}
                >
                  Nominal (Rp)
                </button>
                <button
                  onClick={() => setTempDiscountType('percentage')}
                  className={cn('p-3 rounded-xl text-sm font-semibold border-2 transition-colors', tempDiscountType === 'percentage' ? 'border-primary bg-primary/5 text-primary' : 'border-muted bg-muted/50 text-muted-foreground')}
                >
                  Persen (%)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">{tempDiscountType === 'percentage' ? 'Persentase Diskon' : 'Jumlah Diskon'}</p>
              <Input
                type="number"
                value={tempDiscountValue}
                onChange={e => setTempDiscountValue(e.target.value)}
                placeholder={tempDiscountType === 'percentage' ? 'Contoh: 10' : 'Contoh: 5000'}
                className="h-12 text-lg font-bold text-center"
              />
              {tempDiscountType === 'percentage' && Number(tempDiscountValue) > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  = Rp {(subtotal * Number(tempDiscountValue) / 100).toLocaleString('id-ID')} dari Rp {subtotal.toLocaleString('id-ID')}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {txDiscountType && (
                <Button variant="outline" className="h-11 text-destructive border-destructive/30" onClick={() => {
                  setTxDiscountType(null);
                  setTxDiscountValue('');
                  setDiscountDialogOpen(false);
                }}>
                  Hapus
                </Button>
              )}
              <Button className="flex-1 h-11 font-semibold" onClick={() => {
                if (Number(tempDiscountValue) > 0) {
                  setTxDiscountType(tempDiscountType);
                  setTxDiscountValue(tempDiscountValue);
                } else {
                  setTxDiscountType(null);
                  setTxDiscountValue('');
                }
                setDiscountDialogOpen(false);
              }}>
                Simpan Diskon
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      {lastTransaction && (
        <Receipt
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          transaction={lastTransaction}
          items={lastTxItems}
          storeSettings={storeSettings}
          paymentMethodName={paymentMethods?.find(pm => pm.id === lastTransaction.paymentMethodId)?.name || 'Tunai'}
        />
      )}

      {/* Barcode Scanner */}
      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={handleScan}
          />
        </Suspense>
      )}

      {/* Cancel Open Bill Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              Bill ini akan dihapus dan stok produk akan dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelTargetTx(null)}>Tidak</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelTargetTx && cancelOpenBill(cancelTargetTx)}
            >
              Batalkan Bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Variant Picker Dialog */}
      <Dialog open={variantPickerOpen} onOpenChange={(open) => { setVariantPickerOpen(open); if (!open) setVariantPickerProduct(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-left">Pilih Variant</DialogTitle>
          </DialogHeader>
          {variantPickerProduct && (() => {
            const productOptions = getProductVariantOptions(variantPickerProduct.id!);
            // Group options by their variant group
            const groupedOptions = allVariantGroups
              ?.filter(g => g.productId === variantPickerProduct.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(group => ({
                group,
                options: productOptions
                  .filter(o => o.variantGroupId === group.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder),
              }))
              .filter(g => g.options.length > 0) ?? [];

            return (
              <div className="space-y-4 mt-2">
                {/* Product info */}
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {variantPickerProduct.photo ? (
                      <img src={variantPickerProduct.photo} alt={variantPickerProduct.name} className="w-full h-full object-cover" />
                    ) : (
                      <PackageIcon className="w-6 h-6 text-muted-foreground/30" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{variantPickerProduct.name}</p>
                    <p className="text-[10px] text-muted-foreground">Stok: {variantPickerProduct.stock} {variantPickerProduct.unit}</p>
                  </div>
                </div>

                {/* Variant groups */}
                {groupedOptions.map(({ group, options }) => (
                  <div key={group.id} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {options.map(opt => (
                        <button
                          key={opt.id}
                          className="p-3 rounded-xl border-2 border-muted bg-muted/30 hover:border-primary hover:bg-primary/5 active:scale-[0.97] transition-all text-left"
                          onClick={() => {
                            addToCartDirect(variantPickerProduct, opt);
                            setVariantPickerOpen(false);
                            setVariantPickerProduct(null);
                          }}
                        >
                          <p className="text-sm font-semibold">{opt.name}</p>
                          <p className="text-xs font-bold text-primary mt-0.5">Rp {opt.price.toLocaleString('id-ID')}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Open Shift Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-xs rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Buka Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Masukkan jumlah uang tunai yang ada di laci kas saat ini.</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Kas Awal (Rp)</label>
              <div className="h-12 flex items-center justify-center rounded-md border border-input bg-background text-lg font-bold text-center px-3">
                {Number(openingCash) > 0 ? `Rp ${Number(openingCash).toLocaleString('id-ID')}` : 'Rp 0'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[50000, 100000, 200000, 300000, 500000].map(nom => (
                  <button
                    key={nom}
                    onClick={() => setOpeningCash(String(nom))}
                    className={cn(
                      'flex-1 min-w-[calc(33%-6px)] h-9 rounded-lg border text-xs font-semibold active:scale-95 transition-all',
                      Number(openingCash) === nom
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/50 text-foreground hover:bg-primary/10 hover:border-primary hover:text-primary'
                    )}
                  >
                    {(nom / 1000)}K
                  </button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Atau ketik manual..."
                value={openingCash}
                onChange={e => setOpeningCash(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <Button className="w-full h-12 text-sm font-semibold" onClick={handleOpenShift}>
              <Clock className="w-4 h-4 mr-2" />
              Mulai Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Shift Summary Dialog */}
      {/* Close Shift Recap Sheet */}
      <Sheet open={closeShiftDialogOpen} onOpenChange={(open) => { setCloseShiftDialogOpen(open); if (!open) { setShiftSummary(null); setActualCash(''); } }}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl max-w-lg md:max-w-xl mx-auto flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/90 to-orange-400 p-4 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-base">Shift Selesai 🎉</p>
                <p className="text-xs text-white/80">{shiftSummary?.userName} · {shiftSummary ? format(shiftSummary.openedAt, 'dd MMM yyyy') : ''}</p>
              </div>
            </div>
            {shiftSummary && (
              <div className="flex gap-3 mt-3">
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-white/70">Buka</p>
                  <p className="font-bold text-sm">{format(shiftSummary.openedAt, 'HH:mm')}</p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-white/70">Tutup</p>
                  <p className="font-bold text-sm">{format(shiftSummary.closedAt, 'HH:mm')}</p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-white/70">Durasi</p>
                  <p className="font-bold text-sm">
                    {(() => { const m = Math.round((shiftSummary.closedAt.getTime() - shiftSummary.openedAt.getTime()) / 60000); return m >= 60 ? `${Math.floor(m/60)}j ${m%60}m` : `${m}m`; })()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {shiftSummary && (
              <>
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-primary/5 border border-primary/10 p-3 rounded-xl">
                    <p className="text-2xl font-bold text-primary">{shiftSummary.totalTx}</p>
                    <p className="text-[11px] text-muted-foreground">Total Transaksi</p>
                  </div>
                  <div className="bg-success/5 border border-success/10 p-3 rounded-xl">
                    <p className="text-lg font-bold text-success">Rp {shiftSummary.totalSales.toLocaleString('id-ID')}</p>
                    <p className="text-[11px] text-muted-foreground">Total Penjualan</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-xl">
                    <p className="text-base font-bold">Rp {shiftSummary.cashSales.toLocaleString('id-ID')}</p>
                    <p className="text-[11px] text-muted-foreground">Tunai</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-xl">
                    <p className="text-base font-bold">Rp {shiftSummary.nonCashSales.toLocaleString('id-ID')}</p>
                    <p className="text-[11px] text-muted-foreground">Non-Tunai</p>
                  </div>
                </div>

                {/* Payment breakdown */}
                {shiftSummary.paymentBreakdown.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Metode Pembayaran
                    </p>
                    {shiftSummary.paymentBreakdown.map(pb => (
                      <div key={pb.name} className="flex justify-between items-center bg-muted/30 px-3 py-2.5 rounded-lg">
                        <span className="text-sm">{pb.name}</span>
                        <div className="text-right">
                          <p className="text-sm font-semibold">Rp {pb.total.toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-muted-foreground">{pb.count} transaksi</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Profit — owner only */}
                {isOwner && shiftSummary.totalProfit > 0 && (
                  <div className="flex justify-between items-center bg-accent/10 border border-accent/20 px-3 py-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-accent" />
                      <span className="text-sm font-medium">Profit Shift</span>
                    </div>
                    <span className="text-base font-bold text-accent">Rp {shiftSummary.totalProfit.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {/* Cash drawer section */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Rekap Kas Laci
                  </p>
                  <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kas Awal</span>
                      <span>Rp {shiftSummary.openingCash.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">+ Penjualan Tunai</span>
                      <span className="text-success">Rp {shiftSummary.cashSales.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t pt-2">
                      <span>Ekspektasi di Laci</span>
                      <span className="text-primary">Rp {(shiftSummary.openingCash + shiftSummary.cashSales).toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  {/* Actual cash input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Uang Aktual di Laci (opsional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={actualCash}
                        onChange={e => setActualCash(e.target.value)}
                        className="pl-9 h-10 text-sm"
                      />
                    </div>
                    {actualCash && (() => {
                      const actual = Number(actualCash);
                      const expected = shiftSummary.openingCash + shiftSummary.cashSales;
                      const diff = actual - expected;
                      return (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                          diff === 0 ? 'bg-success/10 text-success' :
                          diff > 0 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400' :
                          'bg-destructive/10 text-destructive'
                        }`}>
                          {diff === 0 ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          <span>
                            {diff === 0 ? 'Kas sesuai ✅' :
                             diff > 0 ? `Lebih Rp ${Math.abs(diff).toLocaleString('id-ID')}` :
                             `Kurang Rp ${Math.abs(diff).toLocaleString('id-ID')}`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Bottom action buttons */}
          <div className="p-4 border-t space-y-2 shrink-0 bg-background">
            {shiftSummary && (
              <Button
                variant="outline"
                className="w-full h-11 gap-2 text-sm"
                onClick={async () => {
                  const { exportShiftPDF } = await import('@/lib/export-pdf');
                  exportShiftPDF({
                    storeName: storeSettings?.storeName || 'Lini POS',
                    storeAddress: storeSettings?.address,
                    userName: shiftSummary.userName,
                    openedAt: shiftSummary.openedAt,
                    closedAt: shiftSummary.closedAt,
                    openingCash: shiftSummary.openingCash,
                    totalTx: shiftSummary.totalTx,
                    totalSales: shiftSummary.totalSales,
                    totalProfit: shiftSummary.totalProfit,
                    cashSales: shiftSummary.cashSales,
                    nonCashSales: shiftSummary.nonCashSales,
                    actualCash: Number(actualCash) || (shiftSummary.openingCash + shiftSummary.cashSales),
                    paymentBreakdown: shiftSummary.paymentBreakdown,
                  });
                }}
              >
                <FileText className="w-4 h-4" />
                Export Rekap PDF
              </Button>
            )}
            <Button
              className="w-full h-11"
              onClick={() => { setCloseShiftDialogOpen(false); setShiftSummary(null); setActualCash(''); }}
            >
              Selesai
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
