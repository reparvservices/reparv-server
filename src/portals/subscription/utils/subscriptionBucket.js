import {
  formatSubscriptionPlanPeriod,
  resolveSubscriptionDisplayStatus,
} from "./subscriptionDisplay.js";

/**
 * Admin partner-list filter bucket aligned with user_subscriptions.
 */
export const computePartnerFilterBucket = (row) => {
  if (row.paymentstatus === "Follow Up" && row.loginstatus === "Inactive") {
    return "Follow Up";
  }

  const status = String(row.subscription_status || "").toLowerCase();
  const planType = String(row.subscription_plan_type || "").toLowerCase();
  const hasSub = Boolean(
    status || planType || row.subscription_plan_name || row.subscription_id,
  );

  if (!hasSub) {
    if (row.freeProjectPartner === "Active") return "Trial";
    if (row.paymentstatus === "Success") return "Paid";
    return "Unpaid";
  }

  const displayStatus = resolveSubscriptionDisplayStatus(
    status,
    planType,
    row.subscription_end_date,
  );

  if (planType === "enterprise") return "Enterprise";
  if (displayStatus === "trial" || planType === "trial") return "Trial";
  if (displayStatus === "pending") return "Pending";
  if (displayStatus === "expired") return "Expired";
  if (displayStatus === "cancelled") return "Cancelled";
  if (displayStatus === "halted") return "Halted";
  if (displayStatus === "active" && planType === "paid") return "Paid";

  return "Unpaid";
};

/** @deprecated use computePartnerFilterBucket */
export const computeSubscriptionBucket = computePartnerFilterBucket;

export const enrichPartnerWithSubscription = (partner, subscription) => {
  const sub = subscription || {};
  const planType = String(sub.plan_type || "").toLowerCase();
  const enriched = {
    ...partner,
    subscription_id: sub.id ?? null,
    subscription_status: sub.status || null,
    subscription_plan_name: sub.plan_name || null,
    subscription_billing_cycle: sub.billing_cycle || null,
    subscription_plan_type: sub.plan_type || null,
    subscription_plan_duration: sub.plan_duration ?? null,
    subscription_end_date: sub.end_date || null,
    subscription_start_date: sub.start_date || null,
    subscription_final_amount: sub.final_amount ?? null,
  };

  enriched.subscription_display_status = resolveSubscriptionDisplayStatus(
    enriched.subscription_status,
    planType,
    enriched.subscription_end_date,
  );
  enriched.subscription_plan_period_label = formatSubscriptionPlanPeriod(
    planType,
    enriched.subscription_plan_duration,
    enriched.subscription_billing_cycle,
  );
  enriched.subscription_is_trial = planType === "trial";
  enriched.subscription_is_enterprise = planType === "enterprise";
  enriched.subscription_filter = computePartnerFilterBucket(enriched);
  enriched.subscription_bucket = enriched.subscription_filter;

  return enriched;
};
