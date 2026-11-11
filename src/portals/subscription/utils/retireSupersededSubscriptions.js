import dbPromise from "#db/promise";
import razorpay from "#utils/razorpayClient.js";

/**
 * A partner has one running plan. After a new plan activates, end the older
 * ones and stop their autopay so the partner is not billed twice.
 * If Razorpay refuses a cancel, that row stays visible as active for admin.
 */
export async function retireSupersededSubscriptions({ userId, role, keepId }) {
  if (!keepId) return;
  const [rows] = await dbPromise.query(
    `SELECT us.id, us.razorpay_subscription_id AS rz_id, keep.razorpay_subscription_id AS keep_rz_id
     FROM user_subscriptions us
     JOIN user_subscriptions keep ON keep.id = ?
     WHERE us.user_id = ? AND us.role = ? AND us.id <> ?
       AND LOWER(us.status) IN ('active', 'trial', 'halted')`,
    [keepId, userId, role, keepId],
  );

  for (const row of rows) {
    if (row.rz_id && row.rz_id !== row.keep_rz_id) {
      try {
        await razorpay.subscriptions.cancel(row.rz_id, { cancel_at_cycle_end: 0 });
      } catch (err) {
        const message = err?.error?.description || err?.message || "";
        if (!/not cancellable|completed|already cancelled|already expired/i.test(message)) {
          console.error(`[subscriptions] could not stop autopay ${row.rz_id}:`, message);
          continue;
        }
      }
    }
    await dbPromise.query(
      `UPDATE user_subscriptions
       SET status = 'expired', end_date = ?, next_billing_date = NULL, updated_at = NOW()
       WHERE id = ?`,
      [new Date(), row.id],
    );
  }
}
