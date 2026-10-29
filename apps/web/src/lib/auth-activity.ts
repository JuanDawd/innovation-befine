/**
 * Sign-in / sign-out / failed sign-in → activity_log — T114 (spec §3.9.27)
 *
 * Better Auth hooks. Sign-in and failed attempts are read after the endpoint
 * ran (success has ctx.context.newSession, failure returns an APIError);
 * sign-out is read before, while the session still exists.
 *
 * Logging must never block authentication: errors are reported, not thrown.
 *
 * Every session read (/get-session, incl. server-side auth.api.getSession)
 * also tags the request's Sentry scope with the user — id and role only, never
 * name or email.
 */

import * as Sentry from "@sentry/nextjs";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { getTxDb } from "@/lib/db";
import { reportError } from "@/lib/observability";
import { deviceOf, logActivity, type ActivityEntry } from "@/lib/activity";

const SIGN_IN_PATH = "/sign-in/email";
const SIGN_OUT_PATH = "/sign-out";
const GET_SESSION_PATH = "/get-session";

type AuthUser = { id: string; role?: string | null };

async function record(entry: ActivityEntry): Promise<void> {
  try {
    await getTxDb().transaction((tx) => logActivity(tx, entry));
  } catch (err) {
    reportError(err, "authActivity", { activity: entry.action });
  }
}

export const authActivityBefore = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_OUT_PATH) return;
  const session = await getSessionFromCtx(ctx).catch(() => null);
  if (!session) return;
  const user = session.user as AuthUser;
  await record({
    actor: { userId: user.id, role: user.role ?? null },
    action: "auth.sign_out",
    entityType: "user",
    entityId: user.id,
    ...deviceOf(ctx.headers),
  });
});

function tagSentryUser(returned: unknown): void {
  const user = (returned as { user?: AuthUser } | null | undefined)?.user;
  if (!user?.id) return;
  Sentry.setUser({ id: user.id, role: user.role ?? undefined });
  Sentry.setTag("role", user.role ?? "unknown");
}

export const authActivityAfter = createAuthMiddleware(async (ctx) => {
  if (ctx.path === GET_SESSION_PATH) {
    tagSentryUser(ctx.context.returned);
    return;
  }
  if (ctx.path !== SIGN_IN_PATH) return;
  const device = deviceOf(ctx.headers);
  const returned = ctx.context.returned;

  if (isAPIError(returned)) {
    const email =
      typeof (ctx.body as { email?: unknown } | undefined)?.email === "string"
        ? (ctx.body as { email: string }).email.trim().toLowerCase().slice(0, 200)
        : null;
    await record({
      actor: { userId: null, role: null },
      action: "auth.sign_in_failed",
      entityType: "user",
      data: { email },
      after: { email, status: returned.statusCode },
      ...device,
    });
    return;
  }

  const user = ctx.context.newSession?.user as AuthUser | undefined;
  if (!user) return;
  await record({
    actor: { userId: user.id, role: user.role ?? null },
    action: "auth.sign_in",
    entityType: "user",
    entityId: user.id,
    ...device,
  });
});
