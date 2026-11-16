/**
 * Atomic "one Razorpay payment activates one subscription" guard.
 *
 * The first caller (client verify call OR the order.paid webhook) claims the payment id;
 * everyone else sees it as already applied / in progress. This closes the window where two
 * concurrent verifies both pass an "already applied?" read and each extend the subscription.
 *
 * The logic is store-agnostic so it can be unit-tested; `createSqlClaimStore` is the MySQL store.
 */

export const CLAIM_STALE_MS = 5 * 60_000;

/**
 * @typedef {{ role: string, userId: number }} Owner
 * @returns {'claimed' | 'applied' | 'processing' | 'other_user'}
 */
export async function claimPayment(store, paymentId, owner, staleMs = CLAIM_STALE_MS) {
  if (await store.insertIfAbsent(paymentId, owner)) return "claimed";

  const row = await store.get(paymentId);
  // Row vanished between insert and read (released by a failed attempt): try once more.
  if (!row) return (await store.insertIfAbsent(paymentId, owner)) ? "claimed" : "processing";

  if (row.role !== owner.role || Number(row.userId) !== Number(owner.userId)) return "other_user";
  if (row.status === "applied") return "applied";

  // Still processing: only take over if the previous attempt looks dead (crashed mid-way).
  if (await store.takeOverIfStale(paymentId, staleMs)) return "claimed";
  return "processing";
}

export const markApplied = (store, paymentId) => store.setApplied(paymentId);

/** Release a claim after a failed activation so a retry can run. Never throws. */
export async function releaseClaim(store, paymentId) {
  try {
    await store.remove(paymentId);
  } catch (err) {
    console.error("[payment-claim] release failed:", err?.message || err);
  }
}

// ── MySQL store ─────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS subscription_payment_claims (
    payment_id VARCHAR(64) NOT NULL PRIMARY KEY,
    role VARCHAR(20) NOT NULL,
    user_id INT NOT NULL,
    status ENUM('processing','applied') NOT NULL DEFAULT 'processing',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/** @param {(sql: string, params?: any[]) => Promise<any>} query */
export function createSqlClaimStore(query) {
  let ready = null;
  const ensureTable = () => (ready ??= query(CREATE_TABLE_SQL).catch((err) => {
    ready = null;
    throw err;
  }));

  return {
    async insertIfAbsent(paymentId, { role, userId }) {
      await ensureTable();
      const res = await query(
        `INSERT IGNORE INTO subscription_payment_claims (payment_id, role, user_id, status)
         VALUES (?, ?, ?, 'processing')`,
        [paymentId, role, userId],
      );
      return res?.affectedRows === 1;
    },
    async get(paymentId) {
      await ensureTable();
      const rows = await query(
        `SELECT role, user_id AS userId, status FROM subscription_payment_claims WHERE payment_id = ?`,
        [paymentId],
      );
      return rows?.[0] || null;
    },
    async takeOverIfStale(paymentId, staleMs) {
      const res = await query(
        `UPDATE subscription_payment_claims SET updated_at = NOW()
         WHERE payment_id = ? AND status = 'processing'
           AND updated_at < (NOW() - INTERVAL ? SECOND)`,
        [paymentId, Math.floor(staleMs / 1000)],
      );
      return res?.affectedRows === 1;
    },
    async setApplied(paymentId) {
      await query(
        `UPDATE subscription_payment_claims SET status = 'applied', updated_at = NOW() WHERE payment_id = ?`,
        [paymentId],
      );
    },
    async remove(paymentId) {
      await query(
        `DELETE FROM subscription_payment_claims WHERE payment_id = ? AND status = 'processing'`,
        [paymentId],
      );
    },
  };
}
