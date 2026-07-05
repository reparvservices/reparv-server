/**
 * Idempotent writes for user_subscriptions (no reliance on missing UNIQUE keys).
 */
import db from "#db";

const dbQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

export async function findSubscriptionByRazorpayId(razorpaySubscriptionId) {
  if (!razorpaySubscriptionId) return null;
  const rows = await dbQuery(
    `SELECT id, status, user_id, role, plan_id
     FROM user_subscriptions
     WHERE razorpay_subscription_id = ?
     ORDER BY
       CASE LOWER(status) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       updated_at DESC,
       id DESC
     LIMIT 1`,
    [razorpaySubscriptionId],
  );
  return rows[0] || null;
}

export async function findPendingSubscriptionRow(userId, role, planId) {
  const rows = await dbQuery(
    `SELECT id, status, razorpay_subscription_id
     FROM user_subscriptions
     WHERE user_id = ? AND role = ? AND plan_id = ? AND LOWER(status) = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [userId, role, planId],
  );
  return rows[0] || null;
}

/** Mark other pending checkout rows for this partner as expired (keeps one row per checkout). */
export async function expireStalePendingRows(userId, role, keepId) {
  if (!keepId) return;
  await dbQuery(
    `UPDATE user_subscriptions
     SET status = 'expired', updated_at = NOW()
     WHERE user_id = ? AND role = ? AND LOWER(status) = 'pending' AND id != ?`,
    [userId, role, keepId],
  );
}

/**
 * Create or refresh a pending row before Razorpay checkout (recurring).
 * Reuses row with same razorpay_subscription_id or latest pending for user+role+plan.
 */
export async function upsertPendingRecurringRow({
  userId,
  role,
  planId,
  paymentType,
  razorpaySubscriptionId,
  discountAmount,
  finalAmount,
}) {
  const byRz = await findSubscriptionByRazorpayId(razorpaySubscriptionId);
  if (byRz) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         plan_id = ?,
         payment_type = ?,
         discount_amount = ?,
         final_amount = ?,
         status = IF(LOWER(status) = 'active', 'active', 'pending'),
         updated_at = NOW()
       WHERE id = ?`,
      [planId, paymentType, discountAmount, finalAmount, byRz.id],
    );
    return byRz.id;
  }

  const pending = await findPendingSubscriptionRow(userId, role, planId);
  if (pending) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         payment_type = ?,
         razorpay_subscription_id = ?,
         discount_amount = ?,
         final_amount = ?,
         status = 'pending',
         updated_at = NOW()
       WHERE id = ?`,
      [paymentType, razorpaySubscriptionId, discountAmount, finalAmount, pending.id],
    );
    return pending.id;
  }

  const result = await dbQuery(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id, status,
        discount_amount, final_amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NOW(), NOW())`,
    [
      userId,
      role,
      planId,
      paymentType,
      razorpaySubscriptionId,
      discountAmount,
      finalAmount,
    ],
  );
  return result.insertId;
}

/**
 * Activate after verify — updates the same row created at checkout (never duplicates).
 */
