import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from './config';

let io: SocketIOServer | null = null;

interface JwtPayload {
  userId?: number;
  accountId?: number;
  storeId?: number;
  role?: string;
}

/**
 * Inisialisasi Socket.IO dengan room per storeId.
 * Setiap client join room `store-{storeId}` saat connect.
 * Broadcast hanya dikirim ke room yang sesuai — isolasi multi-tenant.
 */
export function initSocket(httpServer: HttpServer, corsOrigin: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    path: '/socket.io/',
    allowEIO3: true,
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    // Client harus join room store mereka — kirim event 'join-store' dengan JWT
    socket.on('join-store', (token: string) => {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
        const storeId = payload.storeId;
        if (storeId) {
          const room = `store-${storeId}`;
          socket.join(room);
          console.log(`[socket] ${socket.id} joined room ${room}`);
          // Konfirmasi ke client
          socket.emit('store-joined', { storeId, room });
        }
      } catch {
        // Token invalid — client tidak masuk room manapun, tidak akan dapat broadcast
        console.warn(`[socket] ${socket.id} join-store failed: invalid token`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[socket] Socket.IO server initialized (per-store rooms)');
  return io;
}

/**
 * Broadcast data change HANYA ke room store yang sesuai.
 * Client di toko lain TIDAK akan menerima event ini.
 * @param storeId - ID toko pemilik data. Jika null, broadcast ke semua (fallback).
 */
export function broadcastChange(
  table: string,
  action: 'upsert' | 'delete',
  data: unknown,
  storeId?: number | null,
): void {
  if (!io) return;

  const payload = { table, action, data, ts: new Date().toISOString() };

  if (storeId) {
    // Kirim HANYA ke store yang sesuai
    io.to(`store-${storeId}`).emit('data-changed', payload);
  } else {
    // Fallback: broadcast ke semua (tidak boleh dipakai untuk data user)
    io.emit('data-changed', payload);
  }
}

export function getIO(): SocketIOServer | null {
  return io;
}
