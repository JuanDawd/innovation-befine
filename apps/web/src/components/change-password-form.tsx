"use client";

/**
 * ChangePasswordForm — T091
 *
 * Self-service password change for any authenticated employee.
 * Verifies current password before accepting the new one.
 * Session stays active on success — no logout required.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/app/(protected)/profile/actions/change-password";

const schema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type FormInput = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormInput) {
    setServerError(null);
    const result = await changePassword(data);
    if (result.success) {
      setSuccess(true);
      reset();
    } else {
      // Distinguish "wrong current password" from generic errors
      if (result.error.code === "INTERNAL_ERROR") {
        setServerError(t("currentPasswordWrong"));
      } else {
        setServerError(result.error.message);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {success && (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
          role="status"
        >
          {t("changePasswordSuccess")}
        </p>
      )}

      {serverError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="current-password" className="text-sm font-medium">
          {t("currentPassword")}
        </label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
          aria-invalid={!!errors.currentPassword}
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p id="current-password-error" className="text-sm text-destructive" role="alert">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-new-password" className="text-sm font-medium">
          {t("newPassword")}
        </label>
        <Input
          id="profile-new-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.newPassword ? "profile-new-password-error" : undefined}
          aria-invalid={!!errors.newPassword}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p id="profile-new-password-error" className="text-sm text-destructive" role="alert">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-confirm-password" className="text-sm font-medium">
          {t("confirmPassword")}
        </label>
        <Input
          id="profile-confirm-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? "profile-confirm-password-error" : undefined}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p id="profile-confirm-password-error" className="text-sm text-destructive" role="alert">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {t("changePassword")}
      </Button>
    </form>
  );
}
