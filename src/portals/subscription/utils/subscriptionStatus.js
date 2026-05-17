/**
 * Map Razorpay subscription entity → local user_subscriptions.status
 * Keeps access active while current_end is still in the future (paid period).
 */
export function mapRazorpaySubscriptionToLocalStatus(rzSubscription) {
  if (!rzSubscription) return "pending";

  const rzStatus = String(rzSubscription.status || "").toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const currentEnd = Number(rzSubscription.current_end) || 0;
  const inPaidPeriod = currentEnd > nowSec;

  if (rzStatus === "cancelled") return "cancelled";
  if (rzStatus === "halted") return "halted";
  if (rzStatus === "pending" || rzStatus === "created") return "pending";
  if (rzStatus === "active" || rzStatus === "authenticated") return "active";

  if (inPaidPeriod && ["completed", "expired", "paused"].includes(rzStatus)) {
    return "active";
  }

  if (rzStatus === "completed") return "expired";
  if (rzStatus === "expired") return "expired";

  return inPaidPeriod ? "active" : "expired";
}

export function isSubscriptionInPaidPeriod(rzSubscription) {
  const currentEnd = Number(rzSubscription?.current_end) || 0;
  return currentEnd > Math.floor(Date.now() / 1000);
}
