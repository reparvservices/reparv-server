import dbPromise from "#db/promise";
import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "./userSubscriptionCanonical.js";
import { enrichPartnerWithSubscription } from "./subscriptionBucket.js";
import { PLAN_TYPE_SELECT_SQL } from "./planTypeSql.js";

/**
 * Attach canonical user_subscriptions fields to partner list rows.
 * @param {Array} partners
 * @param {'project'|'territory'|'sales'} role
 * @param {(row: object) => number} getUserId
 */
export async function attachSubscriptionsToPartners(partners, role, getUserId) {
  if (!partners?.length) return partners;

  const userIds = [
    ...new Set(
      partners.map((p) => getUserId(p)).filter((id) => id != null && !Number.isNaN(Number(id))),
    ),
  ];
  if (!userIds.length) {
    return partners.map((p) => enrichPartnerWithSubscription(p, null));
  }

  const [rows] = await dbPromise.query(
    `SELECT
      us.user_id,
      us.status,
      us.start_date,
      us.end_date,
      sp.plan_name,
      sp.billing_cycle,
      ${PLAN_TYPE_SELECT_SQL} AS plan_type
    FROM user_subscriptions us
    INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.role = ? AND us.user_id IN (?)`,
    [role, userIds],
  );

  const subByUser = new Map(rows.map((r) => [Number(r.user_id), r]));

  return partners.map((p) => {
    const uid = Number(getUserId(p));
    return enrichPartnerWithSubscription(p, subByUser.get(uid) || null);
  });
}
