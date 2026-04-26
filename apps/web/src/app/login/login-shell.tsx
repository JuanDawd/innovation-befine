"use client";

import { LoginForm } from "@/components/login-form";

export function LoginShell() {
  return (
    <div className="login-shell">
      <LoginForm />
      <style>{`
        .login-shell label {
          font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          color: #b8b0a3;
        }
        .login-shell input {
          background: rgba(242,236,225,0.04) !important;
          border-color: rgba(242,236,225,0.12) !important;
          color: #f2ece1 !important;
          font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }
        .login-shell input:focus {
          border-color: rgba(233,64,142,0.5) !important;
          outline: none !important;
          box-shadow: 0 0 0 1px rgba(233,64,142,0.2) !important;
        }
        .login-shell input::placeholder {
          color: #4a4640;
        }
        .login-shell button[type="submit"] {
          background: #E9408E !important;
          color: #fff !important;
          font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
          font-weight: 500;
          font-size: 0.875rem;
          letter-spacing: 0.01em;
          border: none !important;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .login-shell button[type="submit"]:hover:not(:disabled) {
          background: #f06aa5 !important;
          box-shadow: 0 0 24px rgba(233,64,142,0.35) !important;
        }
        .login-shell button[type="submit"]:disabled {
          background: rgba(233,64,142,0.4) !important;
        }
        .login-shell a {
          color: #4a4640;
          font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
          font-size: 0.8125rem;
          transition: color 0.2s;
        }
        .login-shell a:hover {
          color: #E9408E;
        }
      `}</style>
    </div>
  );
}
