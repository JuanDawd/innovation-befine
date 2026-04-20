import { z } from "zod";

export const analyticsPeriodSchema = z.enum(["day", "week", "month"]);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

export const analyticsQuerySchema = z.object({
  period: analyticsPeriodSchema,
  includeInactive: z.boolean().optional().default(false),
});

export const employeeDrillDownSchema = z.object({
  employeeId: z.string().uuid("ID de empleado inválido"),
  period: analyticsPeriodSchema,
  includeInactive: z.boolean().optional().default(false),
});
