import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { Package, ArrowDownToLine, ArrowUpFromLine, TrendingUp, AlertTriangle, Warehouse, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';

export default function StockReport() {
  const [period, setPeriod] = useState<'7' | '30'>('7');
  const days = Number(period);
  const since = startOfDay(subDays(new Date(), days));

  const products = useLiveQuery(() => db.products.toArray());
  const stockIns = useLiveQuery(async () => db.stockIns.where('date').aboveOrEqual(since).toArray(), [days]);
  const stockOuts = useLiveQuery(async () => db.stockOuts.where('date').aboveOrEqual(since).toArray(), [days]);

  const totalStockIn = stockIns?.reduce((s, si) => s + si.quantity, 0) ?? 0;
  const totalStockInValue = stockIns?.reduce((s, si) => s + si.totalPrice, 0) ?? 0;
  const totalStockOut = stockOuts?.reduce((s, so) => s + so.quantity, 0) ?? 0;

  const stockOutByReason = stockOuts?.reduce((acc, so) => {
    acc[so.reason] = (acc[so.reason] || 0) + so.quantity;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const currentStock = products?.reduce((s, p) => s + p.stock, 0) ?? 0;
  const lowStockProducts = products?.filter(p => p.stock > 0 && p.stock <= 5) ?? [];
  const outOfStockProducts = products?.filter(p => p.stock === 0) ?? [];

  const getProductName = (pid: number) => products?.find(p => p.id === pid)?.name ?? '-';

  const chartData = (() => {
    const map: Record<string, { stockIn: number; stockOut: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'dd/MM');
      map[d] = { stockIn: 0, stockOut: 0 };
    }
    stockIns?.forEach(si => {
      const d = format(new Date(si.date), 'dd/MM');
      if (map[d]) map[d].stockIn += si.quantity;
    });
    stockOuts?.forEach(so => {
      const d = format(new Date(so.date), 'dd/MM');
      if (map[d]) map[d].stockOut += so.quantity;
    });
    return Object.entries(map).map(([date, data]) => ({ date, ...data }));
  })();

  const stockMovementData = (() => {
    const map: Record<string, number> = {};
    let cumulative = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'dd/MM');
      map[d] = 0;
    }
    stockIns?.forEach(si => {
      const d = format(new Date(si.date), 'dd/MM');
      if (map[d] !== undefined) map[d] += si.quantity;
    });
    stockOuts?.forEach(so => {
      const d = format(new Date(so.date), 'dd/MM');
      if (map[d] !== undefined) map[d] -= so.quantity;
    });
    return Object.entries(map).map(([date, movement]) => {
      cumulative += movement;
      return { date, stock: cumulative };
    });
  })();

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  const reasonLabels: Record<string, string> = {
    rusak: 'Rusak',
    hilang: 'Hilang',
    retur: 'Retur',
    expired: 'Expired',
    sample: 'Sample',
    lain: 'Lainnya',
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Laporan Stok
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">Analisis arus pergerakan barang masuk dan keluar toko Anda</p>
        </div>
        
        <Tabs value={period} onValueChange={v => setPeriod(v as '7' | '30')} className="w-full sm:w-auto self-start sm:self-auto shrink-0">
          <TabsList className="rounded-2xl bg-muted/30 border border-border/40 p-1 h-10 w-full sm:w-[200px]">
            <TabsTrigger value="7" className="flex-1 rounded-xl text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all h-8">
              7 Hari
            </TabsTrigger>
            <TabsTrigger value="30" className="flex-1 rounded-xl text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all h-8">
              30 Hari
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border border-border/30 bg-card rounded-2xl shadow-sm">
          <CardContent className="p-4 text-center flex flex-col items-center justify-center space-y-1.5">
            <div className="p-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <ArrowDownToLine className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-foreground/95">{totalStockIn}</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Masuk</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/30 bg-card rounded-2xl shadow-sm">
          <CardContent className="p-4 text-center flex flex-col items-center justify-center space-y-1.5">
            <div className="p-1.5 bg-destructive/10 text-destructive rounded-lg">
              <ArrowUpFromLine className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-foreground/95">{totalStockOut}</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Keluar</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/30 bg-card rounded-2xl shadow-sm">
          <CardContent className="p-4 text-center flex flex-col items-center justify-center space-y-1.5">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-foreground/95">{currentStock}</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tersedia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock In Value */}
      <Card className="border border-border/30 bg-card rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/20 bg-muted/10">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Nilai Stok Masuk</h3>
          </div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between items-center bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-xl">
            <span className="text-xs font-medium text-muted-foreground">Total Pembelian Periode Ini</span>
            <span className="text-base font-extrabold text-emerald-600">{rp(totalStockInValue)}</span>
          </div>
          
          <div className="border-t border-dashed border-border/40 my-3"></div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Volume Pembelian</span>
            <span className="font-semibold text-foreground/80">{totalStockIn} unit</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Rata-rata Harga Beli</span>
            <span className="font-semibold text-foreground/80">
              {totalStockIn > 0 ? rp(totalStockInValue / totalStockIn) : rp(0)} / unit
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Stock Movement Chart */}
      <Card className="border border-border/30 bg-card rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/20 bg-muted/10">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded bg-primary/10 text-primary">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Pergerakan Stok Harian</h3>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="h-[200px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 5, left: 5, bottom: 0 }}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="backdrop-blur-md bg-background/95 border border-border/60 p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                          <p className="font-semibold text-foreground/80 mb-1">{label}</p>
                          {payload.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 justify-between">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                {item.name}:
                              </span>
                              <span className="font-bold text-foreground">
                                {item.value} unit
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="stockIn" fill="rgb(16, 185, 129)" radius={[3, 3, 0, 0]} name="Masuk" maxBarSize={24} />
                <Bar dataKey="stockOut" fill="rgb(239, 68, 68)" radius={[3, 3, 0, 0]} name="Keluar" maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border/20 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-md bg-emerald-500" />
              <span>Stok Masuk</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-md bg-red-500" />
              <span>Stok Keluar</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Out by Reason */}
      {Object.keys(stockOutByReason).length > 0 && (
        <Card className="border border-border/30 bg-card rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/20 bg-muted/10">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded bg-destructive/10 text-destructive">
                <ArrowUpFromLine className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Alasan Stok Keluar</h3>
            </div>
          </div>
          <CardContent className="p-4 space-y-2.5">
            {Object.entries(stockOutByReason).map(([reason, qty]) => (
              <div key={reason} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/10">
                <span className="text-xs font-medium text-foreground/80">{reasonLabels[reason] || reason}</span>
                <span className="text-xs font-bold text-destructive bg-destructive/10 px-2.5 py-0.5 rounded-lg border border-destructive/20">
                  {qty} unit
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Card className="border border-amber-500/20 bg-amber-500/5 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-amber-500/10 bg-amber-500/10 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800">Stok Menipis ({lowStockProducts.length})</h3>
          </div>
          <CardContent className="p-4 space-y-2">
            {lowStockProducts.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-background/50 border border-amber-500/10">
                <span className="text-xs font-medium text-foreground/80 truncate flex-1 mr-2">{p.name}</span>
                <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md">
                  {p.stock} {p.unit}
                </span>
              </div>
            ))}
            {lowStockProducts.length > 5 && (
              <p className="text-[11px] text-amber-700/85 text-center font-medium pt-1">
                +{lowStockProducts.length - 5} produk menipis lainnya
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Out of Stock */}
      {outOfStockProducts.length > 0 && (
        <Card className="border border-red-500/20 bg-red-500/5 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-red-500/10 bg-red-500/10 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-red-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-800">Stok Habis ({outOfStockProducts.length})</h3>
          </div>
          <CardContent className="p-4 space-y-2">
            {outOfStockProducts.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-background/50 border border-red-500/10">
                <span className="text-xs font-medium text-foreground/80 truncate flex-1 mr-2">{p.name}</span>
                <span className="text-xs font-extrabold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-md">
                  Habis
                </span>
              </div>
            ))}
            {outOfStockProducts.length > 5 && (
              <p className="text-[11px] text-red-700/85 text-center font-medium pt-1">
                +{outOfStockProducts.length - 5} produk habis lainnya
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
