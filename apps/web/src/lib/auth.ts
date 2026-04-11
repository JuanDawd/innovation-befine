import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { accounts, sessions, users, verifications } from "@befine/db/schema";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { PasswordResetEmail } from "@/emails/password-reset";

/**
 * Access control — defines which admin plugin operations each role can perform.
 * This only governs Better Auth's own user-management actions (create user, set role, ban, etc.).
 * App-level business logic permissions are enforced separately in each server action.
 */
const ac = createAccessControl({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

// Only cashier_admin can manage users via the admin plugin
const cashierAdminRole = ac.newRole({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

// All other roles have no admin plugin permissions
const noAdminRole = ac.newRole({ user: [], session: [] });

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  /**
   * Allow all localhost ports in development so the dev server can run on
   * any available port (3000, 3001, 3002, …) without CORS errors.
   * In production this is locked to the single production URL via BETTER_AUTH_URL.
   */
  trustedOrigins:
    process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3003",
        ]
      : ["https://innovation-befine.vercel.app"],

  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Admin creates all accounts — no self-registration
    disableSignUp: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Restablecer tu contraseña — Innovation Befine",
        react: PasswordResetEmail({ resetUrl: url, userName: user.name }),
      });
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "memory",
  },

  plugins: [
    admin({
      defaultRole: "stylist",
      adminRoles: ["cashier_admin"],
      ac,
      roles: {
        cashier_admin: cashierAdminRole,
        secretary: noAdminRole,
        stylist: noAdminRole,
        clothier: noAdminRole,
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
