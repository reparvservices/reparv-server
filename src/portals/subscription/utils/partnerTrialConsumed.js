import dbPromise from "#db/promise";
import { PLAN_TYPE_SELECT_SQL } from "./planTypeSql.js";

/**
 * Whether this partner has ever had a trial row in user_subscriptions.
 * Scans all rows for (user_id, role), not only the latest canonical row.
 */
export async function hasPartnerConsumedTrial(userId, role) {
  const uid = Number.parseInt(userId, 10);
  const roleNorm = String(role || "").toLowerCase();
  if (!uid || !roleNorm) return false;

  const [rows] = await dbPromise.query(
    `SELECT us.id
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ? AND us.role = ?
       AND LOWER((${PLAN_TYPE_SELECT_SQL})) = 'trial'
     LIMIT 1`,
    [uid, roleNorm],
  );
  if (rows.length > 0) return true;

  if (roleNorm === "project") {
    const [legacy] = await dbPromise.query(
      `SELECT freeProjectPartner FROM projectpartner WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (String(legacy[0]?.freeProjectPartner || "").toLowerCase() === "active") {
      return true;
    }
  }

  return false;
}
