/**
 * Derive admin partner-list filter bucket from subscription + legacy fields.
 */
export const computeSubscriptionBucket = (row) => {
  const paymentstatus = row.paymentstatus;
  const loginstatus = row.loginstatus;

  if (paymentstatus === "Follow Up" && loginstatus === "Inactive") {
    return "Follow Up";
  }

  const status = String(row.subscription_status || "").toLowerCase();
  const planType = String(row.subscription_plan_type || "").toLowerCase();
  const endRaw = row.subscription_end_date;
  const endDate = endRaw ? new Date(endRaw) : null;
  const now = new Date();
  const hasValidEnd = endDate && !Number.isNaN(endDate.getTime());
  const isActiveEnd = hasValidEnd && endDate >= now;

  if (
    status === "active" &&
    isActiveEnd &&
    (planType === "paid" || planType === "enterprise")
  ) {
    return "Paid";
  }

  if (
    status === "trial" ||
    (status === "active" && planType === "trial" && isActiveEnd) ||
    row.freeProjectPartner === "Active"
  ) {
    return "Free";
  }

  return "Unpaid";
};

export const enrichPartnerWithSubscription = (partner, subscription) => {
  const sub = subscription || {};
  const enriched = {
    ...partner,
    subscription_status: sub.status || null,
    subscription_plan_name: sub.plan_name || null,
    subscription_billing_cycle: sub.billing_cycle || null,
    subscription_plan_type: sub.plan_type || null,
    subscription_end_date: sub.end_date || null,
    subscription_start_date: sub.start_date || null,
  };
  enriched.subscription_bucket = computeSubscriptionBucket(enriched);
  return enriched;
};
