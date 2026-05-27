import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CellHookData } from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

type AutoTableDocument = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};

const lastTableY = (doc: jsPDF) => (doc as AutoTableDocument).lastAutoTable?.finalY ?? 0;

const firstRawCell = (hookData: CellHookData): string | undefined => {
  const raw = hookData.row.raw;
  if (!Array.isArray(raw)) return undefined;
  const first = raw[0];
  return typeof first === 'string' ? first : undefined;
};

interface ExportData {
  storeName: string;
  storeAddress?: string;
  dateRange: { from: Date; to: Date; label: string };
  // Summary
  txCount: number;
  totalSales: number;
  totalProfit: number;
  totalItems: number;
  aov: number;
  // P&L
  totalRevenue: number;
  totalDiscount: number;
  netSales: number;
  totalHpp: number;
  grossProfit: number;
  marginPercent: number;
  // Payment breakdown
  paymentBreakdown: { name: string; total: number; count: number }[];
  // Top products
  topProducts: { name: string; qty: number; revenue: number; profit: number }[];
  // Category sales
  categorySales: { name: string; icon: string; totalQty: number; totalRevenue: number; products: Record<string, { name: string; qty: number; revenue: number }> }[];
}

export function exportReportPDF(data: ExportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 15;

  // --- HEADER ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(data.storeName || 'Lini POS', margin, y);
  y += 6;

  if (data.storeAddress) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(data.storeAddress, margin, y);
    y += 5;
  }

  // Period label
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');
  const periodText = `Laporan: ${data.dateRange.label}  (${format(data.dateRange.from, 'dd MMM yyyy', { locale: localeId })} - ${format(data.dateRange.to, 'dd MMM yyyy', { locale: localeId })})`;
  doc.text(periodText, margin, y);
  y += 3;

  // Generated timestamp
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Digenerate: ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}`, margin, y);
  y += 2;

  // Divider line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // --- RINGKASAN ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Ringkasan', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Metrik', 'Nilai']],
    body: [
      ['Total Transaksi', `${data.txCount}`],
      ['Total Penjualan', rp(data.totalSales)],
      ['Total Profit', rp(data.totalProfit)],
      ['Total Item Terjual', `${data.totalItems} item`],
      ['Rata-rata per Transaksi', rp(data.aov)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: margin, right: margin },
  });

  y = lastTableY(doc) + 8;

  // --- LABA RUGI ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Laba Rugi', margin, y);
  y += 6;

  const plRows: string[][] = [
    ['Pendapatan Kotor', rp(data.totalRevenue)],
  ];
  if (data.totalDiscount > 0) {
    plRows.push(['Diskon', `- ${rp(data.totalDiscount)}`]);
  }
  plRows.push(
    ['Penjualan Bersih', rp(data.netSales)],
    ['HPP (Modal)', `- ${rp(data.totalHpp)}`],
    ['Laba Kotor', rp(data.grossProfit)],
    ['Margin', `${data.marginPercent.toFixed(1)}%`],
  );

  autoTable(doc, {
    startY: y,
    head: [['Keterangan', 'Jumlah']],
    body: plRows,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: margin, right: margin },
    didParseCell: (hookData: CellHookData) => {
      // Highlight Laba Kotor row
      if (hookData.section === 'body' && firstRawCell(hookData) === 'Laba Kotor') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = data.grossProfit >= 0 ? [22, 163, 74] : [220, 38, 38];
      }
    },
  });

  y = lastTableY(doc) + 8;

  // --- METODE PEMBAYARAN ---
  if (data.paymentBreakdown.length > 0) {
    // Check if we need new page
    if (y > 240) { doc.addPage(); y = 15; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Metode Pembayaran', margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Metode', 'Transaksi', 'Total', '%']],
      body: data.paymentBreakdown.map(pm => [
        pm.name,
        `${pm.count} trx`,
        rp(pm.total),
        data.totalSales > 0 ? `${(pm.total / data.totalSales * 100).toFixed(1)}%` : '0%',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });

    y = lastTableY(doc) + 8;
  }

  // --- PRODUK TERLARIS ---
  if (data.topProducts.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Produk Terlaris', margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['#', 'Produk', 'Qty', 'Revenue', 'Profit']],
      body: data.topProducts.map((p, i) => [
        `${i + 1}`,
        p.name,
        `${p.qty}`,
        rp(p.revenue),
        rp(p.profit),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' } },
      margin: { left: margin, right: margin },
    });

    y = lastTableY(doc) + 8;
  }

  // --- PENJUALAN PER KATEGORI ---
  if (data.categorySales.length > 0) {
    if (y > 220) { doc.addPage(); y = 15; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Penjualan per Kategori & Produk', margin, y);
    y += 6;

    const catRows: string[][] = [];
    data.categorySales.forEach(cat => {
      // Category header row
      catRows.push([`${cat.icon} ${cat.name}`, `${cat.totalQty} item`, rp(cat.totalRevenue), '']);
      // Product sub-rows
      const prods = Object.values(cat.products).sort((a, b) => b.qty - a.qty);
      prods.forEach(p => {
        catRows.push([`    ${p.name}`, `${p.qty}`, rp(p.revenue), '']);
      });
    });

    autoTable(doc, {
      startY: y,
      head: [['Kategori / Produk', 'Qty', 'Revenue', '']],
      body: catRows,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 3: { cellWidth: 1 } }, // hidden column
      margin: { left: margin, right: margin },
      didParseCell: (hookData: CellHookData) => {
        // Bold category rows (not indented)
        const rowLabel = firstRawCell(hookData);
        if (hookData.section === 'body' && rowLabel && !rowLabel.startsWith('    ')) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [245, 245, 245];
        }
      },
    });
  }

  // --- FOOTER ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(170);
    doc.text(`Lini POS — Halaman ${p}/${totalPages}`, margin, doc.internal.pageSize.getHeight() - 8);
  }

  // Generate filename
  const dateStr = format(new Date(), 'yyyy-MM-dd_HHmm');
  const filename = `Laporan_${data.storeName.replace(/\s+/g, '_')}_${data.dateRange.label.replace(/\s+/g, '_')}_${dateStr}.pdf`;

  // Save / download
  doc.save(filename);

  return filename;
}

// ==============================
// SHIFT RECAP PDF
// ==============================

export interface ShiftPdfData {
  storeName: string;
  storeAddress?: string;
  userName: string;
  openedAt: Date;
  closedAt: Date;
  openingCash: number;
  totalTx: number;
  totalSales: number;
  totalProfit: number;
  cashSales: number;
  nonCashSales: number;
  actualCash: number;
  paymentBreakdown: { name: string; total: number; count: number }[];
}

export function exportShiftPDF(data: ShiftPdfData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 15;

  const duration = Math.round((data.closedAt.getTime() - data.openedAt.getTime()) / 60000);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const durationStr = hours > 0 ? `${hours} jam ${mins} menit` : `${mins} menit`;

  // --- HEADER ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.storeName || 'Lini POS', margin, y);
  y += 6;

  if (data.storeAddress) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(data.storeAddress, margin, y);
    y += 5;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(249, 115, 22); // orange
  doc.text('REKAP TUTUP SHIFT', margin, y);
  y += 5;

  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // --- SHIFT INFO ---
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);

  const infoRows: [string, string][] = [
    ['Kasir', data.userName],
    ['Tanggal', format(data.openedAt, 'EEEE, dd MMMM yyyy', { locale: localeId })],
    ['Jam Buka', format(data.openedAt, 'HH:mm')],
    ['Jam Tutup', format(data.closedAt, 'HH:mm')],
    ['Durasi', durationStr],
  ];

  autoTable(doc, {
    startY: y,
    body: infoRows,
    theme: 'plain',
    bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, textColor: [100, 100, 100] } },
    margin: { left: margin, right: margin },
  });

  y = lastTableY(doc) + 6;

  // --- RINGKASAN PENJUALAN ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Ringkasan Penjualan', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Keterangan', 'Nilai']],
    body: [
      ['Total Transaksi', `${data.totalTx} transaksi`],
      ['Total Penjualan', rp(data.totalSales)],
      ['Penjualan Tunai', rp(data.cashSales)],
      ['Penjualan Non-Tunai', rp(data.nonCashSales)],
      ...(data.totalProfit > 0 ? [['Profit Shift', rp(data.totalProfit)]] as [string, string][] : []),
    ],
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
    margin: { left: margin, right: margin },
  });

  y = lastTableY(doc) + 6;

  // --- BREAKDOWN PEMBAYARAN ---
  if (data.paymentBreakdown.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Metode Pembayaran', margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Metode', 'Transaksi', 'Total']],
      body: data.paymentBreakdown.map(pm => [
        pm.name,
        `${pm.count} trx`,
        rp(pm.total),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [249, 115, 22], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });

    y = lastTableY(doc) + 6;
  }

  // --- REKAP KAS ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Rekap Kas Laci', margin, y);
  y += 6;

  const expectedCash = data.openingCash + data.cashSales;
  const diff = data.actualCash - expectedCash;

  autoTable(doc, {
    startY: y,
    head: [['Keterangan', 'Jumlah']],
    body: [
      ['Kas Awal (Modal)', rp(data.openingCash)],
      ['+ Penjualan Tunai', rp(data.cashSales)],
      ['= Ekspektasi di Laci', rp(expectedCash)],
      ['Uang Aktual di Laci', rp(data.actualCash)],
      ['Selisih', (diff >= 0 ? '+' : '') + rp(diff)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
    margin: { left: margin, right: margin },
    didParseCell: (hookData: CellHookData) => {
      const rowLabel = firstRawCell(hookData);
      if (hookData.section === 'body' && rowLabel === 'Selisih') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = diff >= 0 ? [22, 163, 74] : [220, 38, 38];
      }
      if (hookData.section === 'body' && rowLabel === '= Ekspektasi di Laci') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [245, 245, 245];
      }
    },
  });

  // --- FOOTER ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(170);
    doc.text(`Lini POS — Rekap Shift — Dicetak: ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}`, margin, doc.internal.pageSize.getHeight() - 8);
  }

  const dateStr = format(data.openedAt, 'yyyy-MM-dd');
  const filename = `Rekap_Shift_${data.userName.replace(/\s+/g, '_')}_${dateStr}.pdf`;
  doc.save(filename);
  return filename;
}
