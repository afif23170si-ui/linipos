import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { ArrowUpFromLine, Plus, ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Link } from 'react-router-dom';

const REASONS = ['Rusak', 'Hilang', 'Kadaluarsa', 'Retur ke Supplier', 'Pemakaian Sendiri', 'Lainnya'];

export default function StockOutPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const stockOuts = useLiveQuery(() => db.stockOuts.orderBy('date').reverse().toArray());
  const products = useLiveQuery(() => db.products.where('isDeleted').equals(0).toArray());

  const getProductName = (pid: number) => products?.find(p => p.id === pid)?.name ?? '-';
  const selectedProduct = products?.find(p => p.id === Number(productId));

  const openAdd = () => {
    setProductId(''); setQuantity(''); setReason(''); setNotes('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const qty = Number(quantity);
    if (!productId || qty <= 0 || !reason) {
      toast.error('Lengkapi semua field');
      return;
    }

    const product = products?.find(p => p.id === Number(productId));
    if (!product) return;
    if (qty > product.stock) {
      toast.error('Jumlah melebihi stok yang tersedia');
      return;
    }

    await db.stockOuts.add({
      productId: Number(productId),
      quantity: qty,
      reason,
      date: new Date(),
      notes: notes.trim(),
    });

    await db.products.update(product.id!, {
      stock: product.stock - qty,
      updatedAt: new Date(),
    });

    toast.success(`Stok ${product.name} berkurang ${qty}`);
    setDialogOpen(false);
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Stok Keluar
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">Catat pengurangan persediaan di luar transaksi penjualan</p>
        </div>
        <Button size="sm" onClick={openAdd} className="h-9 rounded-xl gap-1.5 font-medium shadow-sm hover:shadow-md transition-all shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1 bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/20">
          <span className="font-semibold text-foreground/80">{stockOuts?.length ?? 0}</span> Catatan Pengurangan
        </div>
      </div>

      {(!stockOuts || stockOuts.length === 0) ? (
        <div className="text-center py-16 border border-dashed border-border/40 rounded-2xl bg-muted/10">
          <div className="p-3 bg-muted/60 rounded-full w-fit mx-auto mb-3">
            <ArrowUpFromLine className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground/80">Belum ada data stok keluar</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">Catat pengurangan stok karena barang rusak, kadaluarsa, hilang, atau alasan lainnya</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Stok Keluar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stockOuts.map(so => (
            <Card key={so.id} className="border border-border/30 bg-card hover:border-primary/20 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground/95 truncate">
                      {getProductName(so.productId)}
                    </h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center text-xs font-semibold bg-destructive/10 border border-destructive/20 text-destructive px-2 py-0.5 rounded-lg">
                      -{so.quantity} unit
                    </span>
                    <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                      {so.reason}
                    </span>
                  </div>

                  {so.notes && (
                    <div className="p-2 rounded-lg bg-muted/40 border border-border/10 text-[11px] text-muted-foreground italic leading-relaxed">
                      {so.notes}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0 flex flex-col justify-between h-full min-h-[60px]">
                  <p className="text-[10px] text-muted-foreground bg-muted/60 border border-border/20 px-2 py-1.5 rounded-md self-end">
                    {format(new Date(so.date), 'dd MMM yyyy, HH:mm', { locale: id })}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
              <ArrowUpFromLine className="w-5 h-5 text-primary" />
              Tambah Stock Out
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Produk *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-11 rounded-xl text-sm"><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent className="rounded-xl">{products?.filter(p => p.stock > 0).map(p => <SelectItem key={p.id} value={p.id!.toString()}>{p.name} (stok: {p.stock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Jumlah *</Label>
                <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Contoh: 1" className="h-11 rounded-xl text-sm" max={selectedProduct?.stock} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Alasan *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="h-11 rounded-xl text-sm"><SelectValue placeholder="Pilih alasan" /></SelectTrigger>
                  <SelectContent className="rounded-xl">{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {selectedProduct && quantity && (
              <div className="bg-muted/50 p-3.5 rounded-2xl text-xs flex justify-between items-center border border-border/40">
                <span className="text-muted-foreground font-medium">Sisa Stok Setelahnya:</span>
                <span className="font-extrabold text-primary text-sm">
                  {selectedProduct.stock - Number(quantity)} {selectedProduct.unit}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catatan</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan opsional (misal: Barang rusak/robek)" className="h-11 rounded-xl text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={handleSave}>
                Simpan Stock Out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
