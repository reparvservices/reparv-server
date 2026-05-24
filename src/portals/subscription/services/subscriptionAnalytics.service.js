import dbPromise from "#db/promise";
import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "../utils/userSubscriptionCanonical.js";
import {
  REVENUE_PAYMENT_JOIN_SQL,
  SUBSCRIPTION_STARTED_STATUS_SQL,
} from "../utils/subscriptionAnalyticsSql.js";
import { PLAN_TYPE_SELECT_SQL } from "../utils/planTypeSql.js";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseYear(raw) {
  const y = Number.parseInt(raw, 10);
  const current = new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2020 || y > current + 1) return current;
  return y;
}

function parseMonth(raw) {
  const m = Number.parseInt(raw, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

async function revenueInRange(start, end) {
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(rp.amount), 0) AS total
     ${REVENUE_PAYMENT_JOIN_SQL}
       AND COALESCE(rp.paid_at, rp.created_at) >= ?
       AND COALESCE(rp.paid_at, rp.created_at) < ?`,
    [start, end],
  );
  let total = Number(rows[0]?.total) || 0;
  if (total > 0) return total;

  const [fallback] = await dbPromise.query(
    `SELECT COALESCE(SUM(IFNULL(us.final_amount, 0)), 0) AS total
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.created_at >= ? AND us.created_at < ?
       AND LOWER(us.status) = 'active'
       AND (us.end_date IS NULL OR us.end_date >= NOW())
       AND LOWER((${PLAN_TYPE_SELECT_SQL})) NOT IN ('trial', 'enterprise')
       AND IFNULL(us.final_amount, 0) > 0`,
    [start, end],
  );
  return Number(fallback[0]?.total) || 0;
}

export async function getSubscriptionAnalytics({ year: yearRaw, month: monthRaw } = {}) {
  const year = parseYear(yearRaw);
  const selectedMonth = parseMonth(monthRaw);
  const yearStart = `${year}-01-01 00:00:00`;
  const yearEnd = `${year + 1}-01-01 00:00:00`;

  const [
    [overviewRows],
    [monthlySubRows],
    [monthlyRevRows],
    [yearlySubRows],
    [yearlyRevRows],
    [byRoleRows],
    [byPlanRows],
  ] = await Promise.all([
    dbPromise.query(
      `SELECT
         COUNT(*) AS total_all,
         SUM(LOWER(us.status) = 'active') AS active,
         SUM(LOWER(us.status) = 'trial') AS trial,
         SUM(LOWER(us.status) = 'pending') AS pending,
         SUM(LOWER(us.status) = 'cancelled') AS cancelled,
         SUM(LOWER(us.status) = 'expired') AS expired,
         SUM(LOWER(us.status) = 'halted') AS halted,
         SUM(CASE
           WHEN us.created_at >= ? AND us.created_at < ?
             AND ${SUBSCRIPTION_STARTED_STATUS_SQL}
           THEN 1 ELSE 0
         END) AS started_this_year
       FROM user_subscriptions us
       INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id`,
      [yearStart, yearEnd],
    ),
    dbPromise.query(
      `SELECT MONTH(us.created_at) AS m, COUNT(*) AS cnt
       FROM user_subscriptions us
       WHERE us.created_at >= ? AND us.created_at < ?
         AND ${SUBSCRIPTION_STARTED_STATUS_SQL}
       GROUP BY MONTH(us.created_at)`,
      [yearStart, yearEnd],
    ),
    dbPromise.query(
      `SELECT MONTH(COALESCE(rp.paid_at, rp.created_at)) AS m,
              COALESCE(SUM(rp.amount), 0) AS revenue
       ${REVENUE_PAYMENT_JOIN_SQL}
         AND COALESCE(rp.paid_at, rp.created_at) >= ?
         AND COALESCE(rp.paid_at, rp.created_at) < ?
       GROUP BY MONTH(COALESCE(rp.paid_at, rp.created_at))`,
      [yearStart, yearEnd],
    ),
    dbPromise.query(
      `SELECT YEAR(us.created_at) AS y, COUNT(*) AS cnt
       FROM user_subscriptions us
       WHERE us.created_at >= DATE_SUB(?, INTERVAL 5 YEAR)
         AND ${SUBSCRIPTION_STARTED_STATUS_SQL}
       GROUP BY YEAR(us.created_at)
       ORDER BY y ASC`,
      [`${year}-12-31`],
    ),
    dbPromise.query(
      `SELECT YEAR(COALESCE(rp.paid_at, rp.created_at)) AS y,
              COALESCE(SUM(rp.amount), 0) AS revenue
       ${REVENUE_PAYMENT_JOIN_SQL}
         AND COALESCE(rp.paid_at, rp.created_at) >= DATE_SUB(?, INTERVAL 5 YEAR)
       GROUP BY YEAR(COALESCE(rp.paid_at, rp.created_at))
       ORDER BY y ASC`,
      [`${year}-12-31`],
    ),
    dbPromise.query(
      `SELECT us.role,
              COUNT(*) AS total,
              SUM(LOWER(us.status) = 'active') AS active,
              SUM(LOWER(us.status) = 'trial') AS trial
       FROM user_subscriptions us
       INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
       GROUP BY us.role`,
    ),
    dbPromise.query(
      `SELECT sp.plan_name, sp.plan_type, COUNT(*) AS cnt
       FROM user_subscriptions us
       INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       GROUP BY us.plan_id, sp.plan_name, sp.plan_type
       ORDER BY cnt DESC
       LIMIT 10`,
    ),
  ]);

  const ov = overviewRows[0] || {};
  const subByMonth = Object.fromEntries(
    (monthlySubRows || []).map((r) => [Number(r.m), Number(r.cnt) || 0]),
  );
  const revByMonth = Object.fromEntries(
    (monthlyRevRows || []).map((r) => [Number(r.m), Number(r.revenue) || 0]),
  );

  const monthly = MONTH_LABELS.map((label, idx) => {
    const month = idx + 1;
    return {
      month,
      label,
      subscriptionsStarted: subByMonth[month] || 0,
      revenue: Math.round((revByMonth[month] || 0) * 100) / 100,
    };
  });

  const yearSubMap = Object.fromEntries(
    (yearlySubRows || []).map((r) => [Number(r.y), Number(r.cnt) || 0]),
  );
  const yearRevMap = Object.fromEntries(
    (yearlyRevRows || []).map((r) => [Number(r.y), Number(r.revenue) || 0]),
  );
  const yearSet = new Set([
    ...Object.keys(yearSubMap).map(Number),
    ...Object.keys(yearRevMap).map(Number),
    year - 4,
    year - 3,
    year - 2,
    year - 1,
    year,
  ]);
  const yearly = [...yearSet]
    .filter((y) => y >= 2020 && y <= year)
    .sort((a, b) => a - b)
    .map((y) => ({
      year: y,
      subscriptionsStarted: yearSubMap[y] || 0,
      revenue: Math.round((yearRevMap[y] || 0) * 100) / 100,
    }));

  const yearRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const yearSubscriptions = monthly.reduce((s, m) => s + m.subscriptionsStarted, 0);

  const allTimeRevenue = await revenueInRange("1970-01-01", "2099-01-01");

  let monthDetail = null;
  if (selectedMonth) {
    const monthStart = `${year}-${String(selectedMonth).padStart(2, "0")}-01 00:00:00`;
    const nextMonth =
      selectedMonth === 12
        ? `${year + 1}-01-01 00:00:00`
        : `${year}-${String(selectedMonth + 1).padStart(2, "0")}-01 00:00:00`;

    const [detailRows] = await dbPromise.query(
      `SELECT
         us.id,
         us.user_id,
         us.role,
         us.status,
         us.final_amount,
         us.payment_type,
         us.start_date,
         us.end_date,
         us.created_at,
         sp.plan_name,
         (${PLAN_TYPE_SELECT_SQL}) AS plan_type,
         CASE us.role
           WHEN 'project' THEN pp.fullname
           WHEN 'sales' THEN s.fullname
           WHEN 'territory' THEN tp.fullname
         END AS user_name,
         CASE us.role
           WHEN 'project' THEN pp.email
           WHEN 'sales' THEN s.email
           WHEN 'territory' THEN tp.email
         END AS user_email
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       LEFT JOIN projectpartner pp ON us.role = 'project' AND pp.id = us.user_id
       LEFT JOIN salespersons s ON us.role = 'sales' AND s.salespersonsid = us.user_id
       LEFT JOIN territorypartner tp ON us.role = 'territory' AND tp.id = us.user_id
       WHERE us.created_at >= ? AND us.created_at < ?
         AND ${SUBSCRIPTION_STARTED_STATUS_SQL}
       ORDER BY us.created_at DESC
       LIMIT 200`,
      [monthStart, nextMonth],
    );

    monthDetail = {
      month: selectedMonth,
      label: MONTH_LABELS[selectedMonth - 1],
      subscriptionsStarted: subByMonth[selectedMonth] || 0,
      revenue: Math.round((revByMonth[selectedMonth] || 0) * 100) / 100,
      rows: detailRows,
    };
  }

  const ROLE_LABELS = {
    project: "Project Partner",
    sales: "Sales Partner",
    territory: "Territory Partner",
  };

  return {
    year,
    selectedMonth,
    overview: {
      totalSubscriptions: Number(ov.total_all) || 0,
      active: Number(ov.active) || 0,
      trial: Number(ov.trial) || 0,
      pending: Number(ov.pending) || 0,
      cancelled: Number(ov.cancelled) || 0,
      expired: Number(ov.expired) || 0,
      halted: Number(ov.halted) || 0,
      startedThisYear: Number(ov.started_this_year) || 0,
      revenueAllTime: Math.round(allTimeRevenue * 100) / 100,
      revenueThisYear: Math.round(yearRevenue * 100) / 100,
      subscriptionsThisYear: yearSubscriptions,
    },
    monthly,
    yearly,
    byRole: (byRoleRows || []).map((r) => ({
      role: r.role,
      roleLabel: ROLE_LABELS[r.role] || r.role,
      total: Number(r.total) || 0,
      active: Number(r.active) || 0,
      trial: Number(r.trial) || 0,
    })),
    topPlans: (byPlanRows || []).map((r) => ({
      planName: r.plan_name || "Unknown",
      planType: r.plan_type || "paid",
      count: Number(r.cnt) || 0,
    })),
    monthDetail,
  };
}
