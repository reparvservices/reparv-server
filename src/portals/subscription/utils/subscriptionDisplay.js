/**
 * Admin / API display helpers for user_subscriptions rows.
 */

export function formatSubscriptionPlanPeriod(planType, duration, billingCycle) {
  const d = Math.max(1, Number.parseInt(duration, 10) || 1);
  const pt = String(planType || "").toLowerCase();
  const cycle = String(billingCycle || "").toLowerCase();

  if (pt === "trial") {
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (cycle === "yearly") {
    return `${d} year${d === 1 ? "" : "s"}`;
  }
  return `${d} month${d === 1 ? "" : "s"}`;
}

/** Status shown in admin UI (trial plans may be stored as status active). */
export function resolveSubscriptionDisplayStatus(status, planType, endDate) {
  const s = String(status || "").toLowerCase();
  const pt = String(planType || "").toLowerCase();
  const end = endDate ? new Date(endDate) : null;
  const endValid = end && !Number.isNaN(end.getTime());
  const stillValid = !endValid || end >= new Date();

  if (pt === "trial") {
    if (!s || s === "active" || s === "trial") {
      return stillValid ? "trial" : "expired";
    }
    if (s === "cancelled" && stillValid) return "cancelled";
    return s;
  }

  if (!s && stillValid) return "active";
  return s || "pending";
}

export function formatPaymentTypeLabel(paymentType, planType) {
  const pt = String(planType || "").toLowerCase();
  const pay = String(paymentType || "").toLowerCase();
  if (pt === "trial") return "Free trial";
  if (pay === "auto") return "Razorpay autopay";
  if (pay === "manual") return "Manual";
  return pay || "—";
}

/** Admin-assigned enterprise plan only (not trial/pending checkout manual rows). */
export function isEnterprisePlanSubscription(row) {
  if (!row) return false;
  if (row.is_enterprise === true) return true;
  return String(row.plan_type || "").toLowerCase() === "enterprise";
}

export function shapeUserSubscriptionRow(row) {
  const planType = String(row.plan_type || "paid").toLowerCase();
  return {
    ...row,
    plan_type: planType,
    display_status: resolveSubscriptionDisplayStatus(
      row.status,
      planType,
      row.end_date,
    ),
    plan_period_label: formatSubscriptionPlanPeriod(
      planType,
      row.plan_duration,
      row.billing_cycle,
    ),
    payment_label: formatPaymentTypeLabel(row.payment_type, planType),
    is_trial: planType === "trial",
    is_enterprise: planType === "enterprise",
  };
}
