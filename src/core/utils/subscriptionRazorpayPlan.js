const hasCredentials = () =>
  Boolean(
    process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim(),
  );

function rupeesToPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("totalPrice must be a positive number (INR)");
  }
  const paise = Math.round(n * 100);
  if (paise < 100) {
    throw new Error("Plan amount must be at least ₹1");
  }
  return paise;
}

function truncate(str, max) {
  const s = String(str ?? "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export async function createRazorpayPlanForSubscriptionPlanTable({
  role,
  planName,
  price,
  billingCycle = "monthly",
  duration,
  localPlanId,
}) {
  if (!hasCredentials()) {
    return { planId: null, skipped: true, reason: "Razorpay keys not configured" };
  }

  const cycle = String(billingCycle || "monthly").toLowerCase() === "yearly"
    ? "yearly"
    : "monthly";
  const interval = Math.max(1, Number.parseInt(duration, 10) || 1);
  const amount = rupeesToPaise(price);
  const safeRole = String(role || "").toLowerCase();

  const payload = {
    period: cycle,
    interval,
    item: {
      name: truncate(planName, 64),
      amount,
      currency: "INR",
      description: truncate(
        `${safeRole || "partner"} plan · ${interval} ${cycle}${interval > 1 ? "s" : ""}`,
        200,
      ),
    },
    notes: {
      source: "reparv_admin_subscription_plans",
      ...(localPlanId != null && { local_plan_id: String(localPlanId) }),
      ...(safeRole && { role: safeRole }),
    },
  };

  try {
    const Razorpay = (await import("razorpay")).default;
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const plan = await instance.plans.create(payload);
    const planId = plan?.id;
    if (!planId) throw new Error("Razorpay returned no plan id");
    return { planId, skipped: false };
  } catch (err) {
    const msg =
      err?.error?.description ||
      err?.message ||
      (typeof err === "string" ? err : "Razorpay plan creation failed");
    const e = new Error(msg);
    e.cause = err;
    e.statusCode = err?.statusCode || 502;
    throw e;
  }
}

export { hasCredentials as isRazorpayConfigured };
