/**
 * Partner panel access:
 * - active + before end_date
 * - cancelled at period end only (cancelled + end_date still in future)
 * - immediate cancel → expired + end_date now → no access
 */
export function isPartnerSubscriptionAccessActive(sub) {
  if (!sub) return false;
  const status = String(sub.status || "").toLowerCase();
  const now = new Date();
  const endOk = !sub.end_date || new Date(sub.end_date) >= now;

  if (status === "active" && endOk) return true;
  if (status === "cancelled" && endOk) return true;
  if (status === "trial" && endOk) return true;
  return false;
}
