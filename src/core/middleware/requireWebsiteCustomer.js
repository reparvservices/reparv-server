import dbPromise from "#db/promise";

const defaultQuery = (sql, params) => dbPromise.query(sql, params);

/**
 * Website login (the `userToken` cookie, already verified by verifyToken -> req.guestUser).
 * Loads the guestUsers row as req.customer so the same booking code the app uses can run.
 * `query` is injectable for tests.
 */
export function requireWebsiteCustomer(query = defaultQuery) {
  return async function websiteCustomerGuard(req, res, next) {
    const id = Number(req.guestUser?.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(401).json({ success: false, message: "Please log in to continue." });
    }
    try {
      const [rows] = await query("SELECT id, fullname, email, contact FROM guestUsers WHERE id = ? LIMIT 1", [id]);
      if (!rows?.length) return res.status(401).json({ success: false, message: "Please log in to continue." });
      req.customer = rows[0];
      return next();
    } catch (err) {
      console.error("[requireWebsiteCustomer]", err.message);
      return res.status(500).json({ success: false, message: "Something went wrong." });
    }
  };
}
