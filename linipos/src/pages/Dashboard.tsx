import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TransactionItemRecord } from '@/lib/db';
import { useState, useMemo } from 'react';
import {
  ShoppingCart, Package, BarChart3, TrendingUp, TrendingDown,
  AlertTriangle, Receipt, ChevronRight, ClipboardList, Clock,
  History, ArrowUpRight, Wallet, Hash, RefreshCw, LayoutDashboard, Calendar
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { format, isToday, subDays, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import BackupReminder, { shouldShowBackupReminder, exportBackupData } from '@/components/BackupReminder';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { syncFromServer, hasJwt } from '@/lib/api-client';
import { toast } from 'sonner';

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function Dashboard() {
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { currentUser, isOwner } = useAuth();

  const handleSync = async () => {
    if (!hasJwt()) { toast.error('Belum login ke akun cloud'); return; }
    setSyncing(true);
    try {
      await syncFromServer();
      toast.success('Data berhasil disinkronisasi!');
    } catch {
      toast.error('Gagal sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTransactions = useLiveQuery(async () => {
    const all = await db.transactions.where('date').aboveOrEqual(today).toArray();
    return all.filter(t => t.status !== 'open' && t.type !== 'refund');
  }, []);

  const openBillsCount = useLiveQuery(async () => {
    const open = await db.transactions.where('status').equals('open').toArray();
    return open.length;
  }, []);

  const totalProducts = useLiveQuery(() => db.products.filter(p => p.isDeleted === 0).count());
  const lowStockProducts = useLiveQuery(() => db.products.filter(p => p.isDeleted === 0 && p.stock <= 5).toArray());
  const activeShift = useLiveQuery(() => db.shifts.where('status').equals('open').first());

  // 7-day chart data
  const sevenDaysAgo = useMemo(() => startOfDay(subDays(new Date(), 6)), []);
  const weekTransactions = useLiveQuery(async () => {
    const all = await db.transactions.where('date').aboveOrEqual(sevenDaysAgo).toArray();
    return all.filter(t => t.status !== 'open' && t.type !== 'refund');
  }, []);

  const chartData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      const start = startOfDay(d).getTime();
      const end = endOfDay(d).getTime();
      const total = weekTransactions?.filter(t => t.date.getTime() >= start && t.date.getTime() <= end)
        .reduce((s, t) => s + t.total, 0) ?? 0;
      return { day: format(d, 'EEE', { locale: id }), total, isToday: i === 6 };
    });
  }, [weekTransactions]);

  const recentTransactions = useLiveQuery(() =>
    db.transactions.orderBy('date').reverse().filter(t => t.type !== 'refund').limit(8).toArray()
  );

  const recentTxItems = useLiveQuery(async () => {
    if (!recentTransactions || recentTransactions.length === 0) return {};
    const txIds = recentTransactions.map(t => t.id!).filter(Boolean);
    const items = await db.transactionItems.where('transactionId').anyOf(txIds).toArray();
    const map: Record<number, TransactionItemRecord[]> = {};
    for (const item of items) {
      if (!map[item.transactionId]) map[item.transactionId] = [];
      map[item.transactionId].push(item);
    }
    return map;
  }, [recentTransactions]);

  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  if (storeSettings === undefined) return null;

  const totalSales = todayTransactions?.reduce((sum, t) => sum + t.total, 0) ?? 0;
  const totalProfit = todayTransactions?.reduce((sum, t) => sum + t.profit, 0) ?? 0;
  const txCount = todayTransactions?.length ?? 0;
  const avgTx = txCount > 0 ? Math.round(totalSales / txCount) : 0;
  const showBackup = !backupDismissed && storeSettings && shouldShowBackupReminder(storeSettings.lastBackupAt);

  const quickActions = isOwner
    ? [
        { to: '/cashier', icon: ShoppingCart, label: 'Kasir', sub: 'Buka transaksi', color: 'bg-primary text-primary-foreground' },
        { to: '/products', icon: Package, label: 'Produk', sub: `${totalProducts ?? 0} item`, color: 'bg-accent/15 text-accent' },
        { to: '/reports', icon: BarChart3, label: 'Laporan', sub: 'Keuangan', color: 'bg-success/15 text-success' },
        { to: '/history', icon: History, label: 'Riwayat', sub: 'Transaksi', color: 'bg-muted text-muted-foreground' },
      ]
    : [
        { to: '/cashier', icon: ShoppingCart, label: 'Kasir', sub: 'Buka transaksi', color: 'bg-primary text-primary-foreground' },
        { to: '/products', icon: Package, label: 'Produk', sub: `${totalProducts ?? 0} item`, color: 'bg-accent/15 text-accent' },
        { to: '/history', icon: History, label: 'Riwayat', sub: 'Transaksi', color: 'bg-muted text-muted-foreground' },
      ];

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">

      {/* ── GREETING & ACTIONS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Selamat Datang, {currentUser?.name || 'User'}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 leading-normal">
              {storeSettings?.storeName || 'Lini POS'}
            </p>
          </div>
          {hasJwt() && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 shadow-sm rounded-xl border-border/60 hover:bg-muted/50 active:scale-95 transition-all shrink-0 flex items-center justify-center sm:hidden"
              onClick={handleSync}
              disabled={syncing}
              title={syncing ? 'Sinkronisasi...' : 'Sinkronisasi'}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Tanggal */}
          <div className="inline-flex items-center gap-1.5 bg-card text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-xl border border-border/40 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground/80" />
            <span>{format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</span>
          </div>

          {/* Tombol Sync (Desktop/Tablet) */}
          {hasJwt() && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex h-9 gap-1.5 text-xs shadow-sm rounded-xl border-border/60 hover:bg-muted/50 active:scale-95 transition-all"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Sync...' : 'Sync'}
            </Button>
          )}
        </div>
      </div>


      {/* ── BACKUP REMINDER ── */}
      {showBackup && (
        <BackupReminder
          lastBackupAt={storeSettings?.lastBackupAt ?? null}
          onDismiss={() => setBackupDismissed(true)}
          onBackup={exportBackupData}
        />
      )}

      {/* ── MAIN GRID: left stats / right activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── STATS CARDS ── */}
          {/* ── STATS CARDS ── */}
          {/* Mobile: Balanced 2x2 grid (Owner) or 1x2 grid (Cashier). Desktop: 4 equal cols */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Total Penjualan */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground hover:shadow-lg hover:-translate-y-1 transition-all duration-300 rounded-2xl">
              <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full min-h-[110px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold opacity-85">Penjualan Hari Ini</p>
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                    <Wallet className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-base md:text-[17px] lg:text-lg font-bold tracking-tight">{formatRp(totalSales)}</p>
                  <p className="text-[10px] font-semibold opacity-75 mt-1">✓ {txCount} transaksi</p>
                </div>
              </CardContent>
            </Card>

            {/* Profit — owner only */}
            {isOwner && (
              <Card className="border border-border/30 shadow-sm bg-card hover:shadow-md hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 rounded-2xl">
                <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">Profit</p>
                    <div className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center">
                      <TrendingUp className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  <div>
                    <p className="text-base md:text-[17px] lg:text-lg font-semibold text-foreground tracking-tight">{formatRp(totalProfit)}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Hari ini</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rata-rata transaksi — owner only */}
            {isOwner && (
              <Card className="border border-border/30 shadow-sm bg-card hover:shadow-md hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 rounded-2xl">
                <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">Rata-rata</p>
                    <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                      <Hash className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  <div>
                    <p className="text-base md:text-[17px] lg:text-lg font-semibold text-foreground tracking-tight">{formatRp(avgTx)}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">per transaksi</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Produk */}
            <Card className="border border-border/30 shadow-sm bg-card hover:shadow-md hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 rounded-2xl">
              <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full min-h-[110px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Produk</p>
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <Package className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <p className="text-base md:text-[17px] lg:text-lg font-semibold text-foreground tracking-tight">{totalProducts ?? '—'}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">item aktif</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── 7-DAY SALES CHART ── */}
          <div>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Tren Penjualan 7 Hari
              </p>
              <Link to="/reports" className="text-xs text-primary font-bold hover:underline">
                Lihat Laporan →
              </Link>
            </div>
            <Card className="border border-border/30 shadow-sm bg-card rounded-2xl overflow-hidden">
              <CardContent className="p-4">
                {/* Peak value */}
                {chartData.some(d => d.total > 0) ? (
                  <>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <p className="text-[10px] font-bold text-muted-foreground/75">
                        Penjualan Tertinggi: <span className="text-foreground font-black">{formatRp(Math.max(...chartData.map(d => d.total)))}</span>
                      </p>
                    </div>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="day"
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <ReTooltip
                            formatter={(v: number) => [formatRp(v), 'Penjualan']}
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
                            dataKey="total"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            fill="url(#salesGrad)"
                            dot={false}
                            activeDot={{ r: 4.5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2.5 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="h-32 flex flex-col items-center justify-center gap-1.5">
                    <BarChart3 className="w-7 h-7 text-muted-foreground/30" />
                    <p className="text-xs font-semibold text-muted-foreground/60">Belum ada data penjualan minggu ini</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── STATUS SECTION: Shift + Open Bills ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-0.5">
              Status Shift
            </p>

            {activeShift ? (
              <Link to="/cashier">
                <div className="flex items-center gap-4 p-4 rounded-2xl border border-success/20 bg-success/5 hover:bg-success/10 active:scale-[0.99] transition-all duration-300 shadow-sm">
                  {/* Status indicator */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-success/15 text-success flex items-center justify-center shadow-inner">
                      <Clock className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background animate-ping" />
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-success flex items-center gap-1.5">
                      Shift Sedang Aktif
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      👤 {activeShift.userName} · sejak <span className="font-semibold text-foreground/80">{format(new Date(activeShift.openedAt), 'HH:mm')}</span> · Kas awal <span className="font-semibold text-foreground/80">{formatRp(activeShift.openingCash)}</span>
                    </p>
                  </div>
                  {/* Action */}
                  <ArrowUpRight className="w-4 h-4 text-success shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ) : (
              <Link to="/cashier">
                <div className="flex items-center gap-4 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 active:scale-[0.99] transition-all duration-300 group shadow-sm">
                  {/* Status dot */}
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0 transition-colors">
                    <Clock className="w-5 h-5" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-500">Shift Belum Aktif</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mulai shift sekarang untuk melayani & mencatat transaksi kasir
                    </p>
                  </div>
                  {/* CTA */}
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 group-hover:gap-1.5 transition-all">
                    Mulai Kasir <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Link>
            )}

            {/* Open Bills — inside same section with gap */}
            {openBillsCount != null && openBillsCount > 0 && (
              <Link to="/cashier">
                <div className="flex items-center gap-4 p-4 rounded-2xl border border-warning/20 bg-warning/5 hover:bg-warning/10 active:scale-[0.99] transition-all duration-300 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0 shadow-inner">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Open Bills Aktif</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{openBillsCount} tagihan pending menunggu pembayaran</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-70" />
                </div>
              </Link>
            )}
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div>
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-0.5">Akses Cepat</h2>
            <div className={cn('grid gap-3', isOwner ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
              {quickActions.map(({ to, icon: Icon, label, sub, color }) => (
                <Link key={to} to={to}>
                  <Card className="border border-border/30 shadow-sm hover:shadow-md hover:border-primary/20 active:scale-95 transition-all duration-300 hover:-translate-y-0.5 rounded-2xl bg-card overflow-hidden">
                    <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm', color)}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground leading-tight">{label}</p>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 font-medium">{sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* ── RECENT TRANSACTIONS ── */}
          <div>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-primary" />
                Transaksi Terakhir
              </h2>
              <Link to="/history">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-0.5 text-primary hover:text-primary font-bold">
                  Semua <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>

            {recentTransactions && recentTransactions.length > 0 ? (
              <div className="space-y-2">
                {recentTransactions.map(tx => {
                  const items = recentTxItems?.[tx.id!] ?? [];
                  const pmName = paymentMethods?.find(pm => pm.id === tx.paymentMethodId)?.name || 'Tunai';
                  const isOpenBill = tx.status === 'open';
                  return (
                    <Link key={tx.id ?? tx.receiptNumber} to={`/history?txId=${tx.id}`}>
                      <Card className="border border-border/30 bg-card hover:border-primary/20 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 rounded-xl overflow-hidden shadow-sm mb-1">
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner',
                            isOpenBill ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'
                          )}>
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate leading-snug">
                              {items.length > 0 ? items.map(i => i.productName).join(', ') : tx.receiptNumber}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs font-black text-primary">{formatRp(tx.total)}</p>
                              <span className="inline-block bg-muted/75 text-muted-foreground/80 font-bold px-1.5 py-0.5 rounded text-[8px]">
                                {pmName}
                              </span>
                            </div>
                          </div>
                          <p className="text-[9px] font-semibold text-muted-foreground/75 shrink-0 align-top">
                            {isToday(new Date(tx.date))
                              ? format(new Date(tx.date), 'HH:mm')
                              : format(new Date(tx.date), 'd MMM', { locale: id })}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Card className="border border-border/30 bg-card rounded-2xl shadow-sm">
                <CardContent className="p-6 text-center">
                  <Receipt className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-muted-foreground">Belum ada transaksi hari ini</p>
                  <Link to="/cashier">
                    <Button size="sm" className="mt-3.5 h-8 text-xs rounded-lg font-bold">Mulai Kasir</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── LOW STOCK ALERT ── */}
          {lowStockProducts && lowStockProducts.length > 0 && (
            <div>
              <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-3 px-0.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                Stok Menipis ({lowStockProducts.length})
              </h2>
              <div className="space-y-2">
                {lowStockProducts.slice(0, 5).map(product => (
                  <Link key={product.id} to="/products">
                    <Card className="border border-border/30 bg-card hover:border-warning/30 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 rounded-xl overflow-hidden shadow-sm mb-1">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {product.photo ? (
                            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-border/20 shadow-sm">
                              <img src={product.photo} alt={product.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                              product.stock === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                            )}>
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <p className="text-xs font-bold truncate text-foreground">{product.name}</p>
                        </div>
                        <span className={cn(
                          'text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 border',
                          product.stock === 0
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        )}>
                          {product.stock === 0 ? 'HABIS' : `SISA ${product.stock}`}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                {lowStockProducts.length > 5 && (
                  <Link to="/products">
                    <Button variant="ghost" size="sm" className="w-full h-8 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                      +{lowStockProducts.length - 5} produk lainnya <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ── PROFIT MARGIN summary (owner only) ── */}
          {isOwner && txCount > 0 && (
            <Card className="border border-border/30 bg-card rounded-2xl shadow-sm overflow-hidden">
              <CardContent className="p-4">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-0.5">Ringkasan Hari Ini</h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/80 font-medium">Omzet Kotor</span>
                    <span className="font-bold text-foreground">{formatRp(totalSales)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/80 font-medium">Profit Bersih</span>
                    <span className="font-bold text-success">{formatRp(totalProfit)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/80 font-medium flex items-center gap-1">
                      {totalProfit >= 0 ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                      Margin Keuntungan
                    </span>
                    <span className={cn('font-black', totalProfit >= 0 ? 'text-success' : 'text-destructive')}>
                      {totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <div className="h-px border-t border-dashed border-border/40 my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/80 font-medium">Jumlah Transaksi</span>
                    <span className="font-bold text-foreground">{txCount} kali</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/80 font-medium">Rata-rata Transaksi</span>
                    <span className="font-bold text-foreground">{formatRp(avgTx)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
