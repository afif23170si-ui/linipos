import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

const LS_KEY = 'linipos-theme-color';
const STYLE_ID = 'linipos-theme-override';

// Predefined theme color options with HSL values
export const THEME_COLORS = [
  { name: 'Hitam',  hue: '220', saturation: '9%',  lightness: '16%' },
  { name: 'Oranye', hue: '25',  saturation: '95%', lightness: '53%' },
  { name: 'Biru',   hue: '217', saturation: '91%', lightness: '60%' },
  { name: 'Hijau',  hue: '142', saturation: '71%', lightness: '45%' },
  { name: 'Ungu',   hue: '262', saturation: '83%', lightness: '58%' },
  { name: 'Merah',  hue: '0',   saturation: '84%', lightness: '60%' },
  { name: 'Pink',   hue: '330', saturation: '81%', lightness: '60%' },
  { name: 'Teal',   hue: '172', saturation: '66%', lightness: '50%' },
  { name: 'Kuning', hue: '45',  saturation: '93%', lightness: '47%' },
] as const;

export function hexToHSL(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function getThemeHSL(hue: string) {
  if (hue.startsWith('#')) return hexToHSL(hue);
  const preset = THEME_COLORS.find(c => c.hue === hue);
  if (preset) return `${preset.hue} ${preset.saturation} ${preset.lightness}`;
  return `${hue} 95% 53%`;
}

/** Inject a <style> tag so it wins over @layer base variables (most reliable) */
export function applyThemeColor(hue: string) {
  const hsl = getThemeHSL(hue);

  // Compute foreground: white on dark, dark on light
  const lightness = parseFloat(hsl.split(' ')[2] ?? '50');
  const fg = lightness > 60 ? '0 0% 10%' : '0 0% 100%';

  // Inject / update override style tag — wins over @layer base
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
    :root,
    .dark {
      --primary: ${hsl} !important;
      --ring: ${hsl} !important;
      --primary-foreground: ${fg} !important;
    }
  `;

  // Also store in localStorage so it persists before DB loads
  try { localStorage.setItem(LS_KEY, hue); } catch { /* ignore */ }

  // Update PWA meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', `hsl(${hsl})`);
}

/** Apply persisted theme ASAP on cold start (call once early in app) */
export function applyStoredTheme() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) applyThemeColor(stored);
  } catch { /* ignore */ }
}

export function useThemeColor() {
  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  useEffect(() => {
    if (storeSettings?.themeColor) {
      applyThemeColor(storeSettings.themeColor);
    }
  }, [storeSettings?.themeColor]);

  return storeSettings?.themeColor ?? '25';
}

export async function setThemeColor(hue: string) {
  // Apply immediately (don't wait for DB)
  applyThemeColor(hue);
  // Persist to DB
  try {
    const settings = await db.storeSettings.toCollection().first();
    if (settings?.id) {
      await db.storeSettings.update(settings.id, { themeColor: hue });
    }
  } catch (e) {
    console.warn('setThemeColor DB error:', e);
  }
}
