import { z } from "zod";

export const itemBody = z.object({
  categoryId: z.number().int(),
  name: z.string().max(80),
  description: z.string().max(300),
  priceRupees: z.number().min(0).max(100000),
  isVeg: z.boolean(),
  isBestseller: z.boolean(),
  imageUrl: z.string().max(500).nullable(),
});
