/**
 * App Store Connect subscription products for the partner iOS app.
 * Android continues to use Razorpay — these IDs are iOS-only.
 */
export const IOS_PARTNER_SUBSCRIPTION_PRODUCTS = [
  {
    tier: "Basic",
    productId: "com.reparv.partner.basic.monthly",
    level: 1,
    duration: "1 month",
  },
  {
    tier: "Pro",
    productId: "com.reparv.partner.pro.monthly",
    level: 2,
    duration: "1 month",
  },
  {
    tier: "Premium",
    productId: "com.reparv.partner.premium.monthly",
    level: 3,
    duration: "1 month",
  },
  {
    tier: "Platinum",
    productId: "com.reparv.partner.platinum.monthly",
    level: 4,
    duration: "1 month",
  },
];

const PRODUCT_ID_SET = new Set(
  IOS_PARTNER_SUBSCRIPTION_PRODUCTS.map((p) => p.productId),
);

const TIER_TO_PRODUCT_ID = Object.fromEntries(
  IOS_PARTNER_SUBSCRIPTION_PRODUCTS.map((p) => [p.tier.toLowerCase(), p.productId]),
);

/** Match plan name to App Store product (Basic, Pro, Premium, Platinum). */
export function resolveAppleProductIdFromPlanName(planName, explicitProductId = null) {
  const explicit = String(explicitProductId || "").trim();
  if (explicit) {
    return PRODUCT_ID_SET.has(explicit) ? explicit : explicit;
  }

  const normalized = String(planName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+plan$/i, "")
    .trim();

  return TIER_TO_PRODUCT_ID[normalized] || null;
}

export function isKnownApplePartnerProductId(productId) {
  return PRODUCT_ID_SET.has(String(productId || "").trim());
}

export function getAppleProductTier(productId) {
  const row = IOS_PARTNER_SUBSCRIPTION_PRODUCTS.find(
    (p) => p.productId === String(productId || "").trim(),
  );
  return row?.tier || null;
}
