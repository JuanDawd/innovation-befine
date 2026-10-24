import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { accounts, sessions, users, verifications } from "@befine/db/schema";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { BRAND_FULL_NAME } from "@/lib/brand";
import { resolveTrustedOrigins } from "@/lib/trusted-origins";

/**
 * Access control — defines which admin plugin operations each role can perform.
 * This only governs Better Auth's own user-management actions (create user, set role, ban, etc.).
 * App-level business logic permissions are enforced separately in each server action.
 */
const ac = createAccessControl({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

// Only admin can manage users via the admin plugin
const adminRole = ac.newRole({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

// All other roles have no admin plugin permissions
const noAdminRole = ac.newRole({ user: [], session: [] });

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  /** L-48 — derived from BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL / BETTER_AUTH_TRUSTED_ORIGINS. */
  trustedOrigins: resolveTrustedOrigins(process.env),

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
        subject: `Restablecer tu contraseña — ${BRAND_FULL_NAME}`,
        react: PasswordResetEmail({ resetUrl: url, userName: user.name }),
      });
    },
  },

  session: {
    /**
     * 15-day session lifetime — employees stay logged in across work weeks.
     * Sessions are stored in the DB; the token cookie references the session row.
     */
    expiresIn: 60 * 60 * 24 * 15, // 15 days in seconds

    /**
     * cookieCache stores the session payload in an encrypted cookie so
     * auth.api.getSession() reads the cookie instead of hitting the DB.
     * maxAge: 300 — cookie is refreshed every 5 minutes.
     *
     * Trade-off: a deactivated user can act for up to 300s before the DB check
     * forces them out. Handled by session revocation on deactivation (T01R-R1).
     */
    cookieCache: {
      enabled: true,
      maxAge: 300,
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    /**
     * Middleware now uses auth.api.getSession() (cookie-based, no HTTP call)
     * instead of betterFetch which hit /api/auth/get-session on every navigation.
     * Only explicit sign-in, sign-out, and password-reset flows hit the HTTP
     * rate limiter. 100/min is safe for a small team.
     */
    max: 100,
    storage: "memory",
    /**
     * H-46: Better Auth's built-in sign-in rule is 3 req / 10 s per IP. All staff
     * phones share the salon WiFi's public IP, so a shift start (18 people) got
     * 10–12 × 429 in the load test. Size the rule for a full team behind one NAT.
     */
    customRules: {
      "/sign-in/email": { window: 60, max: 30 },
    },
  },

  plugins: [
    admin({
      defaultRole: "stylist",
      adminRoles: ["admin"],
      ac,
      roles: {
        cashier: noAdminRole,
        admin: adminRole,
        secretary: noAdminRole,
        stylist: noAdminRole,
        clothier: noAdminRole,
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
