import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface JwtPayload {
  userId?: number;
  accountId?: number;
  storeId?: number;
  role: string;
  deviceId?: string;
}

const SKIP_PATHS = ['/health'];
const SKIP_PREFIXES = ['/auth/'];
// Endpoints yang bisa optional auth (JWT di-parse kalau ada, tapi tidak required)
const OPTIONAL_AUTH_PATHS = ['/auth/sync-user'];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Optional auth — parse JWT kalau ada tapi tidak required
  if (OPTIONAL_AUTH_PATHS.includes(req.path)) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
        req.user = {
          userId: decoded.userId ?? decoded.accountId ?? 0,
          role: decoded.role,
          deviceId: decoded.deviceId ?? 'unknown',
          storeId: decoded.storeId,
        };
      } catch { /* ignore — optional */ }
    }
    next();
    return;
  }

  // Skip auth sepenuhnya untuk /health dan /auth/*
  if (SKIP_PATHS.includes(req.path) || SKIP_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token tidak ditemukan' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = {
      userId: decoded.userId ?? decoded.accountId ?? 0,
      role: decoded.role,
      deviceId: decoded.deviceId ?? 'unknown',
      storeId: decoded.storeId,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token kedaluwarsa' });
    } else {
      res.status(401).json({ error: 'Token tidak valid' });
    }
  }
}
