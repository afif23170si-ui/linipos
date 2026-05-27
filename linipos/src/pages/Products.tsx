import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Category, type VariantGroup, type VariantOption } from '@/lib/db';
import { pushProduct, pushVariantsForProduct } from '@/lib/api-client';
import { useState, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Package as PackageIcon, Camera, X, Copy, ChevronDown, ChevronUp, Layers, FileText, GripVertical, LayoutGrid, List, AlertTriangle, Eye, EyeOff, CheckSquare, Square, CheckCheck, Settings2, Trash } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/image-utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { getUnits, addUnit, removeUnit, isDefaultUnit } from '@/lib/units';

export default function Produk() {
  const { isOwner } = useAuth();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try { return (localStorage.getItem('linipos-products-view') as 'list' | 'grid') || 'list'; } catch { return 'list'; }
  });
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [price, setPrice] = useState('');
  const [hpp, setHpp] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [unlimitedStock, setUnlimitedStock] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>(undefined);

  // Unit management
  const [units, setUnits] = useState<string[]>(() => getUnits());
  const [newUnit, setNewUnit] = useState('');
  const [unitPopoverOpen, setUnitPopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Variant state
  interface LocalVariantOption {
    tempId: string; // for React key before persisted
    dbId?: number;  // real DB id if already saved
    name: string;
    price: string;
    hpp: string;
    sortOrder: number;
  }
  interface LocalVariantGroup {
    tempId: string;
    dbId?: number;
    name: string;
    sortOrder: number;
    options: LocalVariantOption[];
    expanded: boolean;
  }
  const [variantGroups, setVariantGroups] = useState<LocalVariantGroup[]>([]);
  const hasVariants = variantGroups.length > 0 && variantGroups.some(g => g.options.length > 0);

  // Drag-to-reorder state
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const products = useLiveQuery(async () => {
    const all = await db.products.where('isDeleted').equals(0).toArray();
    return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  });
  const categories = useLiveQuery(() => db.categories.where('isDeleted').equals(0).toArray());

  const filtered = products?.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === 'all' || p.categoryId === Number(filterCategory);
    const matchActive = filterActive === 'all' || (filterActive === 'active' ? p.isActive !== 0 : p.isActive === 0);
    return matchSearch && matchCategory && matchActive;
  }) ?? [];

  const activeCount   = products?.filter(p => p.isActive !== 0).length ?? 0;
  const inactiveCount = products?.filter(p => p.isActive === 0).length ?? 0;

  // Drag only available when no active filter (reordering a partial list is confusing)
  const isDraggable = isOwner && !search && filterCategory === 'all' && filterActive === 'all';

  const handleToggleActive = async (p: Product) => {
    const next = p.isActive === 0 ? 1 : 0;
    await db.products.update(p.id!, { isActive: next });
    toast.success(next === 1 ? `"${p.name}" diaktifkan` : `"${p.name}" dinonaktifkan`);
    // Push ke server → broadcast ke device lain
    const updated = await db.products.get(p.id!);
    if (updated) pushProduct(updated);
  };

  const toggleSelectMode = () => { setIsSelecting(p => !p); setSelectedIds(new Set()); };
  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const s = new Set(prev);
    if (s.has(id)) {
      s.delete(id);
    } else {
      s.add(id);
    }
    return s;
  });
  const selectAll = () => setSelectedIds(new Set(filtered.map(p => p.id!)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await db.products.update(id, { isDeleted: 1, deletedAt: new Date() });
      const groups = await db.variantGroups.where('productId').equals(id).toArray();
      for (const g of groups) await db.variantOptions.where('variantGroupId').equals(g.id!).delete();
      await db.variantGroups.where('productId').equals(id).delete();
    }
    toast.success(`${selectedIds.size} produk dihapus`);
    setSelectedIds(new Set()); setBulkDeleteConfirm(false); setIsSelecting(false);
  };

  const handleBulkToggleActive = async (activate: boolean) => {
    for (const id of selectedIds) await db.products.update(id, { isActive: activate ? 1 : 0 });
    toast.success(`${selectedIds.size} produk ${activate ? 'diaktifkan' : 'dinonaktifkan'}`);
    setSelectedIds(new Set());
  };

  const handleDragStart = (id: number) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDragEnd = async () => {
    if (dragId === null || dragOverId === null || dragId === dragOverId) {
      setDragId(null); setDragOverId(null);
      return;
    }
    const list = [...(filtered)];
    const fromIdx = list.findIndex(p => p.id === dragId);
    const toIdx   = list.findIndex(p => p.id === dragOverId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...list];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await Promise.all(reordered.map((p, i) => db.products.update(p.id!, { sortOrder: i + 1 })));
    setDragId(null); setDragOverId(null);
    toast.success('Urutan produk diperbarui');
  };

  const getCategoryName = (catId: number) => categories?.find(c => c.id === catId)?.name ?? '-';
  const getCategoryColor = (catId: number) => categories?.find(c => c.id === catId)?.color ?? '#999';

  const openAdd = () => {
    setEditProduct(null);
    setName(''); setSku(''); setCategoryId(categories?.[0]?.id?.toString() ?? ''); setPrice(''); setHpp(''); setStock(''); setUnit('pcs'); setBarcode(''); setDescription(''); setUnlimitedStock(false); setPhoto(undefined);
    setVariantGroups([]);
    setDialogOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditProduct(p);
    setName(p.name); setSku(p.sku); setCategoryId(p.categoryId.toString()); setPrice(p.price.toString()); setHpp(p.hpp.toString()); setStock(p.stock.toString()); setUnit(p.unit); setBarcode(p.barcode ?? ''); setDescription(p.description ?? ''); setUnlimitedStock(p.unlimitedStock ?? false); setPhoto(p.photo);

    // Load variant groups + options for this product
    const groups = await db.variantGroups.where('productId').equals(p.id!).sortBy('sortOrder');
    const options = await db.variantOptions.where('productId').equals(p.id!).sortBy('sortOrder');
    const localGroups: LocalVariantGroup[] = groups.map(g => ({
      tempId: `db-${g.id}`,
      dbId: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      expanded: true,
      options: options
        .filter(o => o.variantGroupId === g.id)
        .map(o => ({
          tempId: `db-${o.id}`,
          dbId: o.id,
          name: o.name,
          price: o.price.toString(),
          hpp: o.hpp.toString(),
          sortOrder: o.sortOrder,
        })),
    }));
    setVariantGroups(localGroups);
    setDialogOpen(true);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
    } catch {
      toast.error('Gagal memproses gambar');
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!name.trim() || !categoryId || !sku.trim()) return;
    try {
      // Check SKU uniqueness across ALL records (including soft-deleted)
      // because &sku is a unique index in IndexedDB regardless of isDeleted
      const existing = await db.products.where('sku').equals(sku.trim()).first();
      if (existing && existing.isDeleted === 0 && existing.id !== editProduct?.id) {
        toast.error(`SKU "${sku.trim()}" sudah digunakan oleh produk "${existing.name}"`);
        return;
      }

      const data = {
        name: name.trim(),
        sku: sku.trim(),
        categoryId: Number(categoryId),
        price: Number(price) || 0,
        hpp: Number(hpp) || 0,
        stock: unlimitedStock ? 9999 : (Number(stock) || 0),
        unit: unit.trim() || 'pcs',
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
        unlimitedStock,
        photo: photo || undefined,
        updatedAt: new Date(),
      };

      if (editProduct?.id) {
        await db.products.update(editProduct.id, data);
      } else if (existing?.isDeleted === 1) {
        // Reuse the soft-deleted record (reactivate with new data)
        await db.products.update(existing.id!, { ...data, isDeleted: 0, isActive: 1, deletedAt: null });
      } else {
        const maxOrder = products?.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0) ?? 0;
        await db.products.add({ ...data, sortOrder: maxOrder + 1, isActive: 1, createdAt: new Date(), isDeleted: 0, deletedAt: null } as Product);
      }

      // Save variant groups & options
      const productId = editProduct?.id ?? (await db.products.where('sku').equals(sku.trim()).first())?.id;
      if (productId) {
        const oldGroups = await db.variantGroups.where('productId').equals(productId).toArray();
        for (const og of oldGroups) {
          await db.variantOptions.where('variantGroupId').equals(og.id!).delete();
        }
        await db.variantGroups.where('productId').equals(productId).delete();

        for (const group of variantGroups) {
          if (group.options.length === 0) continue;
          const groupId = await db.variantGroups.add({
            productId,
            name: group.name,
            sortOrder: group.sortOrder,
          });
          for (const opt of group.options) {
            await db.variantOptions.add({
              variantGroupId: groupId as number,
              productId,
              name: opt.name,
              price: Number(opt.price) || 0,
              hpp: Number(opt.hpp) || 0,
              sortOrder: opt.sortOrder,
            });
          }
        }

        if (hasVariants) {
          const firstOpt = variantGroups[0]?.options[0];
          if (firstOpt) {
            await db.products.update(productId, {
              price: Number(firstOpt.price) || 0,
              hpp: Number(firstOpt.hpp) || 0,
            });
          }
        }
      }

      // Background push ke server — HARUS sequential: product dulu, baru variants
      if (productId) {
        const savedProduct = await db.products.get(productId);
        if (savedProduct) {
          // Fire-and-forget tapi URUTANNYA HARUS BENAR:
          // 1. await pushProduct → produk pasti sudah ada di server
          // 2. baru pushVariantsForProduct → server bisa cari productId by SKU
          (async () => {
            try {
              await pushProduct(savedProduct);
              await pushVariantsForProduct(productId);
            } catch (e) {
              console.error('[Products] background push failed:', e);
            }
          })();
        }
      }

      setDialogOpen(false);
      toast.success(editProduct ? 'Produk diperbarui' : 'Produk ditambahkan');
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Gagal menyimpan produk. Coba lagi.');
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      await db.products.update(deleteId, { isDeleted: 1, deletedAt: new Date() });
      // Also clean up variant data
      const groups = await db.variantGroups.where('productId').equals(deleteId).toArray();
      for (const g of groups) {
        await db.variantOptions.where('variantGroupId').equals(g.id!).delete();
      }
      await db.variantGroups.where('productId').equals(deleteId).delete();
      setDeleteId(null);
    }
  };

  // Variant helper functions
  const addVariantGroup = () => {
    setVariantGroups(prev => [...prev, {
      tempId: `new-${Date.now()}`,
      name: '',
      sortOrder: prev.length,
      options: [],
      expanded: true,
    }]);
  };

  const removeVariantGroup = (tempId: string) => {
    setVariantGroups(prev => prev.filter(g => g.tempId !== tempId));
  };

  const updateGroupName = (tempId: string, newName: string) => {
    setVariantGroups(prev => prev.map(g => g.tempId === tempId ? { ...g, name: newName } : g));
  };

  const toggleGroupExpand = (tempId: string) => {
    setVariantGroups(prev => prev.map(g => g.tempId === tempId ? { ...g, expanded: !g.expanded } : g));
  };

  const addOption = (groupTempId: string) => {
    setVariantGroups(prev => prev.map(g => {
      if (g.tempId !== groupTempId) return g;
      return { ...g, options: [...g.options, {
        tempId: `opt-${Date.now()}`,
        name: '',
        price: '',
        hpp: '',
        sortOrder: g.options.length,
      }]};
    }));
  };

  const removeOption = (groupTempId: string, optTempId: string) => {
    setVariantGroups(prev => prev.map(g => {
      if (g.tempId !== groupTempId) return g;
      return { ...g, options: g.options.filter(o => o.tempId !== optTempId) };
    }));
  };

  const updateOption = (groupTempId: string, optTempId: string, field: keyof LocalVariantOption, value: string) => {
    setVariantGroups(prev => prev.map(g => {
      if (g.tempId !== groupTempId) return g;
      return { ...g, options: g.options.map(o => o.tempId === optTempId ? { ...o, [field]: value } : o) };
    }));
  };

  return (
    <div className="px-4 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          {isSelecting ? (
            <div className="flex items-center gap-2">
              <button onClick={toggleSelectMode} className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Batal
              </button>
              <span className="text-sm font-bold">{selectedIds.size > 0 ? `${selectedIds.size} dipilih` : 'Pilih produk'}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Produk
              </h1>
              <p className="text-xs text-muted-foreground mt-1 leading-normal">
                Kelola daftar produk, stok, dan harga jual toko Anda
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSelecting ? (
            <button
              onClick={selectedIds.size === filtered.length ? clearSelection : selectAll}
              className="text-xs font-semibold text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {selectedIds.size === filtered.length ? 'Batal Semua' : 'Pilih Semua'}
            </button>
          ) : (
            <>
              {isOwner && (
                <>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={toggleSelectMode}>
                    <CheckSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">Pilih</span>
                  </Button>
                  <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Tambah Produk</span>
                    <span className="sm:hidden">Tambah</span>
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-2">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="Cari nama / SKU produk..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10.5 rounded-xl border-border/40 bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground/50 transition-all text-xs font-medium w-full"
          />
        </div>

        {/* Category dropdown — compact on mobile */}
        <div className="shrink-0">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[110px] sm:w-[140px] h-10.5 rounded-xl border-border/40 bg-muted/20 text-xs font-medium focus:ring-1 focus:ring-primary focus:border-primary transition-all text-left">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs rounded-lg">Semua Kategori</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id!.toString()} className="text-xs rounded-lg">{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View Toggle — icon-only compact */}
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-xl p-1 border border-border/30 h-10.5 shrink-0">
          <button
            onClick={() => {
              setViewMode('list');
              try { localStorage.setItem('linipos-products-view', 'list'); } catch {
                // localStorage may be unavailable in restricted browser modes.
              }
            }}
            className={cn(
              'w-[34px] h-[34px] rounded-lg transition-all duration-200 flex items-center justify-center shrink-0',
              viewMode === 'list'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Tampilan List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setViewMode('grid');
              try { localStorage.setItem('linipos-products-view', 'grid'); } catch {
                // localStorage may be unavailable in restricted browser modes.
              }
            }}
            className={cn(
              'w-[34px] h-[34px] rounded-lg transition-all duration-200 flex items-center justify-center shrink-0',
              viewMode === 'grid'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Tampilan Grid"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active status filter pills */}
      {isOwner && (
        <div className="flex gap-1.5">
          {([
            { value: 'all',      label: 'Semua',    count: (products?.length ?? 0) },
            { value: 'active',   label: 'Aktif',    count: activeCount },
            { value: 'inactive', label: 'Nonaktif', count: inactiveCount },
          ] as const).map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilterActive(tab.value)}
              className={cn(
                'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                filterActive === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {tab.label}
              <span className={cn(
                'text-[10px] px-1 py-0.5 rounded-full',
                filterActive === tab.value ? 'bg-white/20' : 'bg-background'
              )}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Drag hint / filter notice */}
      {filtered.length > 0 && isDraggable && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <GripVertical className="w-3 h-3" />
          Seret untuk mengubah urutan tampil di kasir
        </p>
      )}
      {filtered.length > 0 && !isDraggable && isOwner && (search || filterCategory !== 'all' || filterActive !== 'all') && (
        <p className="text-[10px] text-muted-foreground">Hapus filter untuk mengubah urutan produk</p>
      )}

      {/* Product List / Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <PackageIcon className="w-14 h-14 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Belum ada produk</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{search ? `Tidak ada hasil untuk "${search}"` : 'Tambah produk pertama kamu'}</p>
          {isOwner && !search && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="w-4 h-4" /> Tambah Produk
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ─── GRID VIEW ─── */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filtered.map(p => {
            const isSelected = selectedIds.has(p.id!);
            return (
              <Card
                key={p.id}
                className={cn(
                  'border border-border/30 hover:border-primary/20 shadow-sm hover:shadow-md rounded-2xl overflow-hidden transition-all duration-200 group flex flex-col justify-between cursor-pointer',
                  p.isActive === 0 && 'opacity-60',
                  dragOverId === p.id && dragId !== p.id && 'ring-2 ring-primary/40 scale-[1.01]',
                  dragId === p.id && 'opacity-40',
                  isSelected && 'ring-2 ring-primary'
                )}
                draggable={isDraggable && !isSelecting}
                onDragStart={() => isDraggable && !isSelecting && p.id && handleDragStart(p.id)}
                onDragOver={e => isDraggable && !isSelecting && p.id && handleDragOver(e, p.id)}
                onDragEnd={handleDragEnd}
                onClick={() => isSelecting ? (p.id && toggleSelect(p.id)) : (isOwner && openEdit(p))}
              >
                {/* Product Image Container */}
                <div className="relative aspect-[4/3] bg-muted overflow-hidden shrink-0 border-b border-border/10">
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PackageIcon className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Category Badge overlay on top-left */}
                  <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
                    <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-background/80 backdrop-blur-md text-foreground border border-border/20 shadow-sm">
                      <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full" style={{ backgroundColor: getCategoryColor(p.categoryId) }} />
                      <span className="truncate max-w-[50px] sm:max-w-none">{getCategoryName(p.categoryId)}</span>
                    </span>
                  </div>
                  {/* Inactive badge overlay */}
                  {p.isActive === 0 && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                      <span className="text-[9px] sm:text-[10px] font-bold bg-muted-foreground text-background px-2 py-0.5 rounded-full shadow-sm">NONAKTIF</span>
                    </div>
                  )}
                  {/* Stock badge overlay on top-right */}
                  {!p.unlimitedStock && p.stock <= 5 && (
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-background/80 backdrop-blur-md border border-border/20 shadow-sm',
                        p.stock <= 0 ? 'text-destructive' : 'text-warning'
                      )}>
                        <span className={cn('w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full animate-pulse', p.stock <= 0 ? 'bg-destructive' : 'bg-warning')} />
                        {p.stock <= 0 ? 'Habis' : `Sisa ${p.stock}`}
                      </span>
                    </div>
                  )}
                  {/* Checkbox overlay (select mode) */}
                  {isSelecting && (
                    <div className={cn('absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center z-10 transition-all shadow-sm', isSelected ? 'bg-primary border-primary scale-105' : 'bg-background/80 backdrop-blur-md border-muted-foreground/45')}>
                      {isSelected && <CheckCheck className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />}
                    </div>
                  )}
                </div>

                <CardContent className="p-3 sm:p-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-muted-foreground/60 font-mono">
                      <span className="truncate">SKU: {p.sku || '—'}</span>
                      {p.barcode && <span className="truncate hidden xs:inline">BC: {p.barcode}</span>}
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors min-h-[32px] sm:min-h-[40px]">{p.name}</h3>
                    <div className="flex items-baseline justify-between gap-1 flex-wrap pt-0.5">
                      <p className="text-xs sm:text-sm font-extrabold text-primary">Rp {p.price.toLocaleString('id-ID')}</p>
                      {isOwner && p.hpp > 0 && (
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">HPP Rp {p.hpp.toLocaleString('id-ID')}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-3 border-t border-border/40 mt-2 sm:mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      {p.unlimitedStock ? (
                        <span className="text-[9px] sm:text-[10px] text-primary font-semibold">∞ Tak terbatas</span>
                      ) : (
                        <span className={cn('text-[9px] sm:text-[10px] font-semibold', p.stock <= 0 ? 'text-destructive' : p.stock <= 5 ? 'text-warning' : 'text-success')}>
                          Stok {p.stock}
                        </span>
                      )}
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          title="Edit Produk"
                        >
                          <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl transition-colors',
                            p.isActive === 0
                              ? 'text-muted-foreground/50 hover:text-success hover:bg-success/10'
                              : 'text-success hover:text-muted-foreground hover:bg-muted'
                          )}
                          title={p.isActive === 0 ? 'Aktifkan' : 'Nonaktifkan'}
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}
                        >
                          {p.isActive === 0 ? <EyeOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(p.id!); }}
                          title="Hapus Produk"
                        >
                          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ─── LIST VIEW ─── */
        <div className="space-y-3">
          {filtered.map(p => {
            const isSelected = selectedIds.has(p.id!);
            return (
              <Card
                key={p.id}
                className={cn(
                  'border border-border/30 hover:border-primary/20 shadow-sm hover:shadow-md rounded-2xl overflow-hidden transition-all duration-200 group cursor-pointer',
                  p.isActive === 0 && 'opacity-60',
                  dragOverId === p.id && dragId !== p.id && 'ring-2 ring-primary/40 scale-[1.01]',
                  dragId === p.id && 'opacity-40',
                  isSelected && 'ring-2 ring-primary'
                )}
                draggable={isDraggable && !isSelecting}
                onDragStart={() => isDraggable && !isSelecting && p.id && handleDragStart(p.id)}
                onDragOver={e => isDraggable && !isSelecting && p.id && handleDragOver(e, p.id)}
                onDragEnd={handleDragEnd}
                onClick={() => isSelecting ? (p.id && toggleSelect(p.id)) : (isOwner && openEdit(p))}
              >
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    {/* Left selection container */}
                    {isSelecting && (
                      <div className={cn('w-12 flex items-center justify-center shrink-0 transition-colors border-r border-border/10', isSelected ? 'bg-primary/10' : '')}>
                        <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-sm transition-all', isSelected ? 'bg-primary border-primary scale-105' : 'border-muted-foreground/30 bg-background')}>
                          {isSelected && <CheckCheck className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-1 p-4 min-w-0">
                      {/* Drag handle */}
                      {isDraggable && (
                        <div className="flex items-center self-center cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/75 transition-colors shrink-0">
                          <GripVertical className="w-4 h-4" />
                        </div>
                      )}

                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-xl bg-muted border border-border/30 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
                        {p.photo ? (
                          <img src={p.photo} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <PackageIcon className="w-6 h-6 text-muted-foreground/30" />
                        )}
                        {p.isActive === 0 && (
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                            <span className="text-[8px] font-bold bg-muted-foreground text-background px-1.5 py-0.5 rounded-full shadow-sm">NONAKTIF</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Name + category */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{p.name}</h3>
                          <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: getCategoryColor(p.categoryId) + '15', color: getCategoryColor(p.categoryId), border: `1.5px solid ${getCategoryColor(p.categoryId)}20` }}
                          >
                            {getCategoryName(p.categoryId)}
                          </span>
                          {p.isActive === 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 border border-border/40">
                              Nonaktif
                            </span>
                          )}
                        </div>

                        {/* SKU */}
                        <p className="text-[10px] text-muted-foreground/60 font-mono">SKU: {p.sku || '—'}</p>

                        {/* Price & Stock info row */}
                        <div className="flex items-center gap-3 flex-wrap pt-0.5">
                          <span className="text-sm font-extrabold text-primary">Rp {p.price.toLocaleString('id-ID')}</span>
                          {isOwner && p.hpp > 0 && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              HPP: Rp {p.hpp.toLocaleString('id-ID')}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            {p.unlimitedStock ? (
                              <span className="text-[10px] text-primary font-semibold">∞ Tak terbatas</span>
                            ) : p.stock <= 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-destructive">
                                <AlertTriangle className="w-3 h-3" /> Stok habis
                              </span>
                            ) : p.stock <= 5 ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-warning">
                                <AlertTriangle className="w-3 h-3" /> Sisa {p.stock} {p.unit}
                              </span>
                            ) : (
                              <span className="text-[10px] text-success font-semibold">{p.stock} {p.unit} tersedia</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      {isOwner && (
                        <div className="flex items-center gap-0.5 shrink-0 border-l border-border/40 pl-3">
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                            title="Edit Produk"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className={cn('h-8 w-8 rounded-xl transition-colors',
                              p.isActive === 0
                                ? 'text-muted-foreground/50 hover:text-success hover:bg-success/10'
                                : 'text-success/70 hover:text-muted-foreground hover:bg-muted'
                            )}
                            title={p.isActive === 0 ? 'Aktifkan' : 'Nonaktifkan'}
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}
                          >
                            {p.isActive === 0 ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteId(p.id!); }}
                            title="Hapus Produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating bulk action bar */}
      {isSelecting && selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border border-border shadow-2xl rounded-2xl px-4 py-3">
          <span className="text-sm font-bold mr-1">{selectedIds.size} dipilih</span>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleBulkToggleActive(true)}>
            <Eye className="w-3.5 h-3.5 text-success" /> Aktifkan
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleBulkToggleActive(false)}>
            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> Nonaktifkan
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setBulkDeleteConfirm(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Hapus
          </Button>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-sm rounded-2xl p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold text-sm sm:text-base">
              <Trash2 className="w-5 h-5" />
              Hapus {selectedIds.size} Produk?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs pt-1">
              Semua produk yang dipilih akan dihapus secara permanen. Tindakan ini tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="flex-1 h-11 rounded-xl text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground">Hapus ({selectedIds.size})</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-sm rounded-2xl p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold text-sm sm:text-base">
              <Trash2 className="w-5 h-5" />
              Hapus Produk?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs pt-1">
              Produk akan dihapus secara permanen dari katalog dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="flex-1 h-11 rounded-xl text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[96vw] sm:max-w-lg md:max-w-xl rounded-2xl p-0 max-h-[92vh] flex flex-col gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {editProduct
                ? <><Edit2 className="w-4 h-4 text-primary" /> Edit Produk</>
                : <><Plus className="w-4 h-4 text-primary" /> Tambah Produk Baru</>}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* — FOTO — */}
            <section>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Foto Produk</p>
              <div className="flex gap-4 items-start">
                <div
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-muted border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center overflow-hidden cursor-pointer transition-colors shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photo
                    ? <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                    : <div className="flex flex-col items-center gap-1 text-muted-foreground/40"><Camera className="w-7 h-7" /><span className="text-[9px]">Upload foto</span></div>}
                </div>
                <div className="flex flex-col gap-2 flex-1 pt-1">
                  <p className="text-xs text-muted-foreground">JPG, PNG, WebP — dikompres otomatis</p>
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-2 w-fit rounded-xl" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-4 h-4" />{photo ? 'Ganti Foto' : 'Pilih Foto'}
                  </Button>
                  {photo && (
                    <Button type="button" variant="ghost" size="sm" className="h-9 gap-2 w-fit rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setPhoto(undefined)}>
                      <X className="w-4 h-4" />Hapus Foto
                    </Button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </div>
            </section>

            {/* — INFO PRODUK — */}
            <section className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Informasi Produk</p>
              <div className="space-y-1.5">
                <Label>Nama Produk <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Nasi Goreng Special" className="h-11 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>SKU / Kode <span className="text-destructive">*</span></Label>
                  <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="NG001" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Kategori <span className="text-destructive">*</span></Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>
                      {categories?.map(c => <SelectItem key={c.id} value={c.id!.toString()}>{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Deskripsi <span className="text-muted-foreground font-normal text-xs">(opsional)</span></Label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Deskripsi singkat produk..." rows={2}
                  className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
            </section>

            {/* — HARGA — */}
            <section className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Harga</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Harga Jual {!hasVariants && <span className="text-destructive">*</span>}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">Rp</span>
                    <Input type="number" value={hasVariants ? '' : price} onChange={e => setPrice(e.target.value)}
                      placeholder={hasVariants ? 'Dari variant' : '15000'} className="h-11 pl-9 rounded-xl" disabled={hasVariants} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>HPP <span className="text-muted-foreground font-normal text-xs">(modal)</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">Rp</span>
                    <Input type="number" value={hasVariants ? '' : hpp} onChange={e => setHpp(e.target.value)}
                      placeholder={hasVariants ? 'Dari variant' : '10000'} className="h-11 pl-9 rounded-xl" disabled={hasVariants} />
                  </div>
                </div>
              </div>
              {!hasVariants && price && hpp && Number(price) > 0 && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-muted/60">
                  <span className="text-muted-foreground">Margin:</span>
                  <span className={cn('font-bold', Number(price) - Number(hpp) >= 0 ? 'text-success' : 'text-destructive')}>
                    Rp {(Number(price) - Number(hpp)).toLocaleString('id-ID')} ({Number(price) > 0 ? Math.round(((Number(price) - Number(hpp)) / Number(price)) * 100) : 0}%)
                  </span>
                </div>
              )}
            </section>

            {/* — STOK — */}
            <section className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stok</p>
              <button
                type="button" onClick={() => setUnlimitedStock(!unlimitedStock)}
                className={cn('flex items-center gap-3.5 w-full px-4 py-3 rounded-2xl border-2 transition-all text-left shadow-sm',
                  unlimitedStock ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40')}
              >
                <div className={cn('w-10 h-5.5 rounded-full transition-colors relative shrink-0 flex items-center', unlimitedStock ? 'bg-primary' : 'bg-muted-foreground/30')}
                  style={{ height: '22px', width: '40px' }}>
                  <span className={cn('absolute w-4 h-4 bg-white rounded-full shadow transition-transform', unlimitedStock ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', unlimitedStock ? 'text-primary' : 'text-foreground')}>Stok Tak Terbatas</p>
                  <p className="text-[10px] text-muted-foreground">Cocok untuk bahan baku / minuman racik</p>
                </div>
                {unlimitedStock && <span className="ml-auto text-xs text-primary font-medium">✓ Aktif</span>}
              </button>
              {!unlimitedStock && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="space-y-1.5">
                    <div className="flex items-center h-5">
                      <Label>Jumlah Stok</Label>
                    </div>
                    <Input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between h-5">
                      <Label>Satuan</Label>
                      {/* Tombol kelola satuan */}
                      <Popover open={unitPopoverOpen} onOpenChange={setUnitPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button type="button" className="text-[10px] text-primary flex items-center gap-0.5 hover:underline">
                            <Settings2 className="w-3 h-3" /> Kelola
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 rounded-2xl shadow-xl" align="end">
                          <p className="text-xs font-bold mb-2">Kelola Satuan</p>
                          {/* Tambah satuan baru */}
                          <div className="flex gap-1.5 mb-3">
                            <Input
                              value={newUnit}
                              onChange={e => setNewUnit(e.target.value)}
                              placeholder="Satuan baru..."
                              className="h-8 text-xs rounded-lg flex-1"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newUnit.trim()) {
                                    const updated = addUnit(newUnit.trim());
                                    setUnits(updated);
                                    setUnit(newUnit.trim().toLowerCase());
                                    setNewUnit('');
                                    toast.success(`Satuan "${newUnit.trim()}" ditambahkan`);
                                  }
                                }
                              }}
                            />
                            <Button
                              type="button" size="icon"
                              className="h-8 w-8 shrink-0 rounded-lg"
                              onClick={() => {
                                if (newUnit.trim()) {
                                  const updated = addUnit(newUnit.trim());
                                  setUnits(updated);
                                  setUnit(newUnit.trim().toLowerCase());
                                  setNewUnit('');
                                  toast.success(`Satuan "${newUnit.trim()}" ditambahkan`);
                                }
                              }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          {/* Daftar satuan */}
                          <div className="space-y-1 max-h-[180px] overflow-y-auto">
                            {units.map(u => (
                              <div key={u} className={cn(
                                'flex items-center justify-between px-2 py-1.5 rounded-lg text-xs',
                                unit === u ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'
                              )}>
                                <button type="button" className="flex-1 text-left" onClick={() => { setUnit(u); setUnitPopoverOpen(false); }}>
                                  {u}
                                </button>
                                {!isDefaultUnit(u) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = removeUnit(u);
                                      setUnits(updated);
                                      if (unit === u) setUnit('pcs');
                                      toast.success(`Satuan "${u}" dihapus`);
                                    }}
                                    className="text-destructive/50 hover:text-destructive p-0.5 rounded"
                                    title="Hapus satuan ini"
                                  >
                                    <Trash className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">Satuan default tidak bisa dihapus</p>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>

            {/* — LAINNYA — */}
            <section className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lainnya</p>
              <div className="space-y-1.5">
                <Label>Barcode <span className="text-muted-foreground font-normal text-xs">(opsional)</span></Label>
                <div className="flex gap-2">
                  <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Scan atau ketik barcode" className="h-11 flex-1 rounded-xl" />
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" title="Salin dari SKU" onClick={() => setBarcode(sku.trim())}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </section>

            {/* — VARIANT — */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Variant
                </p>
                {variantGroups.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1 rounded-xl" onClick={addVariantGroup}>
                    <Plus className="w-3 h-3" /> Tambah Grup
                  </Button>
                )}
              </div>
              {variantGroups.length === 0 ? (
                <button type="button" onClick={addVariantGroup}
                  className="w-full border-2 border-dashed border-border rounded-2xl py-4 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2 shadow-sm">
                  <Plus className="w-3.5 h-3.5" /> Tambah variant (ukuran, suhu, topping, dll.)
                </button>
              ) : (
                <div className="space-y-3">
                  {variantGroups.map(group => (
                    <div key={group.tempId} className="border border-border/40 rounded-2xl overflow-hidden shadow-sm bg-card">
                      <div className="flex items-center gap-2 p-3 bg-muted/40 border-b border-border/30">
                        <button type="button" onClick={() => toggleGroupExpand(group.tempId)} className="shrink-0">
                          {group.expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <Input value={group.name} onChange={e => updateGroupName(group.tempId, e.target.value)} placeholder="Nama Grup (misal: Ukuran)" className="h-9 text-xs flex-1 rounded-xl" />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => removeVariantGroup(group.tempId)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {group.expanded && (
                        <div className="p-3 space-y-2">
                          {group.options.map(opt => (
                            <div key={opt.tempId} className="flex items-center gap-1.5">
                              <Input value={opt.name} onChange={e => updateOption(group.tempId, opt.tempId, 'name', e.target.value)} placeholder="Nama opsi" className="h-9 text-xs flex-1 rounded-xl" />
                              <Input type="number" value={opt.price} onChange={e => updateOption(group.tempId, opt.tempId, 'price', e.target.value)} placeholder="Harga" className="h-9 text-xs w-24 rounded-xl" />
                              <Input type="number" value={opt.hpp} onChange={e => updateOption(group.tempId, opt.tempId, 'hpp', e.target.value)} placeholder="HPP" className="h-9 text-xs w-20 rounded-xl" />
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => removeOption(group.tempId, opt.tempId)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" className="w-full h-9 text-xs gap-1 rounded-xl" onClick={() => addOption(group.tempId)}>
                            <Plus className="w-3 h-3" /> Tambah Opsi
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sticky footer */}
          <div className="px-5 py-4 border-t bg-background/95 backdrop-blur shrink-0 flex gap-3">
            <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button className="h-11 rounded-xl font-semibold gap-2" style={{ flex: 2 }} onClick={handleSave} disabled={!name.trim() || !categoryId || !sku.trim()}>
              {editProduct ? <><Edit2 className="w-4 h-4" /> Simpan</> : <><Plus className="w-4 h-4" /> Tambah Produk</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
