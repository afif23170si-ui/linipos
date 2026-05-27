import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '@/lib/db';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Tag, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Emoji pilihan ───────────────────────────────────────────────────────────
const emojiOptions = [
  '📦','🍕','🥤','🍜','🧃','🎽','💊','🧹','📱','🛒',
  '🎁','✂️','🏷️','🍰','☕','🍗','🍔','🍟','🥛','🎮',
  '👟','💄','🧴','🌿','🔧','🏠','📚','🎵','✈️','🚗',
  '🖥️','⌨️','🖱️','📷','🎧','🖨️','⌚','📺','💻','🔌',
];

/** Render ikon kategori — emoji atau inisial huruf jika kosong */
export function CategoryIcon({
  icon,
  name,
  color,
  size = 'md',
}: {
  icon: string;
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-12 h-12 text-xl';

  // Cek apakah icon adalah emoji valid (bukan nama Lucide icon atau teks biasa)
  const isValidEmoji = icon && /\p{Emoji}/u.test(icon) && icon.length <= 4;

  return (
    <span
      className={cn(sizeClass, 'rounded-2xl flex items-center justify-center shrink-0 font-bold transition-transform duration-200 group-hover:scale-105')}
      style={{ backgroundColor: color + '18', border: `1.5px solid ${color}30` }}
    >
      {isValidEmoji ? (
        <span>{icon}</span>
      ) : (
        // Tampilkan inisial huruf pertama dari nama kategori
        <span className="font-bold" style={{ color, fontSize: size === 'sm' ? '0.75rem' : '1rem' }}>
          {name?.charAt(0)?.toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}

export default function Categories() {
  const { isOwner } = useAuth();
  const [catDialog, setCatDialog] = useState(false);
  const [catEditId, setCatEditId] = useState<number | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [catColor, setCatColor] = useState('#FF6B35');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const categories = useLiveQuery(() => db.categories.where('isDeleted').equals(0).toArray());

  const productCounts = useLiveQuery(async () => {
    const products = await db.products.where('isDeleted').equals(0).toArray();
    const counts: Record<number, number> = {};
    products.forEach(p => { counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
    return counts;
  }, []);

  const openCatAdd = () => {
    setCatEditId(null);
    setCatName('');
    setCatIcon('');
    setCatColor('#FF6B35');
    setCatDialog(true);
  };

  const openCatEdit = (c: Category) => {
    setCatEditId(c.id!);
    setCatName(c.name);
    // Hanya set emoji jika valid, sisanya kosongkan (no-icon)
    const isValidEmoji = c.icon && /\p{Emoji}/u.test(c.icon) && c.icon.length <= 4;
    setCatIcon(isValidEmoji ? c.icon : '');
    setCatColor(c.color);
    setCatDialog(true);
  };

  const saveCat = async () => {
    if (!catName.trim()) return;
    let catId = catEditId;
    try {
      const payload = {
        name: catName.trim(),
        icon: catIcon,   // bisa kosong = no icon
        color: catColor,
      };
      if (catEditId) {
        await db.categories.update(catEditId, payload);
      } else {
        catId = await db.categories.add({
          ...payload,
          createdAt: new Date(),
          isDeleted: 0,
          deletedAt: null,
        }) as number;
      }
      setCatDialog(false);
      toast.success('Kategori berhasil disimpan');
      if (catId) {
        const cat = await db.categories.get(catId);
        if (cat) import('@/lib/api-client').then(({ pushCategory }) => pushCategory(cat));
      }
    } catch {
      toast.error('Gagal menyimpan kategori');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await db.categories.update(deleteId, { isDeleted: 1, deletedAt: new Date() });
      toast.success('Kategori berhasil dihapus');
      const cat = await db.categories.get(deleteId);
      if (cat) import('@/lib/api-client').then(({ pushCategory }) => pushCategory(cat));
      setDeleteId(null);
    } catch {
      toast.error('Gagal menghapus kategori');
    }
  };

  if (!isOwner) {
    return (
      <div className="text-center py-20 px-4">
        <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Akses Dibatasi</p>
        <p className="text-xs text-muted-foreground mt-1">Hanya Owner yang bisa mengelola kategori produk</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Kategori Produk
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-normal">
            Kelola kelompok penggolongan produk toko Anda
          </p>
        </div>
        <Button onClick={openCatAdd} size="sm" className="h-9 gap-1.5 shadow-sm text-xs font-semibold rounded-xl shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          Tambah Kategori
        </Button>
      </div>

      {categories?.length === 0 ? (
        <Card className="border-0 shadow-sm py-12 text-center">
          <CardContent className="space-y-2">
            <Tag className="w-10 h-10 mx-auto text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Belum ada kategori produk</p>
            <p className="text-xs text-muted-foreground">Kategori membantu mengelompokkan produk di kasir.</p>
            <Button onClick={openCatAdd} variant="outline" size="sm" className="mt-2 rounded-xl text-xs">
              Buat Kategori Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories?.map((c) => {
            const count = productCounts?.[c.id!] || 0;
            return (
              <Card key={c.id} className="border border-border/30 hover:border-primary/20 shadow-sm hover:shadow-md rounded-2xl overflow-hidden transition-all duration-200 group flex flex-col justify-between">
                <CardContent className="p-4 space-y-4 bg-card">
                  <div className="flex items-start gap-3">
                    <CategoryIcon icon={c.icon} name={c.name} color={c.color} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-foreground leading-tight truncate group-hover:text-primary transition-colors">{c.name}</p>
                      <span className="inline-flex items-center text-[10px] font-medium text-muted-foreground mt-1 bg-muted px-2.5 py-0.5 rounded-full">
                        {count} Produk
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/40 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full border border-border/40 shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="font-mono text-[10px] tracking-wide">{c.color.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => openCatEdit(c)} title="Edit Kategori"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(c.id!)} title="Hapus Kategori"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Category Add/Edit Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {catEditId ? 'Edit Kategori' : 'Tambah Kategori Produk'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Nama */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nama Kategori</Label>
              <Input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="Contoh: Minuman Dingin, Makanan Penutup"
                className="h-11 rounded-xl"
                autoFocus
              />
            </div>

            {/* Emoji Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Ikon <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <div className="grid grid-cols-7 gap-1.5 p-2 border border-border/50 bg-muted/20 rounded-xl max-h-[180px] overflow-y-auto">
                {/* Opsi "Tanpa Ikon" */}
                <button
                  type="button"
                  title="Tanpa Ikon"
                  onClick={() => setCatIcon('')}
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center border text-[10px] font-bold transition-all',
                    catIcon === ''
                      ? 'border-primary bg-primary/10 text-primary scale-105 shadow-sm'
                      : 'border-dashed border-border/60 text-muted-foreground hover:bg-muted hover:border-border'
                  )}
                >
                  —
                </button>

                {/* Emoji options */}
                {emojiOptions.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setCatIcon(e)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-xl flex items-center justify-center border transition-all',
                      catIcon === e
                        ? 'border-primary bg-primary/10 scale-105 shadow-sm'
                        : 'border-transparent hover:bg-muted'
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              {catIcon === '' && (
                <p className="text-[10px] text-muted-foreground">Tanpa ikon — inisial nama kategori akan ditampilkan</p>
              )}
            </div>

            {/* Warna + Preview */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Warna Label</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color" value={catColor}
                  onChange={e => setCatColor(e.target.value)}
                  className="h-11 w-20 p-1 cursor-pointer rounded-xl"
                />
                {/* Live Preview */}
                <div
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl border flex-1 min-w-0"
                  style={{ backgroundColor: catColor + '18', borderColor: catColor + '40' }}
                >
                  <CategoryIcon icon={catIcon} name={catName || '?'} color={catColor} size="sm" />
                  <span className="text-xs font-semibold truncate" style={{ color: catColor }}>
                    {catName || 'Preview Kategori'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <Button
                type="button" variant="outline"
                className="flex-1 h-11 rounded-xl text-xs font-semibold"
                onClick={() => setCatDialog(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="flex-1 h-11 rounded-xl text-xs font-semibold shadow-md"
                onClick={saveCat}
                disabled={!catName.trim()}
              >
                Simpan Kategori
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-sm rounded-2xl p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold text-sm sm:text-base">
              <Trash2 className="w-5 h-5" /> Hapus Kategori?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs pt-1">
              Data kategori yang dihapus tidak dapat dikembalikan. Produk di dalam kategori ini akan kehilangan pengelompokannya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-11 rounded-xl text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
