/** Expected recurring charge (INR) for a subscription row (with optional plan join fields). */
export function getExpectedSubscriptionChargeAmount(subRow) {
  if (!subRow) return null;
  const final = Number(subRow.final_amount ?? subRow.Final_amount);
  if (Number.isFinite(final) && final > 0) return final;
  const planTotal = Number(
    subRow.plan_total_price ?? subRow.plan_price ?? subRow.price ?? subRow.plan_total,
  );
  if (Number.isFinite(planTotal) && planTotal > 0) return planTotal;
  return null;
}

export function paymentMatchesSubscriptionCharge(paymentAmount, expectedAmount, tolerance = 0.01) {
  const paid = Number(paymentAmount);
  const expected = Number(expectedAmount);
  if (!Number.isFinite(paid) || !Number.isFinite(expected) || expected <= 0) return true;
  return Math.abs(paid - expected) <= tolerance;
}
