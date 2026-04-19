export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // T05R-R1 diagnostic — identify root source of JSON.parse unhandledRejection.
    // Remove once root cause is fixed and confirmed.
    if (process.env.NODE_ENV !== "production") {
      process.on("unhandledRejection", (reason) => {
        console.error("[unhandledRejection]", reason);
        if (reason instanceof Error) {
          console.error("stack:", reason.stack);
          let cause: unknown = (reason as { cause?: unknown }).cause;
          while (cause) {
            console.error("caused by:", cause);
            cause = (cause as { cause?: unknown })?.cause;
          }
        }
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
