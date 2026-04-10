"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loginSchema, type LoginInput } from "@befine/types";
import type { AppRole } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

const ROLE_HOME: Record<AppRole, string> = {
  cashier_admin: "/cashier",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setServerError(null);

    const result = await signIn.email({
      email: data.email,
      password: data.password,
    });

    if (result.error) {
      const status = result.error.status;
      if (status === 429) {
        setServerError(t("tooManyAttempts"));
      } else if (status === 401 || status === 403) {
        setServerError(t("invalidCredentials"));
      } else {
        setServerError(t("loginError"));
      }
      return;
    }

    const role = result.data?.user?.role as AppRole | undefined;
    const home = role ? (ROLE_HOME[role] ?? "/") : "/";
    router.push(home);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {/* Email */}
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t("email")}
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {t(errors.email.message as "emailRequired" | "emailInvalid")}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          {t("password")}
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={errors.password ? "password-error" : undefined}
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p id="password-error" className="text-sm text-destructive" role="alert">
            {t(errors.password.message as "passwordRequired")}
          </p>
        )}
      </div>

      {/* Server-level error */}
      {serverError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t("login")}
      </Button>
    </form>
  );
}
