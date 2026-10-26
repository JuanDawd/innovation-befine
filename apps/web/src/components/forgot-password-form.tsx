"use client";

/**
 * ForgotPasswordForm — T017
 *
 * Submits the user's email to Better Auth which generates a reset token
 * and calls sendResetPassword (wired to Resend in auth.ts).
 *
 * Always shows the same "check your email" message whether the account
 * exists or not — prevents email enumeration.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { z } from "zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

const schema = z.object({
  email: z.email("validation.emailInvalid"),
});

type FormInput = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormInput) {
    // forgetPassword exists on the Better Auth client
    await (
      signIn as unknown as {
        forgetPassword: (opts: { email: string; redirectTo: string }) => Promise<void>;
      }
    )
      .forgetPassword?.({ email: data.email, redirectTo: "/reset-password" })
      .catch(() => {
        // Suppress errors — we always show the same success message
      });
    // Always show sent state to prevent email enumeration
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg border border-status-success-foreground/30 bg-status-success px-4 py-3 text-sm text-status-success-foreground">
          {t("resetLinkSent")}
        </p>
        <Link
          href="/login"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    // method="post": a submit before hydration must never put credentials in the URL (H-61).
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="reset-email" className="text-sm font-medium">
          {t("email")}
        </label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? "reset-email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p id="reset-email-error" className="text-sm text-destructive" role="alert">
            {t(errors.email.message as Parameters<typeof t>[0])}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {t("sendResetLink")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
