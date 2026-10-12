"use client";

import { LoginForm } from "@/components/login-form";

export function LoginShell() {
  return (
    <div className="login-shell">
      <LoginForm />
      <style>{`
        .login-shell label {
          font-family: var(--font-sans);
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          color: var(--brand-stone);
        }
        .login-shell input {
          background: color-mix(in srgb, var(--brand-bone) 4%, transparent) !important;
          border-color: color-mix(in srgb, var(--brand-bone) 12%, transparent) !important;
          color: var(--brand-bone) !important;
          font-family: var(--font-sans);
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }
        .login-shell input:focus {
          border-color: color-mix(in srgb, var(--brand-pink) 50%, transparent) !important;
          outline: none !important;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-pink) 20%, transparent) !important;
        }
        .login-shell input::placeholder {
          color: var(--brand-taupe);
        }
        .login-shell button[type="submit"] {
          background: var(--brand-pink) !important;
          color: #fff !important;
          font-family: var(--font-sans);
          font-weight: 500;
          font-size: 0.875rem;
          letter-spacing: 0.01em;
          border: none !important;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .login-shell button[type="submit"]:hover:not(:disabled) {
          background: var(--brand-pink-soft) !important;
          box-shadow: 0 0 24px color-mix(in srgb, var(--brand-pink) 35%, transparent) !important;
        }
        .login-shell button[type="submit"]:disabled {
          background: color-mix(in srgb, var(--brand-pink) 40%, transparent) !important;
        }
        .login-shell a {
          color: var(--brand-taupe);
          font-family: var(--font-sans);
          font-size: 0.8125rem;
          transition: color 0.2s;
        }
        .login-shell a:hover {
          color: var(--brand-pink);
        }
      `}</style>
    </div>
  );
}
