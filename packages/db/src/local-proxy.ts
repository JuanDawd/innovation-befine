import { neonConfig } from "@neondatabase/serverless";

/**
 * M-71 — NEON_LOCAL_PROXY=1 routes the Neon drivers (HTTP and WebSocket)
 * through a local proxy (ghcr.io/timowilhelm/local-neon-http-proxy on :4444)
 * in front of a plain Postgres — for E2E and local dev without a Neon branch.
 * Start one with scripts/test-db.sh. Never set in Vercel.
 */
export function configureLocalNeonProxy(): void {
  if (process.env.NEON_LOCAL_PROXY !== "1") return;
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
