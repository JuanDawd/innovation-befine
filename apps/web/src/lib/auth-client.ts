/**
 * Better Auth browser client — T016
 *
 * Exports are destructured immediately to avoid TS2742 (inferred type references
 * internal Better Auth .mjs paths that can't be named portably).
 *
 * Use these in client components. The admin plugin gives typed user-management actions.
 *
 * Note: baseURL is intentionally omitted so Better Auth uses the current page origin.
 * This avoids CORS issues when the dev server runs on a non-default port (e.g. 3002).
 * In production, Better Auth defaults to the same origin as the app.
 */

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

const client = createAuthClient({
  plugins: [adminClient()],
});

export const { signIn, signOut, useSession, admin: adminActions } = client;
