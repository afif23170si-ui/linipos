import { z } from 'zod';

export const ProductSchema = z.object({
  name: z.string().min(1, 'Nama produk wajib diisi'),
  sku: z.string().min(1, 'SKU wajib diisi'),
  categoryId: z.number().int().nonnegative(),
  price: z.number().nonnegative(),
  hpp: z.number().nonnegative(),
  stock: z.number().int(),
  unit: z.string().default('pcs'),
  photo: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  unlimitedStock: z.number().int().min(0).max(1).default(0),
  barcode: z.string().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.number().int().min(0).max(1).default(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  isDeleted: z.number().int().min(0).max(1).default(0),
  deletedAt: z.string().nullable().optional(),
}).strip();

export const ProductPartialSchema = ProductSchema.partial();

export const ProductBatchSchema = z.object({
  products: z.array(ProductSchema).min(1, 'Array produk tidak boleh kosong'),
}).strip();

export type ProductInput = z.infer<typeof ProductSchema>;
export type ProductBatchInput = z.infer<typeof ProductBatchSchema>;
