import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Supplier } from '@/lib/db';
import { useState } from 'react';
import { Truck, Plus, Edit2, Trash2, Phone, MapPin, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function SupplierPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const suppliers = useLiveQuery(() => db.suppliers.where('isDeleted').equals(0).toArray());

  const filtered = suppliers?.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  ) ?? [];

  const openAdd = () => {
    setEditSupplier(null);
    setName(''); setPhone(''); setAddress(''); setNotes('');
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setName(s.name); setPhone(s.phone); setAddress(s.address); setNotes(s.notes);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const data = { name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim() };
    if (editSupplier?.id) {
      await db.suppliers.update(editSupplier.id, data);
      toast.success('Supplier diperbarui');
    } else {
      await db.suppliers.add({ ...data, createdAt: new Date(), isDeleted: 0, deletedAt: null });
      toast.success('Supplier ditambahkan');
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (deleteId) { await db.suppliers.update(deleteId, { isDeleted: 1, deletedAt: new Date() }); setDeleteId(null); toast.success('Supplier dihapus'); }
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Daftar Supplier
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">Kelola data supplier & distributor rantai pasok toko Anda</p>
        </div>
        <Button size="sm" onClick={openAdd} className="h-9 rounded-xl gap-1.5 font-medium shadow-sm hover:shadow-md transition-all shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input 
            placeholder="Cari nama supplier atau nomor telepon..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-10 h-10.5 rounded-xl border-border/40 bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground/50 transition-all text-xs font-medium" 
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1 self-start sm:self-auto bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/20">
          <span className="font-semibold text-foreground/80">{filtered.length}</span> Supplier Terdaftar
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/40 rounded-2xl bg-muted/10">
          <div className="p-3 bg-muted/60 rounded-full w-fit mx-auto mb-3">
            <Truck className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground/80">Belum ada supplier</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">Tambahkan supplier pertama untuk mulai mencatat pembelian stok produk</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Supplier
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="border border-border/30 bg-card hover:border-primary/20 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground/90 truncate">{s.name}</h3>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" onClick={() => openEdit(s)}>
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive/80 hover:text-destructive" onClick={() => setDeleteId(s.id!)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {s.phone && (
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-muted/60 text-primary">
                        <Phone className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-foreground/80">{s.phone}</span>
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-muted/60 text-primary mt-0.5 shrink-0">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <span className="line-clamp-2 leading-relaxed">{s.address}</span>
                    </div>
                  )}
                </div>

                {s.notes && (
                  <div className="mt-2.5 p-2 rounded-xl bg-muted/30 border border-border/20">
                    <p className="text-[11px] leading-relaxed text-muted-foreground/90 italic">
                      <span className="font-semibold not-italic text-foreground/70 mr-1">Catatan:</span>
                      {s.notes}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
              <Truck className="w-5 h-5 text-primary" />
              {editSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nama Supplier *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: PT Sumber Makmur" className="h-11 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Telepon</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contoh: 08123456789" className="h-11 rounded-xl text-sm" type="tel" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Alamat</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Contoh: Jl. Industri Raya No. 12" className="h-11 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catatan</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan tambahan (misal: Supplier bahan baku utama)" rows={2} className="rounded-xl text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl text-xs" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button className="flex-1 h-11 rounded-xl text-xs font-semibold" onClick={handleSave} disabled={!name.trim()}>
                Simpan Supplier
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-sm rounded-2xl p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold text-sm sm:text-base">
              <Trash2 className="w-5 h-5" />
              Hapus Supplier?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs pt-1">
              Data supplier yang dihapus tidak dapat dikembalikan. Pastikan tidak ada stok aktif yang terikat dengan supplier ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-11 rounded-xl text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
