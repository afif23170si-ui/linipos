import { X, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

interface BackupReminderProps {
  lastBackupAt: Date | null;
  onDismiss: () => void;
  onBackup: () => void;
}

export default function BackupReminder({ lastBackupAt, onDismiss, onBackup }: BackupReminderProps) {
  const timeAgo = lastBackupAt
    ? formatDistanceToNow(lastBackupAt, { addSuffix: true, locale: id })
    : null;

  return (
    <Card className="border border-warning/20 bg-warning/5 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-4 relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 pr-8 sm:pr-0 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0 shadow-inner mt-0.5 sm:mt-0">
            <Download className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Backup Data Kamu</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {lastBackupAt
                ? `Terakhir backup ${timeAgo}`
                : 'Kamu belum pernah backup data'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto h-8 px-4 text-xs font-bold border-warning/30 text-warning hover:bg-warning/10 active:scale-95 transition-all rounded-xl"
            onClick={onBackup}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Backup Sekarang
          </Button>
          
          {/* Close button (Desktop inline next to Backup button) */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="hidden sm:inline-flex h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Close button (Mobile only - absolute top-right) */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="sm:hidden absolute top-3.5 right-3.5 h-8 w-8 p-0 rounded-xl text-muted-foreground/60 hover:text-foreground active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// Utility to check if backup reminder should show
export function shouldShowBackupReminder(lastBackupAt: Date | null): boolean {
  if (!lastBackupAt) return true; // never backed up
  const hoursSince = (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60);
  return hoursSince >= 24;
}

// Export all data as JSON and trigger download
export async function exportBackupData() {
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    variantGroups: await db.variantGroups.toArray(),
    variantOptions: await db.variantOptions.toArray(),
    suppliers: await db.suppliers.toArray(),
    stockIns: await db.stockIns.toArray(),
    stockOuts: await db.stockOuts.toArray(),
    hppHistory: await db.hppHistory.toArray(),
    paymentMethods: await db.paymentMethods.toArray(),
    transactions: await db.transactions.toArray(),
    transactionItems: await db.transactionItems.toArray(),
    shifts: await db.shifts.toArray(),
    storeSettings: await db.storeSettings.toArray(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linipos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Update last backup time
  const settings = await db.storeSettings.toCollection().first();
  if (settings?.id) {
    await db.storeSettings.update(settings.id, { lastBackupAt: new Date() });
  }
}
