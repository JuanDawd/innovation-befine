"use client";

/**
 * CreateEmployeeForm — T013
 *
 * Form for admin to create a new employee account.
 * Handles conditional fields: stylist subtype (role = stylist),
 * daily rate (role = secretary).
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEmployeeSchema, type CreateEmployeeInput } from "@befine/types";
import { createEmployee } from "@/app/(protected)/admin/employees/actions/create-employee";
import { useState } from "react";

const APP_ROLES = [
  { value: "cashier_admin", labelKey: "cashier_admin" },
  { value: "secretary", labelKey: "secretary" },
  { value: "stylist", labelKey: "stylist" },
  { value: "clothier", labelKey: "clothier" },
] as const;

const STYLIST_SUBTYPES = [
  { value: "hairdresser", labelKey: "hairdresser" },
  { value: "manicurist", labelKey: "manicurist" },
  { value: "masseuse", labelKey: "masseuse" },
  { value: "makeup_artist", labelKey: "makeup_artist" },
  { value: "spa_manager", labelKey: "spa_manager" },
] as const;

interface CreateEmployeeFormProps {
  onSuccess?: (data: { name: string; email: string }) => void;
}

export function CreateEmployeeForm({ onSuccess }: CreateEmployeeFormProps) {
  const t = useTranslations("employees");
  const tRoles = useTranslations("roles");
  const tSubtypes = useTranslations("stylistSubtypes");
  const tCommon = useTranslations("common");

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      expectedWorkDays: 6,
      role: "stylist",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedRole = watch("role");
  const isStyleist = selectedRole === "stylist";
  const isSecretary = selectedRole === "secretary";

  async function onSubmit(data: CreateEmployeeInput) {
    setServerError(null);
    const result = await createEmployee(data);
    if (result.success) {
      reset();
      onSuccess?.({ name: result.data.name, email: result.data.email });
    } else {
      setServerError(result.error.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="emp-name" className="text-sm font-medium">
          {t("name")}
        </label>
        <Input
          id="emp-name"
          type="text"
          placeholder={t("namePlaceholder")}
          autoComplete="name"
          aria-describedby={errors.name ? "emp-name-error" : undefined}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p id="emp-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="emp-email" className="text-sm font-medium">
          {t("email")}
        </label>
        <Input
          id="emp-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          aria-describedby={errors.email ? "emp-email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p id="emp-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <label htmlFor="emp-role" className="text-sm font-medium">
          {t("role")}
        </label>
        <select
          id="emp-role"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
          aria-describedby={errors.role ? "emp-role-error" : undefined}
          aria-invalid={!!errors.role}
          {...register("role")}
        >
          {APP_ROLES.map(({ value }) => (
            <option key={value} value={value}>
              {tRoles(value)}
            </option>
          ))}
        </select>
        {errors.role && (
          <p id="emp-role-error" className="text-sm text-destructive">
            {errors.role.message}
          </p>
        )}
      </div>

      {/* Stylist subtype — only when role = stylist */}
      {isStyleist && (
        <div className="space-y-1.5">
          <label htmlFor="emp-subtype" className="text-sm font-medium">
            {t("stylistSubtype")}
          </label>
          <select
            id="emp-subtype"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
            aria-describedby={errors.stylistSubtype ? "emp-subtype-error" : undefined}
            aria-invalid={!!errors.stylistSubtype}
            {...register("stylistSubtype")}
          >
            <option value="">{t("selectSubtype")}</option>
            {STYLIST_SUBTYPES.map(({ value }) => (
              <option key={value} value={value}>
                {tSubtypes(value)}
              </option>
            ))}
          </select>
          {errors.stylistSubtype && (
            <p id="emp-subtype-error" className="text-sm text-destructive">
              {errors.stylistSubtype.message}
            </p>
          )}
        </div>
      )}

      {/* Daily rate — only when role = secretary */}
      {isSecretary && (
        <div className="space-y-1.5">
          <label htmlFor="emp-daily-rate" className="text-sm font-medium">
            {t("dailyRate")}
          </label>
          <Input
            id="emp-daily-rate"
            type="number"
            min={0}
            step={1}
            placeholder={t("dailyRatePlaceholder")}
            aria-describedby={errors.dailyRate ? "emp-daily-rate-error" : undefined}
            aria-invalid={!!errors.dailyRate}
            {...register("dailyRate", { valueAsNumber: true })}
          />
          {errors.dailyRate && (
            <p id="emp-daily-rate-error" className="text-sm text-destructive">
              {errors.dailyRate.message}
            </p>
          )}
        </div>
      )}

      {/* Expected work days */}
      <div className="space-y-1.5">
        <label htmlFor="emp-work-days" className="text-sm font-medium">
          {t("expectedWorkDays")}
        </label>
        <select
          id="emp-work-days"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          {...register("expectedWorkDays", { valueAsNumber: true })}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Temporary password (pre-T054) */}
      <div className="space-y-1.5">
        <label htmlFor="emp-password" className="text-sm font-medium">
          {t("temporaryPassword")}{" "}
          <span className="text-xs font-normal text-muted-foreground">{tCommon("optional")}</span>
        </label>
        <Input
          id="emp-password"
          type="text"
          autoComplete="new-password"
          aria-describedby={errors.temporaryPassword ? "emp-password-error" : "emp-password-help"}
          aria-invalid={!!errors.temporaryPassword}
          {...register("temporaryPassword")}
        />
        {errors.temporaryPassword ? (
          <p id="emp-password-error" className="text-sm text-destructive">
            {errors.temporaryPassword.message}
          </p>
        ) : (
          <p id="emp-password-help" className="text-xs text-muted-foreground">
            {t("temporaryPasswordHelp")}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {t("createEmployee")}
      </Button>
    </form>
  );
}
