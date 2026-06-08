import moment from "moment-timezone";
import db from "#db/promise";

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

export function calculateLeadScore(purchaseTimeline) {
  const t = String(purchaseTimeline || "").toLowerCase();
  if (!t) return null;

  if (
    /30\s*day|within\s*a\s*month|immediate|asap|this\s*month|urgent/.test(t)
  ) {
    return "hot";
  }
  if (
    /3\s*month|quarter|60\s*day|90\s*day|2\s*month|next\s*month/.test(t)
  ) {
    return "warm";
  }
  if (
    /6\s*month|year|later|no\s*rush|exploring|just\s*looking|cold/.test(t)
  ) {
    return "cold";
  }
  if (/1\s*month|4\s*week/.test(t)) return "hot";
  return "warm";
}

export async function upsertLeadProfile(userId, data) {
  const leadScore =
    data.leadScore || calculateLeadScore(data.purchaseTimeline);
  const ts = now();

  await db.query(
    `INSERT INTO ai_lead_profiles (
      user_id, enquirersid, name, phone, city, budget_min, budget_max,
      property_type, location_preference, home_loan_required, purchase_timeline,
      lead_score, lead_status, assigned_to, metadata, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      enquirersid = COALESCE(VALUES(enquirersid), enquirersid),
      name = COALESCE(VALUES(name), name),
      phone = COALESCE(VALUES(phone), phone),
      city = COALESCE(VALUES(city), city),
      budget_min = COALESCE(VALUES(budget_min), budget_min),
      budget_max = COALESCE(VALUES(budget_max), budget_max),
      property_type = COALESCE(VALUES(property_type), property_type),
      location_preference = COALESCE(VALUES(location_preference), location_preference),
      home_loan_required = COALESCE(VALUES(home_loan_required), home_loan_required),
      purchase_timeline = COALESCE(VALUES(purchase_timeline), purchase_timeline),
      lead_score = COALESCE(VALUES(lead_score), lead_score),
      lead_status = COALESCE(VALUES(lead_status), lead_status),
      assigned_to = COALESCE(VALUES(assigned_to), assigned_to),
      metadata = COALESCE(VALUES(metadata), metadata),
      updated_at = VALUES(updated_at)`,
    [
      userId,
      data.enquirersid || null,
      data.name || null,
      data.phone || null,
      data.city || null,
      data.budgetMin ?? null,
      data.budgetMax ?? null,
      data.propertyType || null,
      data.locationPreference || null,
      data.homeLoanRequired == null ? null : data.homeLoanRequired ? 1 : 0,
      data.purchaseTimeline || null,
      leadScore,
      data.leadStatus || "qualifying",
      data.assignedTo || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      ts,
      ts,
    ],
  );

  const [rows] = await db.query(
    `SELECT * FROM ai_lead_profiles WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

export async function getLeadProfile(userId) {
  const [rows] = await db.query(
    `SELECT * FROM ai_lead_profiles WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

export function formatLeadScoreResponse(profile) {
  if (!profile) return { leadScore: null, leadStatus: "qualifying" };
  return {
    leadScore: profile.lead_score,
    leadStatus: profile.lead_status,
    assignedTo: profile.assigned_to,
    name: profile.name,
    phone: profile.phone,
    city: profile.city,
    budgetMin: profile.budget_min,
    budgetMax: profile.budget_max,
    propertyType: profile.property_type,
    locationPreference: profile.location_preference,
    homeLoanRequired: profile.home_loan_required,
    purchaseTimeline: profile.purchase_timeline,
  };
}
