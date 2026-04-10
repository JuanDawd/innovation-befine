/**
 * Better Auth browser client — T016
 *
 * Exports are destructured immediately to avoid TS2742 (inferred type references
 * internal Better Auth .mjs paths that can't be named portably).
 *
 * Use these in client components. The admin plugin gives typed user-management actions.
 */

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { env } from "./env";

const client = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  plugins: [adminClient()],
});

export const { signIn, signOut, useSession, admin: adminActions } = client;
