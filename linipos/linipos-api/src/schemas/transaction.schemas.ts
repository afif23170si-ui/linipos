import { z } from 'zod';

const TransactionItemSchema = z.object({
  productId: z.number().int().nonnegative(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  hpp: z.number().nonnegative(),
  discountType: z.enum(['percentage', 'nominal']).nullable().optional(),
  discountValue: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  subtotal: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
  variantOptionId: z.number().int().nullable().optional(),
  variantName: z.string().nullable().optional(),
}).strip();

export const TransactionCreateSchema = z.object({
  subtotal: z.number().nonnegative(),
  discountType: z.enum(['percentage', 'nominal']).nullable().optional(),
  discountValue: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  paymentMethodId: z.number().int().nonnegative(),
  paymentAmount: z.number().nonnegative(),
  change: z.number().default(0),
  profit: z.number().default(0),
  date: z.string(),
  receiptNumber: z.string().min(1),
  status: z.enum(['open', 'completed']).default('completed'),
  type: z.enum(['sale', 'refund']).default('sale'),
  refundOf: z.string().nullable().optional(),
  refundReason: z.string().nullable().optional(),
  orderNumber: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  tableNumber: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  openedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  userName: z.string().nullable().optional(),
  shiftId: z.number().int().nullable().optional(),
  items: z.array(TransactionItemSchema).min(1, 'items tidak boleh kosong'),
}).strip();

export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>;
