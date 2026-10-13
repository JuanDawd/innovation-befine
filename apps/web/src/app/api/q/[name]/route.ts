/**
 * GET /api/q/:name — parallel read endpoint for client queries (M-64).
 * See lib/query-registry.ts. Auth: middleware requires a session
 * (AUTHENTICATED_API_PATHS); each query enforces its own role check.
 */
export const dynamic = "force-dynamic";

import { QUERIES, type QueryName } from "@/lib/query-registry";
import { encodeWire } from "@/lib/query-wire";

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!Object.hasOwn(QUERIES, name)) {
    return new Response(
      encodeWire({ success: false, error: { code: "NOT_FOUND", message: "Consulta desconocida" } }),
      { status: 404, headers: HEADERS },
    );
  }
  const result = await QUERIES[name as QueryName](new URL(request.url).searchParams);
  return new Response(encodeWire(result), { headers: HEADERS });
}
