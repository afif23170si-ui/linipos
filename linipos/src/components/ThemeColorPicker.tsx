import { useRef } from 'react';
import { THEME_COLORS, getThemeHSL } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';
import { Check, Pipette } from 'lucide-react';

interface ThemeColorPickerProps {
  value: string;
  onChange: (hue: string) => void;
}

export default function ThemeColorPicker({ value, onChange }: ThemeColorPickerProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const isCustom = !THEME_COLORS.some(c => c.hue === value) && value.startsWith('#');
  const customHex = isCustom ? value : '#6366f1';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 items-center">
        {THEME_COLORS.map(color => {
          const isActive = value === color.hue;
          const hsl = getThemeHSL(color.hue);
          return (
            <button
              key={color.hue}
              onClick={() => onChange(color.hue)}
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-all border-2',
                isActive ? 'scale-110 shadow-lg border-foreground/30' : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: `hsl(${hsl})` }}
              title={color.name}
            >
              {isActive && <Check className="w-5 h-5 text-white drop-shadow" />}
            </button>
          );
        })}

        {/* Custom color button */}
        <button
          onClick={() => colorInputRef.current?.click()}
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center transition-all border-2 overflow-hidden relative',
            isCustom ? 'scale-110 shadow-lg border-foreground/30' : 'border-dashed border-muted-foreground/40 hover:scale-105 hover:border-muted-foreground/70'
          )}
          style={isCustom ? { backgroundColor: customHex } : undefined}
          title="Warna Kustom"
        >
          {isCustom
            ? <Check className="w-5 h-5 text-white drop-shadow" />
            : <Pipette className="w-5 h-5 text-muted-foreground" />
          }
        </button>

        <input
          ref={colorInputRef}
          type="color"
          className="sr-only"
          value={customHex}
          onChange={e => onChange(e.target.value)}
        />
      </div>

      {isCustom && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full border border-border"
            style={{ backgroundColor: customHex }}
          />
          Warna kustom: <span className="font-mono font-medium">{customHex.toUpperCase()}</span>
        </p>
      )}
    </div>
  );
}
