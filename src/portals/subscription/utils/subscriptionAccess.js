/**
 * Partner panel access:
 * - active + before end_date
 * - cancelled at period end only (cancelled + end_date still in future)
 * - immediate cancel → expired + end_date now → no access
 */
export function isPartnerSubscriptionAccessActive(sub) {
  if (!sub) return false;
  const status = String(sub.status || "").toLowerCase();
  const planType = String(sub.plan_type || "").toLowerCase();
  const now = new Date();
  const endOk = !sub.end_date || new Date(sub.end_date) >= now;

  if (status === "active" && endOk) return true;
  if (status === "cancelled" && endOk) return true;
  if (status === "trial" && endOk) return true;
  // Free-trial rows may use plan_type=trial with status active (ENUM-safe) or legacy empty status
  if (planType === "trial" && endOk && (status === "active" || status === "trial" || !status)) {
    return true;
  }
  return false;
}

/**
 * Pick the row that represents a partner's current subscription.
 * A newer pending checkout row must not hide an active paid/trial row,
 * so rows that grant access win (latest end date first); otherwise the newest row.
 * @param {Array} rows user_subscriptions rows (with plan_type when available)
 */
export function pickCurrentSubscription(rows) {
  if (!rows?.length) return null;
  const granting = rows
    .filter((row) => isPartnerSubscriptionAccessActive(row))
    .sort((a, b) => {
      const endA = a.end_date ? new Date(a.end_date).getTime() : Infinity;
      const endB = b.end_date ? new Date(b.end_date).getTime() : Infinity;
      return endB - endA;
    });
  if (granting.length) return granting[0];
  return [...rows].sort((a, b) => {
    const tA = new Date(a.updated_at || a.created_at || 0).getTime();
    const tB = new Date(b.updated_at || b.created_at || 0).getTime();
    return tB - tA || Number(b.id) - Number(a.id);
  })[0];
}
