import type { MetadataRoute } from "next";

/**
 * M-50 — internal app: nothing to index. Served as a real text file (and
 * public in middleware) so crawlers don't get the login page's HTML instead.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
