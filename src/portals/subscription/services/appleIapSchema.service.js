import dbPromise from "#db/promise";

let schemaReady = null;

async function ensureColumn(table, column, ddl) {
  try {
    await dbPromise.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

/** Adds Apple IAP columns without touching existing Razorpay schema. */
export async function ensureAppleIapSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await ensureColumn(
      "subscription_plans",
      "apple_product_id",
      "VARCHAR(128) NULL DEFAULT NULL AFTER razorpay_plan_id",
    );
    await ensureColumn(
      "user_subscriptions",
      "apple_original_transaction_id",
      "VARCHAR(64) NULL DEFAULT NULL AFTER razorpay_subscription_id",
    );
    await ensureColumn(
      "user_subscriptions",
      "apple_product_id",
      "VARCHAR(128) NULL DEFAULT NULL AFTER apple_original_transaction_id",
    );
  })();

  return schemaReady;
}
