import { z } from 'zod';

export const LoginSchema = z.object({
  pin: z.string().min(1, 'PIN wajib diisi'),
}).strip();

export const SyncUserSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  pin: z.string().length(64, 'PIN harus berupa SHA-256 hex 64 karakter'),
  role: z.enum(['owner', 'kasir']),
  isActive: z.number().int().min(0).max(1),
}).strip();

export type LoginInput = z.infer<typeof LoginSchema>;
export type SyncUserInput = z.infer<typeof SyncUserSchema>;
