import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { ArrowDownToLine, Plus, Search, ChevronLeft } from 'lucide-react';
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

export default function StockInPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');

  const stockIns = useLiveQuery(() => db.stockIns.orderBy('date').reverse().toArray());
  const products = useLiveQuery(() => db.products.where('isDeleted').equals(0).toArray());
  const suppliers = useLiveQuery(() => db.suppliers.where('isDeleted').equals(0).toArray());

  const filtered = stockIns?.filter(si =>
    filterSupplier === 'all' || si.supplierId === Number(filterSupplier)
  ) ?? [];

  const getProductName = (pid: number) => products?.find(p => p.id === pid)?.name ?? '-';
  const getSupplierName = (sid: number) => suppliers?.find(s => s.id === sid)?.name ?? '-';

  const openAdd = () => {
    setProductId(''); setSupplierId(''); setQuantity(''); setBuyPrice(''); setNotes('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const qty = Number(quantity);
    const price = Number(buyPrice);
    if (!productId || !supplierId || qty <= 0 || price <= 0) {
      toast.error('Lengkapi semua field');
      return;
    }

    const product = products?.find(p => p.id === Number(productId));
    if (!product) return;

    // Save stock in record
    await db.stockIns.add({
      productId: Number(productId),
      supplierId: Number(supplierId),
      quantity: qty,
      buyPrice: price,
      totalPrice: qty * price,
      date: new Date(),
      notes: notes.trim(),
    });

    // Calculate new weighted average HPP
    const oldStock = product.stock;
    const oldHpp = product.hpp;
    const newStock = oldStock + qty;
    const newHpp = newStock > 0 ? ((oldStock * oldHpp) + (qty * price)) / newStock : price;

    // Save HPP history
    await db.hppHistory.add({
      productId: product.id!,
      oldHpp,
      newHpp,
      source: 'stock_in',
      date: new Date(),
    });

    // Update product stock and HPP
    await db.products.update(product.id!, {
      stock: newStock,
      hpp: Math.round(newHpp),
      updatedAt: new Date(),
    });

    toast.success(`Stok ${product.name} bertambah ${qty}. HPP: Rp ${Math.round(newHpp).toLocaleString('id-ID')}`);
    setDialogOpen(false);
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Stok Masuk
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">Catat penambahan persediaan barang dari supplier</p>
        </div>
        <Button size="sm" onClick={openAdd} className="h-9 rounded-xl gap-1.5 font-medium shadow-sm hover:shadow-md transition-all shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="w-full sm:w-64">
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-10.5 rounded-xl border-border/40 bg-muted/20 focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs font-medium">
              <SelectValue placeholder="Filter berdasarkan supplier" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs rounded-lg">Semua Supplier</SelectItem>
              {suppliers?.map(s => (
                <SelectItem key={s.id} value={s.id!.toString()} className="text-xs rounded-lg">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1 self-start sm:self-auto bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/20">
          <span className="font-semibold text-foreground/80">{filtered.length}</span> Catatan Mutasi
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/40 rounded-2xl bg-muted/10">
          <div className="p-3 bg-muted/60 rounded-full w-fit mx-auto mb-3">
            <ArrowDownToLine className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground/80">Belum ada data stok masuk</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">Catat stok masuk baru untuk memperbarui persediaan produk dan menghitung HPP</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Stok Masuk
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(si => (
            <Card key={si.id} className="border border-border/30 bg-card hover:border-primary/20 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground/95 truncate">
                      {getProductName(si.productId)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      dari <span className="font-medium text-foreground/80">{getSupplierName(si.supplierId)}</span>
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded-lg">
                      +{si.quantity} unit
                    </span>
                    <span className="text-[11px] text-muted-foreground/80 bg-muted px-2 py-0.5 rounded-md border border-border/10">
                      @ Rp {si.buyPrice.toLocaleString('id-ID')}
                    </span>
                  </div>

                  {si.notes && (
                    <div className="p-2 rounded-lg bg-muted/40 border border-border/10 text-[11px] text-muted-foreground italic leading-relaxed">
                      {si.notes}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0 flex flex-col justify-between h-full min-h-[60px]">
                  <p className="text-[10px] text-muted-foreground bg-muted/60 border border-border/20 px-2 py-1.5 rounded-md self-end">
                    {format(new Date(si.date), 'dd MMM yyyy, HH:mm', { locale: id })}
                  </p>
                  <div className="mt-auto pt-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Nilai</p>
                    <p className="text-sm font-extrabold text-foreground/90">
                      Rp {si.totalPrice.toLocaleString('id-ID')}
                    </p>
                  </div>
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
              <ArrowDownToLine className="w-5 h-5 text-primary" />
              Tambah Stock In
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Produk *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-11 rounded-xl text-sm"><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent className="rounded-xl">{products?.map(p => <SelectItem key={p.id} value={p.id!.toString()}>{p.name} (stok: {p.stock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-11 rounded-xl text-sm"><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                <SelectContent className="rounded-xl">{suppliers?.map(s => <SelectItem key={s.id} value={s.id!.toString()}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Jumlah *</Label>
                <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Contoh: 10" className="h-11 rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Harga Beli/Unit *</Label>
                <Input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="Contoh: 5000" className="h-11 rounded-xl text-sm" />
              </div>
            </div>
            {quantity && buyPrice && (
              <div className="bg-muted/50 p-3.5 rounded-2xl text-xs flex justify-between items-center border border-border/40">
                <span className="text-muted-foreground font-medium">Total Pembelian:</span>
                <span className="font-extrabold text-primary text-sm">Rp {(Number(quantity) * Number(buyPrice)).toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catatan</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan opsional (misal: Barang titipan)" className="h-11 rounded-xl text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={handleSave}>
                Simpan Stock In
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
