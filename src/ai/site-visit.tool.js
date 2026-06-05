import moment from "moment-timezone";
import db from "#db/promise";
import { resolveEnquirerByPhone } from "./crm.tool.js";

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

export async function scheduleSiteVisit({
  enquirersId,
  propertyId,
  visitDate,
  visitTime,
  remark,
  phone,
  userId,
}) {
  const ts = now();
  let enquirerId = enquirersId;

  if (!enquirerId && phone) {
    const enq = await resolveEnquirerByPhone(phone);
    enquirerId = enq?.enquirersid;
  }

  if (!enquirerId && userId) {
    const [rows] = await db.query(
      `SELECT enquirersid FROM ai_lead_profiles WHERE user_id = ? AND enquirersid IS NOT NULL LIMIT 1`,
      [userId],
    );
    enquirerId = rows[0]?.enquirersid;
  }

  if (!enquirerId) {
    return {
      success: false,
      error: "No CRM enquirer found. Use createLead first with phone number.",
    };
  }

  const visitRemark = [
    remark || "Site visit scheduled via AI Agent",
    visitTime ? `Time: ${visitTime}` : null,
    propertyId ? `Property ID: ${propertyId}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const formattedDate = moment(visitDate, ["YYYY-MM-DD", "DD-MM-YYYY"], true).isValid()
    ? moment(visitDate).format("YYYY-MM-DD")
    : visitDate;

  await db.query(
    `UPDATE enquirers SET visitdate = ?, updated_at = ? WHERE enquirersid = ?`,
    [formattedDate, ts, enquirerId],
  );

  const [insert] = await db.query(
    `INSERT INTO propertyfollowup (enquirerid, visitdate, remark, status, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [enquirerId, formattedDate, visitRemark, "Visit Scheduled", ts, ts],
  );

  return {
    success: true,
    followupId: insert.insertId,
    enquirersid: enquirerId,
    visitDate: formattedDate,
    remark: visitRemark,
  };
}
