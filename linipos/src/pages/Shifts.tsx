import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Shift } from '@/lib/db';
import { Clock, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert } from 'lucide-react';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function ShiftsPage() {
  const { isOwner } = useAuth();

  if (!isOwner) {
    return (
      <div className="px-4 pt-6 pb-20 text-center">
        <div className="py-20 bg-card border border-border/30 rounded-2xl shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-bold text-foreground">Akses Dibatasi</p>
          <p className="text-xs text-muted-foreground mt-1">Hanya Owner yang bisa melihat riwayat shift</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Riwayat Shift
        </h1>
        <p className="text-xs text-muted-foreground mt-1 leading-normal">
          Pantau durasi kerja kasir, rekapitulasi penjualan, dan rekonsiliasi kas laci
        </p>
      </div>
      <ShiftList />
    </div>
  );
}

function ShiftList() {
  const shifts = useLiveQuery(() => db.shifts.orderBy('openedAt').reverse().limit(50).toArray());
  const transactions = useLiveQuery(() => db.transactions.where('status').equals('completed').toArray());
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  const getShiftStats = (shift: Shift) => {
    const txs = transactions?.filter(t => t.shiftId === shift.id) ?? [];
    const totalSales = txs.reduce((s, t) => s + t.total, 0);
    const totalProfit = txs.reduce((s, t) => s + t.profit, 0);
    const cashSales = txs.reduce((s, t) => {
      const pm = paymentMethods?.find(p => p.id === t.paymentMethodId);
      return s + (pm?.category === 'tunai' ? t.total : 0);
    }, 0);
    return { txCount: txs.length, totalSales, totalProfit, cashSales };
  };

  if (!shifts || shifts.length === 0) {
    return (
      <div className="text-center py-20 bg-card border border-border/30 rounded-2xl shadow-sm">
        <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Belum ada riwayat shift</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shifts.map(shift => {
        const stats = getShiftStats(shift);
        const duration = shift.closedAt
          ? Math.round((new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()) / 60000)
          : null;
        return (
          <Card key={shift.id} className="border border-border/30 bg-card hover:border-primary/20 hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden shadow-sm">
            <CardContent className="p-4 space-y-3.5">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-[10px] font-black flex items-center justify-center border shadow-inner">
                    {shift.userName ? shift.userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block leading-tight">{shift.userName}</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 font-medium">
                      {format(new Date(shift.openedAt), 'dd MMMM yyyy', { locale: localeId })}
                    </span>
                  </div>
                </div>
                {shift.status === 'open' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-lg bg-success/10 text-success border border-success/20 animate-pulse">🟢 Shift Aktif</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border/40">Selesai</span>
                )}
              </div>

              {/* Time */}
              <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground py-1.5 bg-muted/20 px-3 rounded-xl border border-border/35">
                <div className="flex items-center gap-1">
                  <span>🕒 Buka:</span>
                  <span className="text-foreground font-bold">{format(new Date(shift.openedAt), 'HH:mm')}</span>
                </div>
                <span className="text-muted-foreground/30">|</span>
                <div className="flex items-center gap-1">
                  <span>Tutup:</span>
                  <span className="text-foreground font-bold">{shift.closedAt ? format(new Date(shift.closedAt), 'HH:mm') : '—'}</span>
                </div>
                {duration !== null && (
                  <>
                    <span className="text-muted-foreground/30">|</span>
                    <span className="text-[10px] text-primary font-bold">⏱️ {duration >= 60 ? `${Math.floor(duration/60)} jam ${duration%60}m` : `${duration} menit`}</span>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-primary/5 border border-primary/10 p-2.5 rounded-xl text-center">
                  <p className="text-sm font-black text-primary">{stats.txCount}</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">Transaksi</p>
                </div>
                <div className="bg-success/5 border border-success/10 p-2.5 rounded-xl text-center min-w-0">
                  <p className="text-xs font-black text-success truncate">{rp(stats.totalSales)}</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">Penjualan</p>
                </div>
                <div className="bg-accent/5 border border-accent/10 p-2.5 rounded-xl text-center min-w-0">
                  <p className="text-xs font-black text-accent truncate">{rp(stats.totalProfit)}</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">Profit</p>
                </div>
              </div>

              {/* Cash drawer */}
              <div className="flex justify-between items-center text-xs bg-muted/30 border border-border/40 px-3.5 py-2.5 rounded-xl mt-1">
                <span className="text-muted-foreground font-semibold">
                  Laci Kas: {rp(shift.openingCash)} + {rp(stats.cashSales)}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Total Kas:</span>
                  <span className="font-black text-foreground text-sm">{rp(shift.openingCash + stats.cashSales)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
