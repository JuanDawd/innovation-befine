import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("emailInvalid").min(1, "emailRequired"),
  password: z.string().min(1, "passwordRequired"),
});

export type LoginInput = z.infer<typeof loginSchema>;
