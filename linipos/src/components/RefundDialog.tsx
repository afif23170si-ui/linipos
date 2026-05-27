import { useState, useEffect } from 'react';
import { db, type Transaction, type TransactionItemRecord } from '@/lib/db';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Minus, Plus, AlertCircle, CheckCircle2, PackageOpen } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

interface RefundItem {
  item: TransactionItemRecord;
  refundQty: number;
  selected: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onRefundDone?: () => void;
}

export default function RefundDialog({ open, onClose, transaction, onRefundDone }: Props) {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<RefundItem[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Check if transaction already has a refund
  const [existingRefund, setExistingRefund] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!transaction?.id || !open) return;
    setDone(false);
    setReason('');

    // Load items
    db.transactionItems
      .where('transactionId')
      .equals(transaction.id)
      .toArray()
      .then(txItems => {
        setItems(txItems.map(item => ({
          item,
          refundQty: item.quantity, // default: refund all
          selected: true,
        })));
      });

    // Check for existing refund
    db.transactions
      .where('refundOf')
      .equals(transaction.id)
      .first()
      .then(ref => setExistingRefund(ref ?? null));
  }, [transaction?.id, open]);

  const selectedItems = items.filter(i => i.selected && i.refundQty > 0);
  const refundTotal = selectedItems.reduce((sum, i) => sum + i.item.price * i.refundQty, 0);
  const refundProfit = selectedItems.reduce((sum, i) => {
    const unitProfit = i.item.price - i.item.hpp;
    return sum + unitProfit * i.refundQty;
  }, 0);

  const toggleItem = (idx: number) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, selected: !it.selected } : it
    ));
  };

  const changeQty = (idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const max = it.item.quantity;
      const next = Math.max(1, Math.min(max, it.refundQty + delta));
      return { ...it, refundQty: next };
    }));
  };

  const handleRefund = async () => {
    if (!transaction?.id) return;
    if (selectedItems.length === 0) {
      toast.error('Pilih minimal 1 item untuk diretur');
      return;
    }
    if (!reason.trim()) {
      toast.error('Masukkan alasan retur');
      return;
    }

    setLoading(true);
    try {
      await db.transaction('rw', [db.transactions, db.transactionItems, db.products], async () => {
        // 1. Create refund transaction (negative total)
        const refundReceiptNum = `RET-${transaction.receiptNumber}`;
        const refundTxId = await db.transactions.add({
          subtotal: -refundTotal,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          total: -refundTotal,
          paymentMethodId: transaction.paymentMethodId,
          paymentAmount: -refundTotal,
          change: 0,
          profit: -refundProfit,
          date: new Date(),
          receiptNumber: refundReceiptNum,
          status: 'completed',
          type: 'refund',
          refundOf: transaction.id,
          refundReason: reason.trim(),
          userId: currentUser?.id,
          userName: currentUser?.name,
        });

        // 2. Create refund items (negative quantity)
        const refundItemRecords: Omit<TransactionItemRecord, 'id'>[] = selectedItems.map(ri => ({
          transactionId: refundTxId as number,
          productId: ri.item.productId,
          productName: ri.item.productName,
          quantity: -ri.refundQty,
          price: ri.item.price,
          hpp: ri.item.hpp,
          discountType: null,
          discountValue: 0,
          discountAmount: 0,
          subtotal: -(ri.item.price * ri.refundQty),
          notes: `RETUR: ${reason.trim()}`,
          variantOptionId: ri.item.variantOptionId,
          variantName: ri.item.variantName,
        }));
        await db.transactionItems.bulkAdd(refundItemRecords);

        // 3. Restore stock for each refunded item
        for (const ri of selectedItems) {
          const product = await db.products.get(ri.item.productId);
          if (product && !product.unlimitedStock) {
            await db.products.update(ri.item.productId, {
              stock: (product.stock ?? 0) + ri.refundQty,
            });
          }
        }
      });

      setDone(true);
      toast.success('Retur berhasil diproses!');
      onRefundDone?.();
    } catch (err) {
      console.error(err);
      toast.error('Gagal memproses retur. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!transaction) return null;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <SheetTitle className="text-base">Retur / Refund</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {transaction.receiptNumber} · {format(new Date(transaction.date), 'dd MMM yyyy HH:mm', { locale: localeId })}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* Already refunded warning */}
          {existingRefund && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Sudah Pernah Diretur</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Transaksi ini sudah diretur pada {format(new Date(existingRefund.date), 'dd MMM yyyy HH:mm', { locale: localeId })}.
                  Tetap bisa melanjutkan jika ingin retur parsial tambahan.
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {done ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-base font-bold">Retur Berhasil!</p>
              <p className="text-sm text-muted-foreground">
                Stok produk sudah dikembalikan dan catatan retur sudah tersimpan.
              </p>
              <p className="text-lg font-bold text-amber-600">{rp(refundTotal)}</p>
              <Button onClick={onClose} className="mt-2 w-full">Tutup</Button>
            </div>
          ) : (
            <>
              {/* Item selection */}
              <div>
                <p className="text-sm font-semibold mb-2">Pilih Item yang Diretur</p>
                <div className="space-y-2">
                  {items.map((ri, idx) => (
                    <div
                      key={ri.item.id}
                      onClick={() => toggleItem(idx)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                        ri.selected
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border bg-muted/30 opacity-60'
                      )}
                    >
                      {/* Checkbox-like indicator */}
                      <div className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        ri.selected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30'
                      )}>
                        {ri.selected && <CheckCircle2 className="w-3 h-3" />}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {ri.item.productName}
                          {ri.item.variantName && (
                            <span className="text-xs text-accent ml-1">({ri.item.variantName})</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{rp(ri.item.price)} × {ri.item.quantity}</p>
                      </div>

                      {/* Qty stepper */}
                      {ri.selected && (
                        <div
                          className="flex items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => changeQty(idx, -1)}
                            disabled={ri.refundQty <= 1}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">{ri.refundQty}</span>
                          <button
                            onClick={() => changeQty(idx, 1)}
                            disabled={ri.refundQty >= ri.item.quantity}
                            className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-sm font-semibold mb-2">Alasan Retur <span className="text-destructive">*</span></p>
                <Input
                  placeholder="Contoh: Salah pesanan, produk rusak, dll."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Summary */}
              {selectedItems.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <PackageOpen className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ringkasan Retur</p>
                  </div>
                  {selectedItems.map(ri => (
                    <div key={ri.item.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{ri.item.productName} ×{ri.refundQty}</span>
                      <span>{rp(ri.item.price * ri.refundQty)}</span>
                    </div>
                  ))}
                  <div className="border-t border-amber-200 dark:border-amber-800 pt-1 mt-1 flex justify-between text-sm font-bold text-amber-700 dark:text-amber-400">
                    <span>Total Refund</span>
                    <span>{rp(refundTotal)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Stok akan dikembalikan untuk {selectedItems.length} item
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {!done && (
          <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 space-y-2">
            <Button
              className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleRefund}
              disabled={loading || selectedItems.length === 0 || !reason.trim()}
            >
              {loading
                ? <span className="animate-spin">⟳</span>
                : <RotateCcw className="w-4 h-4" />}
              Proses Retur {selectedItems.length > 0 && `· ${rp(refundTotal)}`}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Batal
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
