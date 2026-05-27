import { Router, Request, Response } from 'express';
import { pool, query } from '../db';
import { validate } from '../middleware/validate';
import { TransactionCreateSchema, TransactionCreateInput } from '../schemas/transaction.schemas';
import type { PoolConnection } from 'mysql2/promise';
import { broadcastChange } from '../socket';

const router = Router();

// POST /transactions — atomic upsert by receiptNumber, scoped to storeId
router.post('/', validate(TransactionCreateSchema), async (req: Request, res: Response) => {
  const tx = req.body as TransactionCreateInput;
  const storeId = req.user?.storeId ?? null;
  let conn: PoolConnection | null = null;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [txResult] = await conn.execute(
      `INSERT INTO transactions
        (subtotal, discountType, discountValue, discountAmount, total,
         paymentMethodId, paymentAmount, \`change\`, profit, date,
         receiptNumber, status, type, refundOf, refundReason, orderNumber,
         customerName, tableNumber, remarks, openedAt, closedAt,
         userId, userName, shiftId, storeId)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         subtotal = VALUES(subtotal), discountType = VALUES(discountType),
         discountValue = VALUES(discountValue), discountAmount = VALUES(discountAmount),
         total = VALUES(total), paymentMethodId = VALUES(paymentMethodId),
         paymentAmount = VALUES(paymentAmount), \`change\` = VALUES(\`change\`),
         profit = VALUES(profit), date = VALUES(date), status = VALUES(status),
         type = VALUES(type), refundOf = VALUES(refundOf), refundReason = VALUES(refundReason),
         orderNumber = VALUES(orderNumber), customerName = VALUES(customerName),
         tableNumber = VALUES(tableNumber), remarks = VALUES(remarks),
         openedAt = VALUES(openedAt), closedAt = VALUES(closedAt),
         userId = VALUES(userId), userName = VALUES(userName),
         shiftId = VALUES(shiftId), updatedAt = NOW()`,
      [
        tx.subtotal, tx.discountType ?? null, tx.discountValue ?? 0,
        tx.discountAmount ?? 0, tx.total, tx.paymentMethodId,
        tx.paymentAmount, tx.change ?? 0, tx.profit ?? 0,
        new Date(tx.date), tx.receiptNumber, tx.status ?? 'completed',
        tx.type ?? 'sale', tx.refundOf ?? null, tx.refundReason ?? null,
        tx.orderNumber ?? null, tx.customerName ?? null, tx.tableNumber ?? null,
        tx.remarks ?? null, tx.openedAt ? new Date(tx.openedAt) : null,
        tx.closedAt ? new Date(tx.closedAt) : null, tx.userId ?? null,
        tx.userName ?? null, tx.shiftId ?? null, storeId,
      ]
    );

    // Get the transaction id
    const [txRows] = (await conn.execute(
      'SELECT id FROM transactions WHERE receiptNumber = ? LIMIT 1',
      [tx.receiptNumber]
    )) as [Array<{ id: number }>, unknown];
    const txId = txRows[0]?.id;

    // Delete existing items (for upsert semantics)
    await conn.execute('DELETE FROM transactionItems WHERE transactionId = ?', [txId]);

    // Insert items
    for (const item of tx.items) {
      await conn.execute(
        `INSERT INTO transactionItems
          (transactionId, productId, productName, quantity, price, hpp,
           discountType, discountValue, discountAmount, subtotal, notes,
           variantOptionId, variantName)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          txId, item.productId, item.productName, item.quantity,
          item.price, item.hpp, item.discountType ?? null,
          item.discountValue ?? 0, item.discountAmount ?? 0, item.subtotal,
          item.notes ?? null, item.variantOptionId ?? null, item.variantName ?? null,
        ]
      );
    }

    await conn.commit();
    broadcastChange('transactions', 'upsert', { id: txId, receiptNumber: tx.receiptNumber, status: tx.status, total: tx.total }, storeId);
    res.status(201).json({ id: txId, receiptNumber: tx.receiptNumber });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[POST /transactions]', err);
    res.status(500).json({ error: 'Database error, transaksi dibatalkan' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /transactions — with optional date filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { from, to, status } = req.query;
    const params: unknown[] = [];
    const conditions: string[] = ["t.status = 'completed'"];

    if (status && typeof status === 'string') {
      conditions[0] = 't.status = ?';
      params.push(status);
    }
    if (from) { conditions.push('t.date >= ?'); params.push(new Date(from as string)); }
    if (to) { conditions.push('t.date <= ?'); params.push(new Date(to as string)); }

    const txRows = await query<Array<Record<string, unknown>>>(
      `SELECT * FROM transactions t WHERE ${conditions.join(' AND ')} ORDER BY t.date DESC`,
      params
    );

    // Embed items
    if (!txRows || (txRows as Array<unknown>).length === 0) {
      res.json([]);
      return;
    }

    const txIds = (txRows as Array<{ id: number }>).map(t => t.id);
    const items = await query<Array<Record<string, unknown>>>(
      `SELECT * FROM transactionItems WHERE transactionId IN (${txIds.map(() => '?').join(',')})`,
      txIds
    );

    const itemsByTxId: Record<number, Array<Record<string, unknown>>> = {};
    for (const item of (items as Array<{ transactionId: number } & Record<string, unknown>>)) {
      if (!itemsByTxId[item.transactionId]) itemsByTxId[item.transactionId] = [];
      itemsByTxId[item.transactionId].push(item);
    }

    const result = (txRows as Array<{ id: number } & Record<string, unknown>>).map(tx => ({
      ...tx,
      items: itemsByTxId[tx.id] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('[GET /transactions]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
