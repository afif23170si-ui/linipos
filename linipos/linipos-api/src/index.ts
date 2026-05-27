import './config'; // validate env vars on startup — must be first import
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { initSocket } from './socket';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import transactionsRouter from './routes/transactions';
import syncRouter from './routes/sync';
import categoriesRouter from './routes/categories';
import storeSettingsRouter from './routes/storeSettings';
import variantGroupsRouter from './routes/variantGroups';
import variantOptionsRouter from './routes/variantOptions';
import paymentMethodsRouter from './routes/paymentMethods';
import suppliersRouter from './routes/suppliers';
import shiftsRouter from './routes/shifts';
import stockInsRouter from './routes/stockIns';
import stockOutsRouter from './routes/stockOuts';

const app = express();
const httpServer = createServer(app);

// Trust Cloudflare/OpenLiteSpeed reverse proxy
app.set('trust proxy', 1);

// ── Socket.IO ─────────────────────────────────────────────────
initSocket(httpServer, config.corsOrigin);

// ── Middleware Stack ──────────────────────────────────────────
app.use(requestLogger);
app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware);

// ── Health Check (no auth) ────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/products', productsRouter);
app.use('/transactions', transactionsRouter);
app.use('/sync', syncRouter);
app.use('/categories', categoriesRouter);
app.use('/store-settings', storeSettingsRouter);
app.use('/variant-groups', variantGroupsRouter);
app.use('/variant-options', variantOptionsRouter);
app.use('/payment-methods', paymentMethodsRouter);
app.use('/suppliers', suppliersRouter);
app.use('/shifts', shiftsRouter);
app.use('/stock-ins', stockInsRouter);
app.use('/stock-outs', stockOutsRouter);

// ── 404 Handler ───────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}`, err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log(`[linipos-api] Server running on port ${PORT}`);
});

export { app };
