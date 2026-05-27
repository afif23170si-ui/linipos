import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type TransactionItemRecord } from '@/lib/db';
import { useState, useEffect } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { ArrowLeft, Search, Receipt as ReceiptIcon, Calendar, ChevronRight, ShoppingBag, CalendarIcon, X, Trash2, ShoppingCart, RotateCcw, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ReceiptDialog from '@/components/Receipt';
import RefundDialog from '@/components/RefundDialog';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

export default function TransactionHistory({ embedded = false }: { embedded?: boolean }) {
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreStock, setRestoreStock] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'open'>('all');

  const transactions = useLiveQuery(() =>
    db.transactions.orderBy('date').reverse().toArray()
  );

  const [refundTx, setRefundTx] = useState<Transaction | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  // Query all transaction items and build lookup map
  const txItemsMap = useLiveQuery(async () => {
    const items = await db.transactionItems.toArray();
    const map: Record<number, TransactionItemRecord[]> = {};
    for (const item of items) {
      if (!map[item.transactionId]) map[item.transactionId] = [];
      map[item.transactionId].push(item);
    }
    return map;
  });

  const getTxItems = (txId: number | undefined): TransactionItemRecord[] =>
    txId ? (txItemsMap?.[txId] ?? []) : [];
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());
  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  // Auto-open detail if txId is in URL
  const txIdParam = searchParams.get('txId');
  useEffect(() => {
    if (txIdParam && transactions) {
      const tx = transactions.find(t => t.id === Number(txIdParam) || t.receiptNumber === txIdParam);
      if (tx) {
        setSelectedTx(tx);
        setDetailOpen(true);
      }
    }
  }, [txIdParam, transactions]);

  const getPaymentName = (pmId: number) =>
    paymentMethods?.find(pm => pm.id === pmId)?.name || 'Tunai';

  const filtered = transactions?.filter(tx => {
    // Status filter
    if (filterStatus !== 'all' && tx.status !== filterStatus) return false;
    // Date filter
    if (dateFrom) {
      const txDate = new Date(tx.date);
      if (txDate < startOfDay(dateFrom)) return false;
    }
    if (dateTo) {
      const txDate = new Date(tx.date);
      if (txDate > endOfDay(dateTo)) return false;
    }
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const items = getTxItems(tx.id);
      return (
        tx.receiptNumber.toLowerCase().includes(q) ||
        items.some(it => it.productName.toLowerCase().includes(q))
      );
    }
    return true;
  }) ?? [];

  // Group by date
  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const key = format(new Date(tx.date), 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const filteredTotal = filtered.filter(t => t.status !== 'open').reduce((s, t) => s + t.total, 0);
  const completedCount = filtered.filter(t => t.status !== 'open' && t.type !== 'refund').length;
  const hasDateFilter = dateFrom || dateTo;

  const openDetail = (tx: Transaction) => {
    setSelectedTx(tx);
    setDetailOpen(true);
  };

  const openReceipt = () => {
    setDetailOpen(false);
    setTimeout(() => setReceiptOpen(true), 200);
  };

  const clearDateFilter = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleDeleteTransaction = async () => {
    if (!selectedTx?.id) return;
    try {
      if (restoreStock) {
        const items = getTxItems(selectedTx.id);
        for (const item of items) {
          const product = await db.products.get(item.productId);
          if (product) {
            await db.products.update(item.productId, { stock: product.stock + item.quantity });
          }
        }
      }
      await db.transactionItems.where('transactionId').equals(selectedTx.id).delete();
      await db.transactions.delete(selectedTx.id);
      setDeleteDialogOpen(false);
      setDetailOpen(false);
      setSelectedTx(null);
      toast.success('Transaksi berhasil dihapus');
    } catch {
      toast.error('Gagal menghapus transaksi');
    }
  };

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  return (
    <div className={embedded ? 'pb-4 space-y-4' : 'px-4 pt-6 pb-20 space-y-5'}>
      {/* Header — hidden when embedded inside Reports */}
      {!embedded && (
        <div className="flex flex-col gap-1 mb-6">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Riwayat Transaksi
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">
            Lihat dan kelola seluruh catatan transaksi penjualan
          </p>
        </div>
      )}

      {/* Search Bar & Filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="Cari no. struk atau nama produk..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10.5 rounded-xl border-border/40 bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground/50 transition-all text-xs font-medium"
          />
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "h-10 text-xs font-bold gap-1.5 flex-1 rounded-xl border-border/50 bg-card hover:bg-muted/30 shadow-sm transition-all", 
                  dateFrom && "border-primary text-primary bg-primary/5 hover:bg-primary/10"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                {dateFrom ? format(dateFrom, 'dd MMM yyyy', { locale: localeId }) : 'Dari tanggal'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <span className="text-xs text-muted-foreground font-bold">—</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "h-10 text-xs font-bold gap-1.5 flex-1 rounded-xl border-border/50 bg-card hover:bg-muted/30 shadow-sm transition-all", 
                  dateTo && "border-primary text-primary bg-primary/5 hover:bg-primary/10"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                {dateTo ? format(dateTo, 'dd MMM yyyy', { locale: localeId }) : 'Sampai tanggal'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarPicker
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {hasDateFilter && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 shrink-0 bg-card border border-border/50 hover:bg-muted/30 hover:text-destructive rounded-xl active:scale-95 transition-all shadow-sm" 
              onClick={clearDateFilter}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Status filter tabs (Segmented Control) */}
      <div className="flex gap-1 p-1 bg-muted/30 border border-border/40 rounded-2xl w-fit">
        {([
          { value: 'all', label: 'Semua' },
          { value: 'open', label: 'Open Bill' },
          { value: 'completed', label: 'Lunas' },
        ] as const).map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            className={cn(
              'px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95',
              filterStatus === tab.value 
                ? 'bg-primary text-primary-foreground shadow-sm font-bold' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 font-semibold'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Recaps */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border border-border/35 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Transaksi</p>
                <p className="text-lg font-black text-foreground mt-0.5">{completedCount} kali</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border border-border/35 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center shadow-inner shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Penjualan</p>
                <p className="text-lg font-black text-foreground mt-0.5 truncate">{rp(filteredTotal)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction list grouped by date */}
      {dateKeys.length === 0 ? (
        <div className="text-center py-20 bg-card border border-border/30 rounded-2xl shadow-sm">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">
            {hasDateFilter ? 'Tidak ada transaksi di rentang tanggal ini' : 'Belum ada transaksi'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {dateKeys.map(dateKey => (
            <div key={dateKey} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-4 h-4 text-primary" />
                <p className="text-xs font-bold text-foreground">
                  {format(new Date(dateKey), 'EEEE, dd MMMM yyyy', { locale: localeId })}
                </p>
                <Badge variant="secondary" className="text-[9px] font-black h-5 rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-sm">
                  {grouped[dateKey].length} Transaksi
                </Badge>
              </div>
              
              <div className="space-y-2">
                {grouped[dateKey].map(tx => (
                  <Card
                    key={tx.id ?? tx.receiptNumber}
                    className="border border-border/30 bg-card hover:border-primary/20 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99] cursor-pointer"
                    onClick={() => openDetail(tx)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner border border-border/30',
                        tx.type === 'refund' 
                          ? 'bg-amber-500/10 text-amber-600'
                          : tx.status === 'open' 
                            ? 'bg-warning/15 text-warning' 
                            : 'bg-primary/10 text-primary'
                      )}>
                        {tx.type === 'refund' 
                          ? <RotateCcw className="w-4.5 h-4.5" />
                          : tx.status === 'open' 
                            ? <ShoppingCart className="w-4.5 h-4.5" /> 
                            : <ReceiptIcon className="w-4.5 h-4.5" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono font-bold text-muted-foreground truncate">{tx.receiptNumber}</p>
                            {tx.type === 'refund' ? (
                              <span className="inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">Retur</span>
                            ) : tx.status === 'open' ? (
                              <span className="inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">Open</span>
                            ) : (
                              <span className="inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-success/10 text-success border border-success/20">Lunas</span>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground/80">{format(new Date(tx.date), 'HH:mm')}</p>
                        </div>
                        
                        <p className="text-sm font-black text-primary mt-1">{rp(tx.total)}</p>
                        
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {tx.status !== 'open' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/40">
                              <CreditCard className="w-2.5 h-2.5 text-muted-foreground/80" />
                              {getPaymentName(tx.paymentMethodId)}
                            </span>
                          )}
                          {tx.userName && (
                            <span className="inline-flex items-center text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/40">
                              🧑‍💼 {tx.userName}
                            </span>
                          )}
                          {tx.customerName && (
                            <span className="inline-flex items-center text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/40">
                              👤 {tx.customerName}
                            </span>
                          )}
                          {tx.tableNumber && (
                            <span className="inline-flex items-center text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/40">
                              🪑 Meja {tx.tableNumber}
                            </span>
                          )}
                          {tx.remarks && (
                            <span className="inline-flex items-center text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/40 max-w-[150px] truncate">
                              📝 {tx.remarks}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-[10px] font-medium text-muted-foreground/80 truncate mt-2 border-t border-dashed border-border/30 pt-1.5">
                          {getTxItems(tx.id).map(it => it.productName).join(', ')}
                        </p>
                      </div>
                      
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="h-[82vh] rounded-t-[2.5rem] border-t border-border/40 max-w-lg md:max-w-xl mx-auto flex flex-col p-6 shadow-2xl">
          <SheetHeader className="shrink-0 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-black text-foreground">Detail Transaksi</SheetTitle>
              {selectedTx && (
                <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-lg border border-border/40">
                  {selectedTx.receiptNumber}
                </span>
              )}
            </div>
          </SheetHeader>
          
          {selectedTx && (
            <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-6 scrollbar-none">
              <div className="bg-muted/20 border border-border/40 rounded-2xl p-4 space-y-2.5 shadow-sm">
                <div className="flex justify-between items-center text-xs border-b border-border/20 pb-2">
                  <span className="text-muted-foreground font-semibold">Status</span>
                  {selectedTx.type === 'refund' ? (
                    <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">Retur / Refund</span>
                  ) : selectedTx.status === 'open' ? (
                    <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">Open Bill (Belum Bayar)</span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-lg bg-success/10 text-success border border-success/20">Lunas / Berhasil</span>
                  )}
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Tanggal</span>
                  <span className="font-bold text-foreground">{format(new Date(selectedTx.date), 'dd MMM yyyy, HH:mm', { locale: localeId })}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Metode Pembayaran</span>
                  <span className="font-bold text-foreground">{selectedTx.status === 'open' ? '-' : getPaymentName(selectedTx.paymentMethodId)}</span>
                </div>
                {selectedTx.customerName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Pelanggan</span>
                    <span className="font-bold text-foreground">👤 {selectedTx.customerName}</span>
                  </div>
                )}
                {selectedTx.tableNumber && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">No. Meja</span>
                    <span className="font-bold text-foreground">🪑 Meja {selectedTx.tableNumber}</span>
                  </div>
                )}
                {selectedTx.remarks && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Catatan</span>
                    <span className="text-right text-foreground font-medium max-w-[60%] truncate">📝 {selectedTx.remarks}</span>
                  </div>
                )}
                {selectedTx.userName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Kasir</span>
                    <span className="font-bold text-foreground">🧑‍💼 {selectedTx.userName}</span>
                  </div>
                )}
              </div>

              {/* Items Section */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Daftar Item</p>
                {getTxItems(selectedTx.id).map((item, i) => (
                  <div key={i} className="flex justify-between items-center bg-card border border-border/30 p-3 rounded-xl hover:border-primary/10 transition-colors shadow-sm">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-xs font-bold text-foreground truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                        {item.quantity} × {rp(item.price)}
                        {item.discountAmount > 0 && <span className="text-destructive font-semibold"> (Diskon -{rp(item.discountAmount)})</span>}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-accent mt-1 inline-flex items-center gap-1 bg-accent/5 px-2 py-0.5 rounded-md border border-accent/20">
                          📝 {item.notes}
                        </p>
                      )}
                    </div>
                    <p className="text-xs font-black text-foreground shrink-0">{rp(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              {/* Struk Perhitungan & Detail Keuangan */}
              <div className="border-t border-dashed border-border/50 pt-4 space-y-2">
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="text-foreground">{rp(selectedTx.subtotal)}</span>
                </div>
                {selectedTx.discountAmount > 0 && (
                  <div className="flex justify-between text-xs font-semibold text-destructive">
                    <span>Diskon</span>
                    <span>-{rp(selectedTx.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-foreground border-t border-dashed border-border/40 pt-2">
                  <span>Total Bayar</span>
                  <span className="text-primary">{rp(selectedTx.total)}</span>
                </div>
                
                {selectedTx.status !== 'open' ? (
                  <div className="bg-muted/15 p-3.5 rounded-2xl border border-border/30 space-y-2 mt-2 shadow-sm">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>Tunai / Jumlah Bayar</span>
                      <span className="text-foreground">{rp(selectedTx.paymentAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>Kembalian</span>
                      <span className="text-success font-bold">{rp(selectedTx.change)}</span>
                    </div>
                    {isOwner && (
                      <div className="flex justify-between text-xs font-semibold border-t border-border/40 pt-2 mt-2 text-muted-foreground">
                        <span>Estimasi Profit Bersih</span>
                        <span className="text-success font-black">{rp(selectedTx.profit)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-warning/10 border border-warning/20 p-3.5 rounded-2xl text-center text-xs font-bold text-amber-700 dark:text-amber-500 mt-2 shadow-sm">
                    ⚠️ Menunggu Pembayaran di Kasir
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                {selectedTx.status === 'open' ? (
                  <Button 
                    className="w-full h-11 text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all" 
                    onClick={() => { setDetailOpen(false); navigate('/cashier'); }}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Lanjutkan di Kasir
                  </Button>
                ) : (
                  <Button 
                    className="w-full h-11 text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all" 
                    onClick={openReceipt}
                  >
                    <ReceiptIcon className="w-4 h-4 mr-2" />
                    Lihat & Cetak Struk
                  </Button>
                )}

                {/* Retur button — owner only, completed sales only */}
                {isOwner && selectedTx.status === 'completed' && selectedTx.type !== 'refund' && (
                  <Button
                    variant="outline"
                    className="w-full h-11 text-xs font-bold rounded-xl border-amber-300 text-amber-700 bg-amber-50/50 hover:bg-amber-100 dark:hover:bg-amber-950/30 gap-2 active:scale-95 transition-all shadow-sm"
                    onClick={() => {
                      setRefundTx(selectedTx);
                      setDetailOpen(false);
                      setTimeout(() => setRefundOpen(true), 200);
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Retur / Refund
                  </Button>
                )}

                {/* Delete button — owner only */}
                {isOwner && (
                  <Button
                    variant="outline"
                    className="w-full h-11 text-xs font-bold rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 active:scale-95 transition-all shadow-sm"
                    onClick={() => { setRestoreStock(true); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hapus Catatan Transaksi
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Receipt reprint */}
      {selectedTx && (
        <ReceiptDialog
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          transaction={selectedTx}
          items={getTxItems(selectedTx.id)}
          storeSettings={storeSettings}
          paymentMethodName={getPaymentName(selectedTx.paymentMethodId)}
        />
      )}

      {/* Refund Dialog */}
      <RefundDialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        transaction={refundTx}
        onRefundDone={() => { /* Live query auto-updates */ }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl p-5 border border-border/30 shadow-2xl bg-card">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              <AlertDialogTitle className="font-black text-base">Hapus Transaksi?</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                <p>
                  Transaksi <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border border-border/40">{selectedTx?.receiptNumber}</span> senilai <span className="font-bold text-foreground">{selectedTx && rp(selectedTx.total)}</span> akan dihapus secara permanen dari database lokal.
                </p>
                <div className="flex items-center gap-2.5 bg-muted/20 p-3 rounded-xl border border-border/40 cursor-pointer select-none">
                  <Checkbox
                    id="restore-stock"
                    checked={restoreStock}
                    onCheckedChange={(checked) => setRestoreStock(checked === true)}
                    className="data-[state=checked]:bg-primary rounded-md"
                  />
                  <label htmlFor="restore-stock" className="text-xs font-bold text-foreground cursor-pointer flex-1">
                    Kembalikan stok produk otomatis
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel className="rounded-xl h-10 text-xs font-bold bg-muted/50 border-0 hover:bg-muted active:scale-95 transition-all">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTransaction} className="rounded-xl h-10 text-xs font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md active:scale-95 transition-all">
              Hapus Transaksi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