export async function activateRecurringSubscriptionRow({
  userId,
  role,
  planId,
  razorpaySubscriptionId,
  startDate,
  nextBillingDate,
  endDate,
  discountAmount,
  finalAmount,
}) {
  let rowId = null;

  const byRz = await findSubscriptionByRazorpayId(razorpaySubscriptionId);
  if (byRz) rowId = byRz.id;

  if (!rowId) {
    const pending = await findPendingSubscriptionRow(userId, role, planId);
    rowId = pending?.id || null;
  }

  if (rowId) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         plan_id = ?,
         payment_type = 'auto',
         razorpay_subscription_id = ?,
         start_date = ?,
         next_billing_date = ?,
         end_date = ?,
         status = 'active',
         discount_amount = ?,
         final_amount = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [
        planId,
        razorpaySubscriptionId,
        startDate,
        nextBillingDate,
        endDate,
        discountAmount,
        finalAmount,
        rowId,
      ],
    );
    await expireStalePendingRows(userId, role, rowId);
    return rowId;
  }

  const result = await dbQuery(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id,
        start_date, next_billing_date, end_date, status, discount_amount, final_amount,
        created_at, updated_at)
     VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, 'active', ?, ?, NOW(), NOW())`,
    [
      userId,
      role,
      planId,
      razorpaySubscriptionId,
      startDate,
      nextBillingDate,
      endDate,
      discountAmount,
      finalAmount,
    ],
  );
  const insertId = result.insertId;
  await expireStalePendingRows(userId, role, insertId);
  return insertId;
}

/** One-time order checkout: reuse pending row for same user+role+plan. */
export async function upsertPendingOrderRow({
  userId,
  role,
  planId,
  discountAmount,
  finalAmount,
}) {
  const pending = await findPendingSubscriptionRow(userId, role, planId);
  if (pending) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         payment_type = 'manual',
         discount_amount = ?,
         final_amount = ?,
         status = 'pending',
         updated_at = NOW()
       WHERE id = ?`,
      [discountAmount, finalAmount, pending.id],
    );
    return pending.id;
  }

  const result = await dbQuery(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, status, discount_amount, final_amount,
        created_at, updated_at)
     VALUES (?, ?, ?, 'manual', 'pending', ?, ?, NOW(), NOW())`,
    [userId, role, planId, discountAmount, finalAmount],
  );
  return result.insertId;
}

export async function activateOrderSubscriptionRow({
  userId,
  role,
  planId,
  startDate,
  endDate,
  discountAmount,
  finalAmount,
}) {
  let rowId = null;
  const pending = await findPendingSubscriptionRow(userId, role, planId);
  if (pending) rowId = pending.id;

  if (!rowId) {
    const rows = await dbQuery(
      `SELECT id FROM user_subscriptions
       WHERE user_id = ? AND role = ? AND plan_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [userId, role, planId],
    );
    rowId = rows[0]?.id || null;
  }

  if (rowId) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         plan_id = ?,
         payment_type = 'manual',
         razorpay_subscription_id = NULL,
         start_date = ?,
         next_billing_date = ?,
         end_date = ?,
         status = 'active',
         discount_amount = ?,
         final_amount = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [planId, startDate, endDate, endDate, discountAmount, finalAmount, rowId],
    );
    await expireStalePendingRows(userId, role, rowId);
    return rowId;
  }

  const result = await dbQuery(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id,
        start_date, next_billing_date, end_date, status, discount_amount, final_amount,
        updated_at)
     VALUES (?, ?, ?, 'manual', NULL, ?, ?, ?, 'active', ?, ?, NOW())`,
    [userId, role, planId, startDate, endDate, endDate, discountAmount, finalAmount],
  );
  const insertId = result.insertId;
  await expireStalePendingRows(userId, role, insertId);
  return insertId;
}

/** iOS In-App Purchase — does not modify Razorpay subscription rows. */
export async function activateAppleSubscriptionRow({
  userId,
  role,
  planId,
  startDate,
  endDate,
  finalAmount = 0,
  appleOriginalTransactionId,
  appleProductId,
}) {
  let rowId = null;

  if (appleOriginalTransactionId) {
    const rows = await dbQuery(
      `SELECT id FROM user_subscriptions
       WHERE apple_original_transaction_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [appleOriginalTransactionId],
    );
    rowId = rows[0]?.id || null;
  }

  if (!rowId) {
    const rows = await dbQuery(
      `SELECT id FROM user_subscriptions
       WHERE user_id = ? AND role = ?
       ORDER BY
         CASE LOWER(status) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         updated_at DESC,
         id DESC
       LIMIT 1`,
      [userId, role],
    );
    rowId = rows[0]?.id || null;
  }

  if (rowId) {
    await dbQuery(
      `UPDATE user_subscriptions SET
         plan_id = ?,
         payment_type = 'apple',
         razorpay_subscription_id = NULL,
         apple_original_transaction_id = ?,
         apple_product_id = ?,
         start_date = ?,
         next_billing_date = ?,
         end_date = ?,
         status = 'active',
         discount_amount = 0,
         final_amount = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [
        planId,
        appleOriginalTransactionId,
        appleProductId,
        startDate,
        endDate,
        endDate,
        finalAmount,
        rowId,
      ],
    );
    await expireStalePendingRows(userId, role, rowId);
    return rowId;
  }

  const result = await dbQuery(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id,
        apple_original_transaction_id, apple_product_id,
        start_date, next_billing_date, end_date, status, discount_amount, final_amount,
        updated_at)
     VALUES (?, ?, ?, 'apple', NULL, ?, ?, ?, ?, ?, 'active', 0, ?, NOW())`,
    [
      userId,
      role,
      planId,
      appleOriginalTransactionId,
      appleProductId,
      startDate,
      endDate,
      endDate,
      finalAmount,
    ],
  );
  const insertId = result.insertId;
  await expireStalePendingRows(userId, role, insertId);
  return insertId;
}
