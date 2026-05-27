import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TransactionItemRecord } from '@/lib/db';
import { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, ShoppingCart, Package, DollarSign, ArrowDown, ArrowUp, Minus, Layers, SlidersHorizontal, X, FileDown, Loader2, Receipt, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, startOfDay, startOfWeek, startOfYear, endOfDay, subWeeks } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


type FilterPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

function getDateRange(preset: FilterPreset): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now), label: 'Hari Ini' };
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y), label: 'Kemarin' }; }
    case 'thisWeek': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now), label: 'Minggu Ini' };
    case 'lastWeek': { const s = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1); return { from: s, to: endOfDay(subDays(startOfWeek(now, { weekStartsOn: 1 }), 1)), label: 'Minggu Lalu' }; }
    case 'thisMonth': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: 'Bulan Ini' };
    case 'lastMonth': return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)), label: 'Bulan Lalu' };
    case 'thisYear': return { from: startOfYear(now), to: endOfDay(now), label: 'Tahun Ini' };
    default: return { from: startOfDay(subDays(now, 7)), to: endOfDay(now), label: '7 Hari' };
  }
}

export default function Laporan() {
  const { isOwner } = useAuth();
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('today');
  const [filterOpen, setFilterOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  const dateRange = useMemo(() => {
    if (filterPreset === 'custom' && customFrom && customTo) {
      return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)), label: `${format(new Date(customFrom), 'dd/MM')} - ${format(new Date(customTo), 'dd/MM')}` };
    }
    return getDateRange(filterPreset);
  }, [filterPreset, customFrom, customTo]);

  // All transactions in range (used for display/history purposes)
  const transactions = useLiveQuery(async () => {
    return db.transactions.where('date').between(dateRange.from, dateRange.to, true, true).toArray();
  }, [dateRange.from.getTime(), dateRange.to.getTime()]);

  // Only completed sales — used for all financial metrics
  const completedSales = useMemo(() => {
    return transactions?.filter(t => t.status === 'completed' && t.type !== 'refund') ?? [];
  }, [transactions]);

  // Refund transactions in range — shown separately in P&L if any
  const refundTxs = useMemo(() => {
    return transactions?.filter(t => t.type === 'refund') ?? [];
  }, [transactions]);

  // Previous period for comparison
  const prevDateRange = useMemo(() => {
    const diff = dateRange.to.getTime() - dateRange.from.getTime();
    return { from: new Date(dateRange.from.getTime() - diff - 1), to: new Date(dateRange.from.getTime() - 1) };
  }, [dateRange.from, dateRange.to]);

  const prevTransactions = useLiveQuery(async () => {
    return db.transactions.where('date').between(prevDateRange.from, prevDateRange.to, true, true).toArray();
  }, [prevDateRange.from.getTime(), prevDateRange.to.getTime()]);

  // Query transaction items — only for completed sales (excludes open bills & refunds)
  const txItems = useLiveQuery(async () => {
    if (!transactions || transactions.length === 0) return [];
    const txIds = transactions
      .filter(t => t.status === 'completed' && t.type !== 'refund')
      .map(t => t.id!)
      .filter(Boolean);
    if (txIds.length === 0) return [];
    return db.transactionItems.where('transactionId').anyOf(txIds).toArray();
  }, [transactions]);

  const categories = useLiveQuery(() => db.categories.where('isDeleted').equals(0).toArray());
  const allProducts = useLiveQuery(() => db.products.toArray());
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  const allItems = txItems ?? [];

  // Financial metrics — only from completed sales (no open bills, no refunds)
  const totalSales = completedSales.reduce((s, t) => s + t.total, 0);
  const totalProfit = completedSales.reduce((s, t) => s + t.profit, 0);
  const txCount = completedSales.length;
  const totalItems = allItems.reduce((s, i) => s + i.quantity, 0);
  const aov = txCount > 0 ? Math.round(totalSales / txCount) : 0;

  // Comparison vs previous period — also only completed sales
  const prevSales = prevTransactions?.filter(t => t.status === 'completed' && t.type !== 'refund').reduce((s, t) => s + t.total, 0) ?? 0;
  const salesChange = prevSales > 0 ? ((totalSales - prevSales) / prevSales * 100) : null;

  // P&L breakdown — from completed sales only
  const totalRevenue = completedSales.reduce((s, t) => s + t.subtotal, 0);
  const totalDiscount = completedSales.reduce((s, t) => s + t.discountAmount, 0);
  const totalHpp = allItems.reduce((s, item) => s + item.hpp * item.quantity, 0);
  // Refund amounts that reduce net revenue
  const totalRefunded = refundTxs.reduce((s, t) => s + Math.abs(t.total), 0);
  const netSales = totalRevenue - totalDiscount;
  const grossProfit = netSales - totalHpp;
  const marginPercent = netSales > 0 ? (grossProfit / netSales * 100) : 0;

  // Chart: per-hour if today/yesterday, per-day otherwise — completed sales only
  const isHourly = filterPreset === 'today' || filterPreset === 'yesterday';
  const chartData = (() => {
    if (isHourly) {
      const map: Record<string, number> = {};
      for (let h = 0; h < 24; h++) map[`${String(h).padStart(2,'0')}:00`] = 0;
      completedSales.forEach(t => {
        const h = `${String(new Date(t.date).getHours()).padStart(2,'0')}:00`;
        if (map[h] !== undefined) map[h] += t.total;
      });
      return Object.entries(map).map(([date, sales]) => ({ date, sales }));
    }
    const map: Record<string, number> = {};
    const diffDays = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / 86400000);
    for (let i = diffDays; i >= 0; i--) {
      const d = format(subDays(dateRange.to, i), 'dd/MM');
      map[d] = 0;
    }
    completedSales.forEach(t => {
      const d = format(new Date(t.date), 'dd/MM');
      if (map[d] !== undefined) map[d] += t.total;
    });
    return Object.entries(map).map(([date, sales]) => ({ date, sales }));
  })();

  // Payment method breakdown — completed sales only (no open bills, no refunds)
  const paymentBreakdown = useMemo(() => {
    if (!transactions || !paymentMethods) return [];
    const map: Record<number, { name: string; total: number; count: number; color: string }> = {};
    const colors = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--accent))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];
    completedSales.forEach(t => {
      const pm = paymentMethods.find(p => p.id === t.paymentMethodId);
      const pmId = t.paymentMethodId ?? 0;
      if (!map[pmId]) map[pmId] = { name: pm?.name ?? 'Tunai', total: 0, count: 0, color: colors[Object.keys(map).length % colors.length] };
      map[pmId].total += t.total;
      map[pmId].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [completedSales, paymentMethods, transactions]);

  // Top products
  const productSales: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  allItems.forEach(item => {
    if (!productSales[item.productName]) productSales[item.productName] = { name: item.productName, qty: 0, revenue: 0, profit: 0 };
    productSales[item.productName].qty += item.quantity;
    productSales[item.productName].revenue += item.subtotal;
    productSales[item.productName].profit += (item.price - item.hpp) * item.quantity - item.discountAmount;
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Category + product breakdown
  const categorySales = (() => {
    if (!categories || !allProducts) return [];
    const prodCatMap: Record<number, number> = {};
    allProducts.forEach(p => { prodCatMap[p.id!] = p.categoryId; });
    const catData: Record<number, { name: string; icon: string; totalQty: number; totalRevenue: number; products: Record<string, { name: string; qty: number; revenue: number }> }> = {};
    allItems.forEach(item => {
      const catId = prodCatMap[item.productId] ?? 0;
      const cat = categories.find(c => c.id === catId);
      if (!catData[catId]) {
        catData[catId] = { name: cat?.name ?? 'Lainnya', icon: cat?.icon ?? '📦', totalQty: 0, totalRevenue: 0, products: {} };
      }
      const prodKey = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
      if (!catData[catId].products[prodKey]) catData[catId].products[prodKey] = { name: prodKey, qty: 0, revenue: 0 };
      catData[catId].totalQty += item.quantity;
      catData[catId].totalRevenue += item.subtotal;
      catData[catId].products[prodKey].qty += item.quantity;
      catData[catId].products[prodKey].revenue += item.subtotal;
    });
    return Object.values(catData).sort((a, b) => b.totalRevenue - a.totalRevenue);
  })();

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const { exportReportPDF } = await import('@/lib/export-pdf');
      exportReportPDF({
        storeName: storeSettings?.storeName ?? 'Lini POS',
        storeAddress: storeSettings?.address,
        dateRange,
        txCount,
        totalSales,
        totalProfit,
        totalItems,
        aov,
        totalRevenue,
        totalDiscount,
        netSales,
        totalHpp,
        grossProfit,
        marginPercent,
        paymentBreakdown,
        topProducts,
        categorySales,
      });
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Analitik Penjualan
        </h1>
        <p className="text-xs text-muted-foreground mt-1 leading-normal">
          Pantau performa penjualan, laba rugi, dan produk terpopuler
        </p>
      </div>

      {!isOwner ? (
        <div className="text-center py-20 bg-card border border-border/30 rounded-2xl shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Akses Dibatasi</p>
          <p className="text-xs text-muted-foreground mt-1">Hanya Owner yang bisa melihat laporan</p>
        </div>
      ) : (
      <>
        {/* Smart Filter + Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-2xl border border-border/40 bg-card hover:bg-muted/30 shadow-sm hover:border-primary/20 active:scale-[0.99] transition-all duration-300"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">{dateRange.label}</span>
              <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline-block bg-muted px-2.5 py-0.5 rounded-full">
                {format(dateRange.from, 'dd MMM', { locale: localeId })} - {format(dateRange.to, 'dd MMM yyyy', { locale: localeId })}
              </span>
            </div>
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground/80" />
          </button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-4 shrink-0 gap-1.5 text-xs font-bold rounded-2xl border-border/60 hover:bg-muted/50 active:scale-95 transition-all shadow-sm"
            onClick={handleExport}
            disabled={exportLoading || txCount === 0}
          >
            {exportLoading
              ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
              : <FileDown className="w-4 h-4 text-primary" />}
            PDF
          </Button>
        </div>

        {/* Filter Modal */}
        {filterOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm transition-opacity" onClick={() => setFilterOpen(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-card rounded-3xl border border-border/30 shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h3 className="text-base font-black text-foreground">Filter Laporan</h3>
                </div>
                <button 
                  onClick={() => setFilterOpen(false)} 
                  className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted active:scale-90 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Periode Waktu</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['today', 'Hari Ini'], ['yesterday', 'Kemarin'],
                    ['thisWeek', 'Minggu Ini'], ['lastWeek', 'Minggu Lalu'],
                    ['thisMonth', 'Bulan Ini'], ['lastMonth', 'Bulan Lalu'],
                    ['thisYear', 'Tahun Ini'], ['custom', 'Pilih Tanggal'],
                  ] as [FilterPreset, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { if (key !== 'custom') { setFilterPreset(key); } else { setFilterPreset('custom'); } }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all duration-200 active:scale-95 ${
                        filterPreset === key 
                          ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                          : 'border-border/60 bg-card text-muted-foreground hover:border-primary/45 hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filterPreset === 'custom' && (
                  <div className="space-y-4 pt-4 mt-2 border-t border-border/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pilih Rentang Tanggal</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tanggal Mulai</label>
                        <input 
                          type="date" 
                          value={customFrom} 
                          onChange={e => setCustomFrom(e.target.value)} 
                          className="w-full h-11 rounded-xl border border-border/50 bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tanggal Akhir</label>
                        <input 
                          type="date" 
                          value={customTo} 
                          onChange={e => setCustomTo(e.target.value)} 
                          className="w-full h-11 rounded-xl border border-border/50 bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" 
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-border/40 flex gap-3 bg-muted/15 mt-auto">
                <Button 
                  variant="secondary" 
                  className="flex-1 bg-muted/60 hover:bg-muted text-xs font-bold h-11 rounded-xl active:scale-95 transition-all" 
                  onClick={() => { setCustomFrom(''); setCustomTo(''); setFilterPreset('today'); setFilterOpen(false); }}
                >
                  Reset
                </Button>
                <Button 
                  className="flex-1 h-11 text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all" 
                  onClick={() => setFilterOpen(false)} 
                  disabled={filterPreset === 'custom' && (!customFrom || !customTo)}
                >
                  Terapkan
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT COLUMN: Main Stats, Profit & Loss, Chart */}
          <div className="lg:col-span-2 space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Penjualan + comparison */}
              <Card className="col-span-2 md:col-span-2 border-0 shadow-md bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground hover:shadow-lg hover:-translate-y-1 transition-all duration-300 rounded-2xl">
                <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold opacity-85">Total Penjualan</p>
                    <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                      <DollarSign className="w-4.5 h-4.5 text-white" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xl md:text-2xl font-black tracking-tight">{rp(totalSales)}</p>
                      <p className="text-[10px] font-semibold opacity-75 mt-1">✓ {txCount} transaksi</p>
                    </div>
                    {salesChange !== null && (
                      <div className="flex flex-col items-end shrink-0">
                        <div className={cn(
                          "flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border",
                          salesChange >= 0 
                            ? "bg-white/25 border-white/20 text-white" 
                            : "bg-black/20 border-white/10 text-white"
                        )}>
                          {salesChange >= 0
                            ? <ArrowUp className="w-3 h-3 text-white" />
                            : <ArrowDown className="w-3 h-3 text-white" />}
                          {Math.abs(salesChange).toFixed(1)}%
                        </div>
                        <p className="text-[9px] opacity-60 mt-0.5">vs periode lalu</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rata-rata/Transaksi */}
              <Card className="border border-border/30 shadow-sm bg-card hover:shadow-md hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 rounded-2xl">
                <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">Rata-rata/Trx</p>
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                      <Receipt className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-lg md:text-xl font-black text-foreground tracking-tight">{rp(aov)}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Rata-rata belanja</p>
                  </div>
                </CardContent>
              </Card>

              {/* Total Item Terjual */}
              <Card className="border border-border/30 shadow-sm bg-card hover:shadow-md hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 rounded-2xl">
                <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">Total Item</p>
                    <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shadow-sm">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-lg md:text-xl font-black text-foreground tracking-tight">{totalItems} item</p>
                    <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Produk terjual</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Profit & Loss */}
            <Card className="border border-border/30 shadow-sm bg-card rounded-2xl hover:shadow-md transition-all duration-300 overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Laba Rugi Keuangan
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3 bg-muted/5">
                <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span>Pendapatan Kotor</span>
                  </div>
                  <span className="font-bold text-foreground">{rp(totalRevenue)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between items-center text-xs font-semibold text-destructive">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-destructive" />
                      <span>Diskon Diberikan</span>
                    </div>
                    <span className="font-bold">-{rp(totalDiscount)}</span>
                  </div>
                )}
                {totalRefunded > 0 && (
                  <div className="flex justify-between items-center text-xs font-semibold text-amber-600 dark:text-amber-500">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Retur / Refund</span>
                    </div>
                    <span className="font-bold">-{rp(totalRefunded)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs font-bold border-t border-dashed border-border/40 pt-2.5">
                  <span>Penjualan Bersih (Omzet)</span>
                  <span className="text-foreground">{rp(netSales)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>HPP (Modal Pokok)</span>
                  </div>
                  <span className="font-bold text-foreground">-{rp(totalHpp)}</span>
                </div>
                
                <div className="flex justify-between items-center text-base border-t border-border/40 pt-3.5 mt-1">
                  <span className="font-black text-foreground">Laba Kotor</span>
                  <div className={cn(
                    "px-3 py-1 rounded-xl text-sm font-black border",
                    grossProfit >= 0
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-destructive/10 text-destructive border-destructive/20"
                  )}>
                    {rp(grossProfit)}
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-[10px] text-muted-foreground border-t border-dashed border-border/30 pt-2 font-medium">
                  <span>Persentase Margin Keuntungan</span>
                  <span className="font-bold text-foreground">{marginPercent.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card className="border border-border/30 shadow-sm bg-card rounded-2xl hover:shadow-md transition-all duration-300 overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  {isHourly ? '⏰ Tren Penjualan per Jam' : '📅 Tren Penjualan Harian'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 bg-muted/5">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: isHourly ? 8 : 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 'bold' }}
                        axisLine={false}
                        tickLine={false}
                        interval={isHourly ? 3 : 0}
                      />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v: number) => [`Rp ${v.toLocaleString('id-ID')}`, 'Penjualan']}
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border)/60)',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                          backdropFilter: 'blur(8px)'
                        }}
                        cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        fill="url(#salesTrendGrad)"
                        dot={false}
                        activeDot={{ r: 4.5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2.5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Payment breakdown, Top products, Categories */}
          <div className="space-y-5">
            {/* Payment Method Breakdown */}
            {paymentBreakdown.length > 0 && (
              <Card className="border border-border/30 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Metode Pembayaran
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Donut Chart + Legend */}
                  <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-xl border border-border/40">
                    {/* Fixed size donut */}
                    <div className="shrink-0 w-16 h-16">
                      <PieChart width={64} height={64}>
                        <Pie data={paymentBreakdown} dataKey="total" cx={32} cy={32} innerRadius={16} outerRadius={30} strokeWidth={0}>
                          {paymentBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </div>
                    {/* Total summary */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Penerimaan</p>
                      <p className="text-lg font-black text-foreground mt-0.5 truncate">{rp(totalSales)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">✓ {paymentBreakdown.length} metode digunakan</p>
                    </div>
                  </div>

                  {/* Progress bars per metode */}
                  <div className="space-y-3">
                    {paymentBreakdown.map((pm) => {
                      const pct = totalSales > 0 ? (pm.total / totalSales * 100) : 0;
                      const pmIcon = pm.name.toLowerCase().includes('qris') ? '📱'
                        : pm.name.toLowerCase().includes('transfer') ? '🏦'
                        : pm.name.toLowerCase().includes('tunai') || pm.name.toLowerCase().includes('cash') ? '💵'
                        : '💳';
                      return (
                        <div key={pm.name} className="space-y-2 p-2.5 rounded-xl border border-border/30 hover:border-primary/10 transition-colors bg-card">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-sm shadow-inner">{pmIcon}</span>
                              <div>
                                <span className="text-xs font-bold text-foreground block leading-tight">{pm.name}</span>
                                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-medium">{pm.count} trx</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-foreground block">{rp(pm.total)}</span>
                              <span className="text-[10px] font-bold text-primary mt-0.5 inline-block">{pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: pm.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Products */}
            <Card className="border border-border/30 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-primary" />
                  Produk Terlaris
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {topProducts.length === 0 ? (
                  <div className="text-center py-6">
                    <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-muted-foreground">Belum ada data penjualan</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {topProducts.map((p, i) => {
                      const badgeColor = i === 0 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        : i === 1 ? 'bg-slate-400/15 text-slate-600 border-slate-400/25'
                        : i === 2 ? 'bg-amber-700/10 text-amber-700 border-amber-700/20'
                        : 'bg-muted text-muted-foreground border-border/40';
                      return (
                        <div key={p.name} className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 hover:border-primary/10 bg-card/50 hover:bg-card transition-all duration-200">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={cn(
                              "w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center border shadow-inner shrink-0",
                              badgeColor
                            )}>
                              {i + 1}
                            </span>
                            <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-foreground">{rp(p.revenue)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              <span className="font-semibold text-primary">{p.qty} terjual</span> · laba <span className="font-semibold text-success">{rp(p.profit)}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sales by Category & Product */}
            <Card className="border border-border/30 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" />
                  Kategori & Produk
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {categorySales.length === 0 ? (
                  <div className="text-center py-6">
                    <Layers className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-muted-foreground">Belum ada data penjualan</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {categorySales.map(cat => {
                      const prods = Object.values(cat.products).sort((a, b) => b.qty - a.qty);
                      return (
                        <div key={cat.name} className="border border-border/40 rounded-2xl overflow-hidden bg-card/30">
                          {/* Category header */}
                          <div className="flex items-center justify-between bg-muted/40 px-3.5 py-2.5 border-b border-border/40">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-lg bg-card border border-border/40 flex items-center justify-center text-sm shadow-sm">{cat.icon}</span>
                              <div>
                                <span className="text-xs font-bold text-foreground block leading-tight">{cat.name}</span>
                                <span className="text-[9px] text-muted-foreground mt-0.5 block font-medium">{rp(cat.totalRevenue)}</span>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-[9px] font-black h-5 px-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-sm">
                              {cat.totalQty} item
                            </Badge>
                          </div>
                          {/* Products list */}
                          <div className="divide-y divide-border/30">
                            {prods.map(p => (
                              <div key={p.name} className="flex items-center justify-between px-3.5 py-2 hover:bg-muted/10 transition-colors">
                                <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[50%]">{p.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-primary">{p.qty} item</span>
                                  <span className="text-[10px] font-black text-foreground w-20 text-right">{rp(p.revenue)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </>
      )}
    </div>
  );
}
