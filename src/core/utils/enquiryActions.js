import db from "#db";

/**
 * Enquiry funnel statuses. "Token" (a deal) is only ever set by the token endpoint,
 * because a deal needs its amounts and commission record.
 */
export const ENQUIRY_STATUSES = ["New", "Follow Up", "Visit Scheduled", "Cancelled"];

/**
 * Deal (token) amounts must be real money: numbers above zero, and the token can't exceed the deal.
 * @returns {{ error: string } | { deal: number, token: number }}
 */
export function validateDealAmounts({ dealamount, tokenamount }) {
  const deal = Number(dealamount);
  const token = Number(tokenamount);
  if (!Number.isFinite(deal) || deal <= 0) return { error: "Deal amount must be a number greater than 0." };
  if (!Number.isFinite(token) || token <= 0) return { error: "Token amount must be a number greater than 0." };
  if (token > deal) return { error: "Token amount can't be more than the deal amount." };
  return { deal, token };
}

/**
 * Can this enquiry take a deal? It must exist, not already be a deal (recording it twice
 * double-counts the deal amount), and have a property to take the commission from.
 * Checked BEFORE the payment image is uploaded, so a rejected deal leaves nothing behind.
 * @returns {{ error: { status: number, message: string } } | { enquiry: object }}
 */
export async function checkEnquiryCanTakeDeal(enquiryId) {
  const [[enquiry]] = await db
    .promise()
    .query("SELECT enquirersid, status, propertyid FROM enquirers WHERE enquirersid = ?", [enquiryId]);
  if (!enquiry) return { error: { status: 404, message: "Enquirer not found" } };
  if (enquiry.status === "Token") {
    return { error: { status: 409, message: "A deal is already recorded for this enquiry." } };
  }
  const [[property]] = enquiry.propertyid
    ? await db.promise().query("SELECT propertyid FROM properties WHERE propertyid = ?", [enquiry.propertyid])
    : [[]];
  if (!property) {
    return { error: { status: 404, message: "Property not found. Add a property to this enquiry before recording a deal." } };
  }
  return { enquiry };
}

/**
 * Save a history row (remark / visit / token) AND move the enquiry to its new status as one
 * unit: both happen or neither does. Previously the panel saved the remark and then made a
 * second, separate call to change the status, so the two could drift apart.
 *
 * @returns the new history row id
 */
export async function recordFollowupAndStatus({ insertSql, insertParams, enquiryId, status }) {
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();
    const [inserted] = await conn.query(insertSql, insertParams);
    await conn.query("UPDATE enquirers SET status = ? WHERE enquirersid = ?", [status, enquiryId]);
    await conn.commit();
    return inserted.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
