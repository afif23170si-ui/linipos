import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import { Download, Share2, Printer, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Transaction, StoreSettings, TransactionItemRecord } from '@/lib/db';

interface ReceiptProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  items: TransactionItemRecord[];
  storeSettings: StoreSettings | undefined;
  paymentMethodName: string;
}

export default function Receipt({ open, onClose, transaction, items, storeSettings, paymentMethodName }: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const captureReceipt = async (): Promise<HTMLCanvasElement | null> => {
    if (!receiptRef.current) return null;
    setGenerating(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      return canvas;
    } catch {
      toast.error('Gagal membuat gambar struk');
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const canvas = await captureReceipt();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `struk-${transaction.receiptNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Struk berhasil diunduh');
  };

  const handleShare = async () => {
    const canvas = await captureReceipt();
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      if (navigator.share) {
        const file = new File([blob], `struk-${transaction.receiptNumber}.png`, { type: 'image/png' });
        await navigator.share({
          title: `Struk ${transaction.receiptNumber}`,
          text: `Struk dari ${storeSettings?.storeName || 'Toko'}`,
          files: [file],
        });
      } else {
        // Fallback: open WhatsApp with text
        const text = encodeURIComponent(
          `*${storeSettings?.storeName || 'Toko'}*\nStruk: ${transaction.receiptNumber}\nTotal: Rp ${transaction.total.toLocaleString('id-ID')}\nTanggal: ${format(new Date(transaction.date), 'dd MMM yyyy HH:mm', { locale: id })}`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Gagal membagikan struk');
      }
    }
  };

  const handleBluetoothPrint = async () => {
    if (!('bluetooth' in navigator)) {
      toast.error('Bluetooth tidak tersedia di browser ini. Gunakan Chrome di Android.');
      return;
    }

    try {
      toast.info('Mencari printer Bluetooth...');
      // @ts-expect-error Web Bluetooth API is not fully typed in TypeScript
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      // Build ESC/POS text
      const encoder = new TextEncoder();
      const lines: string[] = [];
      
      lines.push('\x1B\x61\x01'); // Center align
      lines.push(`${storeSettings?.storeName || 'Toko'}\n`);
      if (storeSettings?.address) lines.push(`${storeSettings.address}\n`);
      if (storeSettings?.phone) lines.push(`${storeSettings.phone}\n`);
      lines.push('--------------------------------\n');
      lines.push(`No: ${transaction.receiptNumber}\n`);
      lines.push(`${format(new Date(transaction.date), 'dd/MM/yyyy HH:mm')}\n`);
      lines.push('--------------------------------\n');
      
      lines.push('\x1B\x61\x00'); // Left align
      for (const item of items) {
        lines.push(`${item.productName}\n`);
        if (item.notes) lines.push(`  ${item.notes}\n`);
        lines.push(`  ${item.quantity} x Rp ${item.price.toLocaleString('id-ID')}  Rp ${item.subtotal.toLocaleString('id-ID')}\n`);
      }
      
      lines.push('--------------------------------\n');
      lines.push(`Subtotal:  Rp ${transaction.subtotal.toLocaleString('id-ID')}\n`);
      if (transaction.discountAmount > 0) {
        lines.push(`Diskon:   -Rp ${transaction.discountAmount.toLocaleString('id-ID')}\n`);
      }
      lines.push(`TOTAL:     Rp ${transaction.total.toLocaleString('id-ID')}\n`);
      lines.push(`Bayar:     Rp ${transaction.paymentAmount.toLocaleString('id-ID')}\n`);
      lines.push(`Kembali:   Rp ${transaction.change.toLocaleString('id-ID')}\n`);
      lines.push('--------------------------------\n');
      lines.push('\x1B\x61\x01'); // Center
      lines.push(`${storeSettings?.receiptFooter || 'Terima kasih!'}\n\n\n`);

      const data = encoder.encode(lines.join(''));
      
      // Send in chunks of 100 bytes
      for (let i = 0; i < data.length; i += 100) {
        const chunk = data.slice(i, i + 100);
        await characteristic.writeValue(chunk);
      }

      toast.success('Struk berhasil dicetak!');
      await server.disconnect();
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        toast.error('Gagal mencetak. Pastikan printer Bluetooth menyala.');
      }
    }
  };

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl p-5 sm:p-6 border border-border/50 shadow-2xl">
        <DialogHeader className="pb-2">
          {/* Animated Glowing Success Badge */}
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2.5 shadow-md shadow-emerald-500/5 animate-bounce">
            <Check className="w-7 h-7" strokeWidth={3} />
          </div>
          <DialogTitle className="text-center text-lg sm:text-xl font-black text-foreground tracking-tight">
            Transaksi Berhasil!
          </DialogTitle>
          <p className="text-center text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
            Struk pembayaran telah dicatat ke dalam database lokal & server cloud.
          </p>

          {/* Dynamic Change/Exact-Amount Pill */}
          {transaction.change > 0 ? (
            <div className="bg-primary/10 border border-primary/20 text-primary text-xs font-black px-4 py-2 rounded-full mx-auto mt-3 w-fit flex items-center gap-1.5 shadow-sm">
              <span className="opacity-80">Kembalian:</span>
              <span className="text-sm">{rp(transaction.change)}</span>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-black px-4 py-2 rounded-full mx-auto mt-3 w-fit flex items-center gap-1.5 shadow-sm">
              <span>Uang Pas / Lunas</span>
            </div>
          )}
        </DialogHeader>

        {/* Skeuomorphic Paper Receipt Card Slot */}
        <div className="border border-border/40 p-2 bg-muted/30 rounded-2xl mx-auto w-fit shadow-inner mb-2 mt-1">
          {/* Receipt preview - this gets captured as image */}
          <div ref={receiptRef} className="bg-white text-black p-4 rounded-xl mx-auto shadow-sm" style={{ width: '280px', fontFamily: 'monospace', fontSize: '12px' }}>
            {/* Store Header */}
            <div className="text-center mb-2">
              {storeSettings?.logo && (
                <img src={storeSettings.logo} alt="Logo" className="w-14 h-14 object-contain mx-auto mb-1.5" />
              )}
              <p className="font-bold text-sm leading-tight">{storeSettings?.storeName || 'Toko'}</p>
              {storeSettings?.address && <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{storeSettings.address}</p>}
              {storeSettings?.phone && <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{storeSettings.phone}</p>}
            </div>

            <div className="border-t border-dashed border-gray-400 my-2" />

            {/* Receipt info */}
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>No: {transaction.receiptNumber}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mb-1">
              <span>{format(new Date(transaction.date), 'dd/MM/yyyy HH:mm', { locale: id })}</span>
              <span>{paymentMethodName}</span>
            </div>
            {transaction.userName && (
              <div className="text-[10px] text-gray-600">
                <span>Kasir: {transaction.userName}</span>
              </div>
            )}

            <div className="border-t border-dashed border-gray-400 my-2" />

            {/* Items */}
            {items.map((item, i) => (
              <div key={i} className="mb-1.5 text-left">
                <p className="text-[11px] font-bold text-gray-800 leading-snug">{item.productName}</p>
                {item.notes && <p className="text-[9px] text-gray-500 italic mt-0.5">  {item.notes}</p>}
                <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                  <span>{item.quantity} x {rp(item.price)}</span>
                  <span>{rp(item.subtotal)}</span>
                </div>
                {item.discountAmount > 0 && (
                  <div className="flex justify-between text-[10px] text-red-600">
                    <span>  Diskon</span>
                    <span>-{rp(item.discountAmount)}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="border-t border-dashed border-gray-400 my-2" />

            {/* Totals */}
            <div className="space-y-0.5 text-[11px] text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{rp(transaction.subtotal)}</span>
              </div>
              {transaction.discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Diskon</span>
                  <span>-{rp(transaction.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs text-black border-t border-dashed border-gray-400 pt-1.5 mt-1.5">
                <span>TOTAL</span>
                <span>{rp(transaction.total)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Bayar</span>
                <span>{rp(transaction.paymentAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kembali</span>
                <span>{rp(transaction.change)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-400 my-2.5" />

            {/* Footer */}
            <p className="text-center text-[10px] text-gray-500 leading-normal">
              {storeSettings?.receiptFooter || 'Terima kasih atas kunjungan Anda!'}
            </p>
          </div>
        </div>

        {/* Elegant Action Buttons Grid */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1.5 h-auto py-2.5 rounded-2xl active:scale-95 transition-all text-muted-foreground hover:text-foreground shadow-sm" 
            onClick={handleDownload} 
            disabled={generating}
          >
            <Download className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold">Unduh</span>
          </Button>
          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1.5 h-auto py-2.5 rounded-2xl active:scale-95 transition-all text-muted-foreground hover:text-foreground shadow-sm" 
            onClick={handleShare} 
            disabled={generating}
          >
            <Share2 className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold">Bagikan</span>
          </Button>
          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1.5 h-auto py-2.5 rounded-2xl active:scale-95 transition-all text-muted-foreground hover:text-foreground shadow-sm" 
            onClick={handleBluetoothPrint} 
            disabled={generating}
          >
            <Printer className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold">Cetak</span>
          </Button>
        </div>

        {/* Primary Checkout Done Button */}
        <Button 
          className="w-full mt-3 h-11 text-xs font-black tracking-wider uppercase bg-primary text-primary-foreground shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/15 hover:bg-primary/95 rounded-2xl active:scale-[0.98] transition-all" 
          onClick={onClose}
        >
          Selesai / Transaksi Baru
        </Button>
      </DialogContent>
    </Dialog>
  );
}
