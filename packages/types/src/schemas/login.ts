import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "emailRequired").email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export type LoginInput = z.infer<typeof loginSchema>;
