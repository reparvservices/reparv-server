/**
 * Derives plan_type when subscription_plans.plan_type is not migrated yet.
 * After migrations/001_subscription_plans_extend.sql, prefer sp.plan_type in new queries.
 */
/** plan_type when joined with user_subscriptions + subscription_plans */
export const PLAN_TYPE_SELECT_SQL = `CASE
  WHEN LOWER(COALESCE(sp.plan_type, '')) = 'trial' THEN 'trial'
  WHEN LOWER(COALESCE(us.status, '')) = 'trial' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trail%' THEN 'trial'
  WHEN COALESCE(sp.price, 0) <= 0 AND (
    LOWER(COALESCE(sp.plan_name, '')) LIKE '%free%'
    OR LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%'
    OR LOWER(COALESCE(sp.plan_name, '')) LIKE '%trail%'
  ) THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_type, '')) = 'enterprise' THEN 'enterprise'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%enterprise%' THEN 'enterprise'
  ELSE 'paid'
END`;

/** Plan list queries (no user_subscriptions join). */
export const PLAN_TYPE_FROM_PLAN_SQL = `CASE
  WHEN LOWER(COALESCE(sp.plan_type, '')) = 'trial' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%' THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%trail%' THEN 'trial'
  WHEN COALESCE(sp.price, 0) <= 0 AND (
    LOWER(COALESCE(sp.plan_name, '')) LIKE '%free%'
    OR LOWER(COALESCE(sp.plan_name, '')) LIKE '%trial%'
    OR LOWER(COALESCE(sp.plan_name, '')) LIKE '%trail%'
  ) THEN 'trial'
  WHEN LOWER(COALESCE(sp.plan_name, '')) LIKE '%enterprise%' THEN 'enterprise'
  ELSE 'paid'
END`;
