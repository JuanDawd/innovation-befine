/**
 * Closed ticket history (cashier view) — T092
 *
 * Delegates to the same component and actions as the admin history page.
 * Cashier_admin role has access to both /cashier and /admin prefixes.
 */

export { default } from "@/app/(protected)/admin/tickets/history/page";
