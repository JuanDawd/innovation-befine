/**
 * Application roles — matches Better Auth RBAC configuration (T010).
 * Defined early so the type is available across all packages.
 */
export type AppRole = "admin" | "secretary" | "stylist" | "clothier";

export type StylistSubtype =
  | "manicurist"
  | "spa_manager"
  | "hairdresser"
  | "masseuse"
  | "makeup_artist";
