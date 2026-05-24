import { PLAN_TYPE_SELECT_SQL } from "./planTypeSql.js";

/** Must match enterpriseActivationInvoice.service.js */
const ENTERPRISE_MANUAL_PAYMENT_PREFIX = "manual_ent_";

/** Completed checkout / activation — exclude abandoned pending rows. */
export const SUBSCRIPTION_STARTED_STATUS_SQL = `LOWER(us.status) NOT IN ('pending')`;

/**
 * Revenue counts only real collections: not pending subs; manual_ent_* only for active enterprise.
 */
export const REVENUE_PAYMENT_JOIN_SQL = `
  FROM subscription_recurring_payments rp
  INNER JOIN user_subscriptions us ON us.id = rp.user_subscription_id
  LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE rp.status IN ('captured', 'authorized')
    AND LOWER(us.status) NOT IN ('pending')
    AND (
      rp.razorpay_payment_id NOT LIKE '${ENTERPRISE_MANUAL_PAYMENT_PREFIX}%'
      OR (
        LOWER(us.status) = 'active'
        AND LOWER((${PLAN_TYPE_SELECT_SQL})) = 'enterprise'
      )
    )
`;
