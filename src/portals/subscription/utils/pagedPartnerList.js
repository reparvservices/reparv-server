import dbPromise from "#db/promise";
import moment from "moment-timezone";
import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "./userSubscriptionCanonical.js";
import { PLAN_TYPE_SELECT_SQL } from "./planTypeSql.js";
import { attachSubscriptionsToPartners } from "./partnerSubscriptionAttach.js";
import { fetchLatestFollowUps } from "./latestFollowUps.js";

/**
 * Server-side paginated list for sales / territory partners.
 * Filters and counts run in SQL; the latest follow-up and subscription
 * details are only looked up for the rows on the requested page.
 */
const CONFIG = {
  sales: {
    table: "salespersons",
    idCol: "salespersonsid",
    followUpRole: "Sales Person",
    subscriptionRole: "sales",
  },
  territory: {
    table: "territorypartner",
    idCol: "id",
    followUpRole: "Territory Partner",
    subscriptionRole: "territory",
  },
};

// Never sent to the admin list
const HIDDEN_FIELDS = [
  "password",
  "otp",
  "bankname",
  "accountholdername",
  "accountnumber",
  "ifsc",
  "onesignalid",
];

const REQUEST_SQL = `(t.changeProjectPartnerReason IS NOT NULL AND t.changeProjectPartnerReason <> '')`;
const FOLLOW_UP_SQL = `(t.paymentstatus = 'Follow Up' AND t.loginstatus = 'Inactive')`;

// Same precedence as the admin's resolvePartnerFilterStatus:
// change request > follow up > subscription > payment status
const BUCKET_SQL = `
  CASE
    WHEN ${REQUEST_SQL} THEN 'Partner Change Request'
    WHEN ${FOLLOW_UP_SQL} THEN 'Follow Up'
    WHEN sub.user_id IS NULL AND t.paymentstatus = 'Success' THEN 'Paid'
    WHEN sub.user_id IS NULL THEN 'Unpaid'
    WHEN LOWER(sub.plan_type) = 'enterprise' THEN 'Enterprise'
    WHEN LOWER(sub.plan_type) = 'trial' OR LOWER(sub.status) = 'trial' THEN 'Trial'
    WHEN LOWER(sub.status) = 'pending' THEN 'Pending'
    WHEN LOWER(sub.status) = 'active' AND LOWER(sub.plan_type) = 'paid'
      AND (sub.end_date IS NULL OR sub.end_date >= NOW()) THEN 'Paid'
    ELSE 'Unpaid'
  END`;

// Chip labels the admin sends -> bucket names ("Free" is the legacy label for Trial)
const FILTER_ALIASES = { Free: "Trial" };
const KNOWN_BUCKETS = [
  "Partner Change Request",
  "Follow Up",
  "Paid",
  "Unpaid",
  "Enterprise",
  "Trial",
  "Pending",
];

const scopeSql = (lister) => {
  if (lister === "Project Partner") {
    return `(t.projectpartnerid IS NOT NULL AND t.projectpartnerid <> '')`;
  }
  if (lister === "Reparv") {
    return `((t.partneradder IS NULL OR t.partneradder = '')
      AND (t.projectpartnerid IS NULL OR t.projectpartnerid = ''))`;
  }
  return "";
};

const formatDate = (value) =>
  value
    ? moment.utc(value).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
    : null;

