"use client";

/**
 * SetNewPasswordForm — T017
 *
 * Accepts the token from the reset email URL and lets the user set a new password.
 * Calls Better Auth's resetPassword method with the token.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

const schema = z
  .object({
    newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type FormInput = z.infer<typeof schema>;

interface SetNewPasswordFormProps {
  token: string;
}

export function SetNewPasswordForm({ token }: SetNewPasswordFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormInput) {
    setServerError(null);
    const client = signIn as unknown as {
      resetPassword: (opts: {
        newPassword: string;
        token: string;
      }) => Promise<{ error?: { message?: string } | null }>;
    };

    const result = await client.resetPassword?.({ newPassword: data.newPassword, token });
    if (result?.error) {
      setServerError(t("resetTokenInvalid"));
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          {t("resetSuccess")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">
          {t("newPassword")}
        </label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.newPassword ? "new-password-error" : undefined}
          aria-invalid={!!errors.newPassword}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p id="new-password-error" className="text-sm text-destructive" role="alert">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">
          {t("confirmPassword")}
        </label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p id="confirm-password-error" className="text-sm text-destructive" role="alert">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {t("setNewPassword")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
