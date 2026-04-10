/**
 * SSE spike test endpoint — T009
 *
 * Streams a counter event every second for 30 seconds, then closes.
 * The client (EventSource) will automatically reconnect after the stream ends.
 *
 * Vercel Function timeout strategy:
 * - Vercel Hobby/Pro functions have a max execution duration (10s Hobby, 300s Pro).
 * - For long-lived SSE, we close the stream before the timeout and let the
 *   browser's EventSource reconnect automatically (built-in reconnect with
 *   Last-Event-ID header so the server can resume from where it left off).
 * - Production streams in packages/realtime will close every 25s (safe under
 *   any Vercel plan) and clients reconnect seamlessly.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let counter = 0;
  let intervalId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        const idLine = id !== undefined ? `id: ${id}\n` : "";
        const chunk = `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
      };

      // Send an initial connected event
      send("connected", { message: "SSE connection established" });

      // Send a counter tick every second
      intervalId = setInterval(() => {
        counter++;
        send("tick", { counter, timestamp: Date.now() }, counter);

        // Close the stream after 30 events — client reconnects automatically
        if (counter >= 30) {
          clearInterval(intervalId);
          controller.close();
        }
      }, 1000);
    },
    cancel() {
      clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // ⚠ Wildcard CORS — acceptable for this test-only route.
      // Production SSE routes (T098) MUST restrict to the app's origin.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
