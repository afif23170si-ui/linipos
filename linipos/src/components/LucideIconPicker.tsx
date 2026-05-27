/**
 * LucideIconPicker.tsx
 * Picker ikon dari library Lucide yang sudah ada di project.
 * Digunakan untuk memilih ikon kategori produk.
 */
import { useState, useMemo } from 'react';
import {
  Search, Check,
  // Belanja
  ShoppingBag, ShoppingCart, Package, Tag, Barcode,
  Store, Boxes, Gift, Ticket, Percent, ReceiptText, Archive, Truck, Box,
  // Makanan & Minuman
  Coffee, UtensilsCrossed, Pizza, Soup, Wine,
  Beer, Sandwich, Cookie, Salad, IceCream2,
  Milk, Apple, Cake, ChefHat, Flame, Utensils,
  CupSoda, GlassWater, Egg, Fish,
  // Teknologi
  Laptop, Smartphone, Monitor, Mouse, Headphones,
  Cpu, Camera, Printer, Gamepad2, Tv,
  Watch, Plug, Battery, Wifi, HardDrive,
  // Fashion & Kecantikan
  Shirt, Glasses, Gem, Crown, Palette,
  Scissors, Wand2, Sparkles, Heart, Star,
  // Keuangan
  Banknote, CreditCard, Wallet, PiggyBank,
  Calculator, TrendingUp, CircleDollarSign, BadgeDollarSign,
  // Kesehatan
  Pill, Stethoscope, Shield, Activity,
  Thermometer, Cross,
  // Rumah & Gaya Hidup
  Home, Sofa, Lamp, Wrench, Hammer,
  Paintbrush, Key, Bed, Bath, TreePine,
  Flower2, Leaf, Sun, Droplets,
  // Umum
  Zap, Globe, Bell, BookOpen, Music,
  Image, Car, Plane, Map, Building2,
  School, Dumbbell, Bike, Baby,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ── Map nama → komponen Lucide (tree-shakeable) ────────────────────────────
export const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingBag, ShoppingCart, Package, Tag, Barcode, Store, Boxes, Gift, Ticket,
  Percent, ReceiptText, Archive, Truck, Box,
  Coffee, UtensilsCrossed, Pizza, Soup, Wine, Beer, Sandwich, Cookie, Salad,
  IceCream2, Milk, Apple, Cake, ChefHat, Flame, Utensils, CupSoda, GlassWater, Egg, Fish,
  Laptop, Smartphone, Monitor, Mouse, Headphones, Cpu, Camera, Printer, Gamepad2, Tv,
  Watch, Plug, Battery, Wifi, HardDrive,
  Shirt, Glasses, Gem, Crown, Palette, Scissors, Wand2, Sparkles, Heart, Star,
  Banknote, CreditCard, Wallet, PiggyBank, Calculator, TrendingUp, CircleDollarSign, BadgeDollarSign,
  Pill, Stethoscope, Shield, Activity, Thermometer, Cross,
  Home, Sofa, Lamp, Wrench, Hammer, Paintbrush, Key, Bed, Bath, TreePine, Flower2, Leaf, Sun, Droplets,
  Zap, Globe, Bell, BookOpen, Music, Image, Car, Plane, Map, Building2, School, Dumbbell, Bike, Baby,
};

// ── Daftar ikon yang dikurasi per kategori ──────────────────────────────────
export const ICON_CATEGORIES: Record<string, string[]> = {
  'Semua': [],
  'Belanja': [
    'ShoppingBag','ShoppingCart','Package','Tag','Barcode','Store','Boxes','Gift','Ticket','Percent','ReceiptText','Archive','Truck','Box',
  ],
  'Makanan & Minuman': [
    'Coffee','UtensilsCrossed','Pizza','Soup','Wine','Beer','Sandwich','Cookie','Salad','IceCream2','Milk','Apple','Cake','ChefHat','Flame','Utensils','CupSoda','GlassWater','Egg','Fish',
  ],
  'Teknologi': [
    'Laptop','Smartphone','Monitor','Mouse','Headphones','Cpu','Camera','Printer','Gamepad2','Tv','Watch','Plug','Battery','Wifi','HardDrive',
  ],
  'Fashion & Kecantikan': [
    'Shirt','Glasses','Gem','Crown','Palette','Scissors','Wand2','Sparkles','Heart','Star',
  ],
  'Keuangan': [
    'Banknote','CreditCard','Wallet','PiggyBank','Calculator','TrendingUp','CircleDollarSign','BadgeDollarSign',
  ],
  'Kesehatan': [
    'Pill','Stethoscope','Shield','Activity','Thermometer','Cross',
  ],
  'Rumah & Gaya Hidup': [
    'Home','Sofa','Lamp','Wrench','Hammer','Paintbrush','Key','Bed','Bath','TreePine','Flower2','Leaf','Sun','Droplets',
  ],
  'Umum': [
    'Zap','Globe','Bell','BookOpen','Music','Image','Car','Plane','Map','Building2','School','Dumbbell','Bike','Baby',
  ],
};

// Flatten semua untuk tab 'Semua'
const ALL_ICONS = Object.values(ICON_CATEGORIES).flat();
ICON_CATEGORIES['Semua'] = [...new Set(ALL_ICONS)];

// ── Helper: render ikon Lucide dari nama string ─────────────────────────────
export function renderLucideIcon(
  name: string,
  className = 'w-5 h-5',
): React.ReactNode {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}


// ── Komponen Picker ─────────────────────────────────────────────────────────
interface LucideIconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export default function LucideIconPicker({ value, onChange }: LucideIconPickerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Semua');

  const tabs = Object.keys(ICON_CATEGORIES);

  const icons = useMemo(() => {
    const base = ICON_CATEGORIES[activeTab] || ICON_CATEGORIES['Semua'];
    if (!search.trim()) return base;
    return base.filter(name =>
      name.toLowerCase().includes(search.toLowerCase())
    );
  }, [activeTab, search]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari ikon..."
          className="pl-8 h-9 rounded-xl text-sm"
        />
      </div>

      {/* Tab kategori */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); setSearch(''); }}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border',
              activeTab === tab
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid ikon */}
      <div className="grid grid-cols-7 gap-1.5 max-h-[200px] overflow-y-auto p-1.5 border border-border/50 bg-muted/20 rounded-xl">
        {icons.length === 0 && (
          <div className="col-span-7 text-center py-6 text-xs text-muted-foreground">
            Ikon tidak ditemukan
          </div>
        )}
        {icons.map(iconName => {
          const Icon = ICON_MAP[iconName];
          if (!Icon) return null;
          const isSelected = value === iconName;
          return (
            <button
              key={iconName}
              type="button"
              title={iconName}
              onClick={() => onChange(iconName)}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center border transition-all relative',
                isSelected
                  ? 'border-primary bg-primary/10 scale-105 shadow-sm text-primary'
                  : 'border-transparent hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {isSelected && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-2 h-2 text-primary-foreground" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Preview yang dipilih */}
      {value && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Terpilih:</span>
          <span className="flex items-center gap-1.5 font-medium text-foreground bg-muted px-2 py-0.5 rounded-md">
            {renderLucideIcon(value, 'w-3.5 h-3.5')}
            {value}
          </span>
        </div>
      )}
    </div>
  );
}
