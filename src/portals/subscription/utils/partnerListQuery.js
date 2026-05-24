import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "./userSubscriptionCanonical.js";
import { PLAN_TYPE_SELECT_SQL } from "./planTypeSql.js";

const REPARY_SCOPE_SQL = `(pp.partneradder IS NULL OR pp.partneradder = '')`;

const FOLLOW_UP_SQL = `(pp.paymentstatus = 'Follow Up' AND pp.loginstatus = 'Inactive')`;

const LATEST_FOLLOWUP_JOIN = `
  LEFT JOIN (
    SELECT p1.partnerId, p1.followUp, p1.created_at AS followUpDate
    FROM partnerFollowup p1
    INNER JOIN (
      SELECT partnerId, MAX(created_at) AS latest
      FROM partnerFollowup
      WHERE role = 'Project Partner'
      GROUP BY partnerId
    ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
    WHERE p1.role = 'Project Partner'
  ) pf ON pf.partnerId = pp.id
`;

/** Canonical project subscription per partner (one row per user_id). */
export const CANONICAL_SUB_JOIN_SQL = `
  LEFT JOIN (
    SELECT
      us.id,
      us.user_id,
      us.status,
      us.start_date,
      us.end_date,
      us.final_amount,
      sp.plan_name,
      sp.billing_cycle,
      sp.duration AS plan_duration,
      ${PLAN_TYPE_SELECT_SQL} AS plan_type
    FROM user_subscriptions us
    INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.role = 'project'
  ) sub ON sub.user_id = pp.id
`;

export const PARTNER_LIST_FROM_SQL = `
  FROM projectpartner pp
  ${LATEST_FOLLOWUP_JOIN}
  ${CANONICAL_SUB_JOIN_SQL}
  WHERE ${REPARY_SCOPE_SQL}
`;

const FILTER_BUILDERS = {
  follow_up: () => FOLLOW_UP_SQL,
  unpaid: () => `(sub.id IS NULL AND NOT ${FOLLOW_UP_SQL})`,
  trial: () => `(NOT ${FOLLOW_UP_SQL} AND sub.id IS NOT NULL AND LOWER(sub.plan_type) = 'trial')`,
  paid: () =>
    `(NOT ${FOLLOW_UP_SQL} AND sub.id IS NOT NULL AND LOWER(sub.status) = 'active' AND LOWER(sub.plan_type) = 'paid')`,
  enterprise: () =>
    `(NOT ${FOLLOW_UP_SQL} AND sub.id IS NOT NULL AND LOWER(sub.plan_type) = 'enterprise')`,
  pending: () =>
    `(NOT ${FOLLOW_UP_SQL} AND sub.id IS NOT NULL AND LOWER(sub.status) = 'pending')`,
};

export function buildPartnerListWhere({ search, filter, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  const normalizedFilter = String(filter || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (normalizedFilter && FILTER_BUILDERS[normalizedFilter]) {
    where.push(FILTER_BUILDERS[normalizedFilter]());
  }

  if (search) {
    const term = String(search).trim();
    const like = `%${term.toLowerCase()}%`;
    const digits = term.replace(/\D/g, "");
    const contactLike = digits.length > 0 ? `%${digits}%` : like;
    const idLike = `%${term}%`;
    where.push(
      `(
        LOWER(pp.fullname) LIKE ?
        OR LOWER(COALESCE(pp.email, '')) LIKE ?
        OR pp.contact LIKE ?
        OR LOWER(COALESCE(pp.city, '')) LIKE ?
        OR LOWER(COALESCE(pp.state, '')) LIKE ?
        OR LOWER(COALESCE(pp.username, '')) LIKE ?
        OR LOWER(COALESCE(pp.companyName, '')) LIKE ?
        OR CAST(pp.id AS CHAR) LIKE ?
      )`,
    );
    params.push(like, like, contactLike, like, like, like, like, idLike);
  }

  if (dateFrom) {
    where.push(`pp.created_at >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`pp.created_at <= ?`);
    params.push(dateTo);
  }

  const whereSql = where.length ? ` AND ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

/** Summary bucket CASE expressions (mutually exclusive priority). */
export const SUMMARY_CASE_SQL = `
  SUM(CASE WHEN ${FOLLOW_UP_SQL} THEN 1 ELSE 0 END) AS follow_up,
  SUM(CASE
    WHEN ${FOLLOW_UP_SQL} THEN 0
    WHEN sub.id IS NOT NULL AND LOWER(sub.plan_type) = 'enterprise' THEN 1
    ELSE 0
  END) AS enterprise,
  SUM(CASE
    WHEN ${FOLLOW_UP_SQL} THEN 0
    WHEN sub.id IS NOT NULL AND LOWER(sub.plan_type) = 'trial' THEN 1
    ELSE 0
  END) AS trial,
  SUM(CASE
    WHEN ${FOLLOW_UP_SQL} THEN 0
    WHEN sub.id IS NOT NULL AND LOWER(sub.status) = 'pending' THEN 1
    ELSE 0
  END) AS pending,
  SUM(CASE
    WHEN ${FOLLOW_UP_SQL} THEN 0
    WHEN sub.id IS NOT NULL AND LOWER(sub.status) = 'active' AND LOWER(sub.plan_type) = 'paid' THEN 1
    ELSE 0
  END) AS paid,
  SUM(CASE
    WHEN ${FOLLOW_UP_SQL} THEN 0
    WHEN sub.id IS NULL THEN 1
    ELSE 0
  END) AS unpaid
`;

export function buildPartnerListQueries(options) {
  const { whereSql, params } = buildPartnerListWhere(options);
  const { whereSql: summaryWhereSql, params: summaryParams } = buildPartnerListWhere({
    search: options.search,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    filter: "",
  });
  const limit = options.limit;
  const offset = options.offset;

  const listSql = `
    SELECT
      pp.*,
      pf.followUp,
      pf.followUpDate,
      sub.id AS subscription_id,
      sub.status AS subscription_status,
      sub.plan_name AS subscription_plan_name,
      sub.billing_cycle AS subscription_billing_cycle,
      sub.plan_duration AS subscription_plan_duration,
      sub.plan_type AS subscription_plan_type,
      sub.end_date AS subscription_end_date,
      sub.start_date AS subscription_start_date,
      sub.final_amount AS subscription_final_amount
    ${PARTNER_LIST_FROM_SQL}
    ${whereSql}
    ORDER BY pp.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    ${PARTNER_LIST_FROM_SQL}
    ${whereSql}
  `;

  const summarySql = `
    SELECT
      COUNT(*) AS total,
      ${SUMMARY_CASE_SQL}
    ${PARTNER_LIST_FROM_SQL}
    ${summaryWhereSql}
  `;

  const listParams = [...params, limit, offset];
  const countParams = [...params];

  return {
    listSql,
    countSql,
    summarySql,
    listParams,
    countParams,
    summaryParams,
  };
}
