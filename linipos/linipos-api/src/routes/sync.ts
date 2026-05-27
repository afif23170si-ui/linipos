import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// GET /sync/pull — full snapshot scoped STRICTLY to storeId (multi-tenant safe)
router.get('/pull', async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string | undefined;
    const storeId = req.user?.storeId ?? null;
    const serverTimestamp = new Date().toISOString();

    // Strict storeId filter — NO fallback to NULL (multi-tenant isolation)
    if (!storeId) {
      res.status(403).json({ error: 'storeId tidak ditemukan di token' });
      return;
    }

    // Base filter: strict storeId only
    const sinceFilter = since
      ? 'WHERE storeId = ? AND (updatedAt > ? OR createdAt > ?)'
      : 'WHERE storeId = ?';
    const sinceParams = since
      ? [storeId, new Date(since), new Date(since)]
      : [storeId];

    const sinceFilterCreatedOnly = since
      ? 'WHERE storeId = ? AND createdAt > ?'
      : 'WHERE storeId = ?';
    const sinceParamsCreatedOnly = since
      ? [storeId, new Date(since)]
      : [storeId];

    // Variant queries: JOIN via products (variantGroups/Options tidak punya storeId langsung)
    const variantSinceFilter = since
      ? 'JOIN products p ON vg.productId = p.id WHERE p.storeId = ? AND (vg.updatedAt > ? OR vg.createdAt > ?)'
      : 'JOIN products p ON vg.productId = p.id WHERE p.storeId = ?';
    const variantSinceParams = since
      ? [storeId, new Date(since), new Date(since)]
      : [storeId];

    const variantOptSinceFilter = since
      ? 'JOIN products p ON vo.productId = p.id WHERE p.storeId = ? AND (vo.updatedAt > ? OR vo.createdAt > ?)'
      : 'JOIN products p ON vo.productId = p.id WHERE p.storeId = ?';
    const variantOptSinceParams = since
      ? [storeId, new Date(since), new Date(since)]
      : [storeId];

    const [
      categories,
      products,
      suppliers,
      paymentMethods,
      variantGroups,
      variantOptions,
      storeSettingsRows,
      users,
      transactions,
      transactionItems,
      shifts,
      stockIns,
      stockOuts,
      hppHistory,
    ] = await Promise.all([
      query(`SELECT * FROM categories ${sinceFilter}`, sinceParams),
      query(`SELECT * FROM products ${sinceFilter}`, sinceParams),
      query(`SELECT * FROM suppliers ${sinceFilter}`, sinceParams),
      // Payment methods: dari tabel baru paymentMethodConfigs JOIN defaults
      // Auto-seed dulu jika belum ada, lalu query
      query(
        `INSERT IGNORE INTO paymentMethodConfigs (storeId, type, isActive)
         SELECT ?, type, 1 FROM paymentMethodDefaults`,
        [storeId]
      ).then(() => query<Array<Record<string, unknown>>>(
        `SELECT pmc.id, pmc.storeId, pmc.type,
                COALESCE(pmc.displayName, pmd.name) AS name,
                pmd.name AS defaultName,
                pmd.icon,
                pmc.isActive,
                pmd.sortOrder,
                pmc.updatedAt
         FROM paymentMethodConfigs pmc
         JOIN paymentMethodDefaults pmd ON pmc.type = pmd.type
         WHERE pmc.storeId = ?
         ORDER BY pmd.sortOrder`,
        [storeId]
      )),
      query(`SELECT vg.* FROM variantGroups vg ${variantSinceFilter}`, variantSinceParams),
      query(`SELECT vo.* FROM variantOptions vo ${variantOptSinceFilter}`, variantOptSinceParams),
      query<Array<Record<string, unknown>>>('SELECT * FROM storeSettings WHERE storeId = ? LIMIT 1', [storeId]),
      // Users: filter KETAT by storeId — isolasi multi-tenant
      query(
        `SELECT id, name, pin, role, isActive, storeId, createdAt FROM users WHERE storeId = ?${since ? ' AND createdAt > ?' : ''}`,
        since ? [storeId, new Date(since)] : [storeId]
      ),
      query(`SELECT * FROM transactions ${sinceFilter}`, sinceParams),
      query(
        `SELECT ti.* FROM transactionItems ti
         JOIN transactions t ON ti.transactionId = t.id
         WHERE t.storeId = ?${since ? ' AND ti.createdAt > ?' : ''}`,
        since ? [storeId, new Date(since)] : [storeId]
      ),
      query(`SELECT * FROM shifts ${sinceFilterCreatedOnly}`, sinceParamsCreatedOnly),
      query(`SELECT * FROM stockIns ${sinceFilterCreatedOnly}`, sinceParamsCreatedOnly),
      query(`SELECT * FROM stockOuts ${sinceFilterCreatedOnly}`, sinceParamsCreatedOnly),
      query(`SELECT * FROM hppHistory ${sinceFilterCreatedOnly}`, sinceParamsCreatedOnly),
    ]);

    res.json({
      storeId,
      categories,
      products,
      suppliers,
      paymentMethods,
      variantGroups,
      variantOptions,
      storeSettings: (storeSettingsRows as Array<unknown>).length > 0
        ? (storeSettingsRows as Array<unknown>)[0]
        : null,
      users,
      transactions,
      transactionItems,
      shifts,
      stockIns,
      stockOuts,
      hppHistory,
      serverTimestamp,
    });
  } catch (err) {
    console.error('[GET /sync/pull]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
