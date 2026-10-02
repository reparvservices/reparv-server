import dbPromise from "#db/promise";

/**
 * Partner panel features that are unlocked by the partner's plan.
 * Values are subscription_features.name (matched case-insensitively), so admins
 * control access by adding/removing features on a plan in Subscription Pricing.
 * Keep in sync with reparv-project-partner/src/lib/subscriptionLock.js.
 */
export const PARTNER_FEATURES = {
  PROPERTIES: "Unlimited Property Uploading",
  LEADS: "Lead Management System",
  CRM: "CRM Access",
  TEAM: "Team Development Support",
  SITE_VISITS: "Sites Visit",
  COMMUNITY: "Business community",
};

/** Project partner panel APIs -> feature they need (write requests only). */
const PROJECT_PARTNER_API_FEATURES = [
  [/^\/project-partner\/propert/, PARTNER_FEATURES.PROPERTIES],
  [/^\/project-partner\/enquir/, PARTNER_FEATURES.LEADS],
  [/^\/project-partner\/(customers|builders|employees|roles|departments)(\/|$)/, PARTNER_FEATURES.CRM],
  [/^\/project-partner\/(sales|territory)/, PARTNER_FEATURES.TEAM],
  [/^\/project-partner\/calender/, PARTNER_FEATURES.SITE_VISITS],
  // Mobile app (reparv-project-partner-app) — same features as the web panel
  [/^\/projectpartner\/property/, PARTNER_FEATURES.PROPERTIES],
  [/^\/projectpartner\/enquiries/, PARTNER_FEATURES.LEADS],
  [/^\/projectpartner\/(builders|employee|departments|roles)(\/|$)/, PARTNER_FEATURES.CRM],
  [/^\/projectpartner\/partner(\/|$)/, PARTNER_FEATURES.TEAM],
  [/^\/projectpartner\/event(\/|$)/, PARTNER_FEATURES.SITE_VISITS],
];

export function requiredFeatureForApi(path, role) {
  if (role !== "project") return null;
  const hit = PROJECT_PARTNER_API_FEATURES.find(([re]) => re.test(path));
  return hit ? hit[1] : null;
}

const norm = (name) => String(name || "").trim().toLowerCase();

/** Feature names (lowercased) included in the given plans. */
export async function getPlanFeatureNames(planIds) {
  const ids = [...new Set((planIds || []).filter(Boolean).map(Number))];
  if (!ids.length) return new Set();
  const [rows] = await dbPromise.query(
    `SELECT DISTINCT sf.name
     FROM plan_feature_mapping pfm
     JOIN subscription_features sf ON sf.id = pfm.feature_id
     WHERE pfm.plan_id IN (?) AND (sf.status IS NULL OR sf.status = 'Active')`,
    [ids],
  );
  return new Set(rows.map((r) => norm(r.name)));
}

/** Enterprise plans are custom deals and unlock every feature. */
export const isAllFeaturePlan = (planType) =>
  String(planType || "").toLowerCase() === "enterprise";

export function planHasFeature(featureSet, feature) {
  return featureSet.has(norm(feature));
}
