/**
 * units.ts — Manajemen satuan produk via localStorage.
 * Tidak perlu tabel DB baru, zero-risk terhadap data existing.
 */

const STORAGE_KEY = 'linipos-units';

export const DEFAULT_UNITS = [
  'pcs', 'kg', 'gram', 'ons', 'liter', 'ml',
  'porsi', 'cup', 'botol', 'bungkus', 'kantong',
  'meter', 'cm', 'box', 'karton', 'lusin', 'rim',
  'lembar', 'buah', 'pasang', 'set',
];

/** Ambil semua satuan (default + custom) */
export function getUnits(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore parse error
  }
  // Pertama kali — simpan defaults
  saveUnits(DEFAULT_UNITS);
  return [...DEFAULT_UNITS];
}

/** Simpan semua satuan ke localStorage */
export function saveUnits(units: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
}

/** Tambah satuan baru (lowercase, trim, deduplicate) */
export function addUnit(unit: string): string[] {
  const clean = unit.trim().toLowerCase();
  if (!clean) return getUnits();
  const current = getUnits();
  if (current.includes(clean)) return current;
  const updated = [...current, clean];
  saveUnits(updated);
  return updated;
}

/** Hapus satuan (tidak bisa hapus satuan default) */
export function removeUnit(unit: string): string[] {
  const current = getUnits();
  const updated = current.filter(u => u !== unit);
  saveUnits(updated);
  return updated;
}

/** Cek apakah satuan adalah default (tidak bisa dihapus) */
export function isDefaultUnit(unit: string): boolean {
  return DEFAULT_UNITS.includes(unit);
}
