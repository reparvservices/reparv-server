/**
 * Derives plan_type when subscription_plans.plan_type is not migrated yet.
 * After migrations/001_subscription_plans_extend.sql, prefer sp.plan_type in new queries.
 */
export const PLAN_TYPE_SELECT_SQL = `CASE
  WHEN LOWER(COALESCE(us.status, '')) = 'trial' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%enterprise%' THEN 'enterprise'
  ELSE 'paid'
END`;

/** Plan list queries (no user_subscriptions join). */
export const PLAN_TYPE_FROM_PLAN_SQL = `CASE
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%enterprise%' THEN 'enterprise'
  ELSE 'paid'
END`;
