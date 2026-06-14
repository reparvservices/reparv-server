import dbPromise from "#db/promise";

let schemaReady = null;

async function ensureColumn(table, column, ddl) {
  try {
    await dbPromise.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

export async function ensurePropertiesSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await ensureColumn(
      "properties",
      "guest_approval_notified",
      "TINYINT(1) NOT NULL DEFAULT 0",
    );
    await ensureColumn(
      "properties",
      "pp_approval_notified",
      "TINYINT(1) NOT NULL DEFAULT 0",
    );
  })();

  return schemaReady;
}
