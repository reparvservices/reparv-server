/** Compute subscription end date from plan duration and billing cycle. */
export const addPlanDuration = (startDate, duration, billingCycle) => {
  const end = new Date(startDate);
  const d = Math.max(1, Number(duration) || 1);
  if (String(billingCycle).toLowerCase() === "yearly") {
    end.setFullYear(end.getFullYear() + d);
  } else {
    end.setMonth(end.getMonth() + d);
  }
  return end;
};
