import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  name: z.string().min(1, 'Nama wajib diisi').max(100),
}).strip();

export const LoginEmailSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
}).strip();

export const LoginPinSchema = z.object({
  pin: z.string().min(1, 'PIN wajib diisi'),
  storeId: z.number().int().positive(),
}).strip();

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginEmailInput = z.infer<typeof LoginEmailSchema>;
export type LoginPinInput = z.infer<typeof LoginPinSchema>;