export async function listPartnersPaged(kind, query) {
  const cfg = CONFIG[kind];
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 200);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const search = String(query.search || "").trim();
  const lister = String(query.lister || "").trim();
  const rawFilter = String(query.filter || "").trim();
  const filter = FILTER_ALIASES[rawFilter] || rawFilter;

  const fromSql = `
    FROM ${cfg.table} t
    LEFT JOIN (
      SELECT us.user_id, us.status, us.end_date, ${PLAN_TYPE_SELECT_SQL} AS plan_type
      FROM user_subscriptions us
      INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.role = ?
    ) sub ON sub.user_id = t.${cfg.idCol}`;
  const fromParams = [cfg.subscriptionRole];

  // Filters shared by the list and the chip counts (everything except the bucket)
  const baseWhere = [];
  const baseParams = [];
  const scope = scopeSql(lister);
  if (scope) baseWhere.push(scope);
  if (search) {
    const like = `%${search}%`;
    baseWhere.push(`(t.fullname LIKE ? OR t.contact LIKE ? OR t.email LIKE ?
      OR t.city LIKE ? OR t.state LIKE ? OR t.username LIKE ? OR t.${cfg.idCol} = ?)`);
    baseParams.push(like, like, like, like, like, like, Number(search) || -1);
  }
  if (query.date_from) {
    baseWhere.push("t.created_at >= ?");
    baseParams.push(`${query.date_from} 00:00:00`);
  }
  if (query.date_to) {
    baseWhere.push("t.created_at <= ?");
    baseParams.push(`${query.date_to} 23:59:59`);
  }

  const listWhere = [...baseWhere];
  const listParams = [...baseParams];
  if (KNOWN_BUCKETS.includes(filter)) {
    listWhere.push(`(${BUCKET_SQL}) = ?`);
    listParams.push(filter);
  }

  const whereSql = (parts) => (parts.length ? `WHERE ${parts.join(" AND ")}` : "");

  const [[rows], [[{ total }]], [bucketRows]] = await Promise.all([
    dbPromise.query(
      `SELECT t.*,
          pp.fullname AS projectPartnerName,
          pp.contact AS projectPartnerContact
        ${fromSql}
        LEFT JOIN projectpartner pp ON pp.id = t.projectpartnerid
        ${whereSql(listWhere)}
        ORDER BY t.created_at DESC, t.${cfg.idCol} DESC
        LIMIT ? OFFSET ?`,
      [...fromParams, ...listParams, limit, offset],
    ),
    dbPromise.query(
      `SELECT COUNT(*) AS total ${fromSql} ${whereSql(listWhere)}`,
      [...fromParams, ...listParams],
    ),
    dbPromise.query(
      `SELECT ${BUCKET_SQL} AS bucket, COUNT(*) AS n
        ${fromSql} ${whereSql(baseWhere)}
        GROUP BY bucket`,
      [...fromParams, ...baseParams],
    ),
  ]);

  const byBucket = Object.fromEntries(bucketRows.map((r) => [r.bucket, Number(r.n) || 0]));
  const all = Object.values(byBucket).reduce((a, b) => a + b, 0);
  // Keys match the admin PartnerFilter countKey values
  const counts = {
    All: all,
    Unpaid: byBucket.Unpaid || 0,
    FollowUp: byBucket["Follow Up"] || 0,
    Paid: byBucket.Paid || 0,
    Trial: byBucket.Trial || 0,
    Free: byBucket.Trial || 0,
    Enterprise: byBucket.Enterprise || 0,
    Pending: byBucket.Pending || 0,
    Request: byBucket["Partner Change Request"] || 0,
  };

  const followUps = await fetchLatestFollowUps(
    cfg.followUpRole,
    rows.map((row) => row[cfg.idCol]),
  );

  const formatted = rows.map((row) => {
    const latest = followUps.get(Number(row[cfg.idCol]));
    const clean = { ...row };
    HIDDEN_FIELDS.forEach((f) => delete clean[f]);
    return {
      ...clean,
      created_at: formatDate(row.created_at),
      updated_at: formatDate(row.updated_at),
      followUp: latest?.followUp || null,
      followUpDate: latest?.created_at
        ? moment(latest.created_at).format("DD MMM YYYY | hh:mm A")
        : null,
    };
  });

  const data = await attachSubscriptionsToPartners(
    formatted,
    cfg.subscriptionRole,
    (row) => row[cfg.idCol],
  );

  return { data, total: Number(total) || 0, limit, offset, counts };
}
