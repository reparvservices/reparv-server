import moment from "moment-timezone";
import db from "#db/promise";
import { upsertLeadProfile } from "./leads.js";

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

function normalizePhone(contact) {
  if (!contact) return null;
  let d = String(contact).replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  return d.length >= 10 ? d.slice(-10) : null;
}

export async function createLead({ userId, ...data }) {
  const phone = normalizePhone(data.phone);
  if (!phone) {
    throw new Error("Valid phone number is required");
  }

  const ts = now();
  const minBudget = data.budgetMin ?? null;
  const maxBudget = data.budgetMax ?? null;
  const source = "AI Agent";
  let enquirersid = data.enquirersId || null;
  let projectpartnerid = null;
  let category = data.propertyType || null;

  if (data.propertyId) {
    const [props] = await db.query(
      `SELECT projectpartnerid, propertyCategory FROM properties WHERE propertyid = ? LIMIT 1`,
      [data.propertyId],
    );
    if (props?.length) {
      projectpartnerid = props[0].projectpartnerid;
      category = category || props[0].propertyCategory;
    }
  }

  const [existing] = await db.query(
    `SELECT enquirersid FROM enquirers WHERE contact = ? ORDER BY updated_at DESC LIMIT 1`,
    [phone],
  );

  if (existing?.length) {
    enquirersid = existing[0].enquirersid;
    await db.query(
      `UPDATE enquirers SET
        customer = COALESCE(?, customer),
        city = COALESCE(?, city),
        minbudget = COALESCE(?, minbudget),
        maxbudget = COALESCE(?, maxbudget),
        category = COALESCE(?, category),
        location = COALESCE(?, location),
        propertyid = COALESCE(?, propertyid),
        message = CONCAT(COALESCE(message, ''), ?),
        source = ?,
        updated_at = ?
       WHERE enquirersid = ?`,
      [
        data.name || null,
        data.city || null,
        minBudget,
        maxBudget,
        category,
        data.locationPreference || null,
        data.propertyId || null,
        data.notes ? `\n[AI] ${data.notes}` : "",
        source,
        ts,
        enquirersid,
      ],
    );
  } else {
    const [insert] = await db.query(
      `INSERT INTO enquirers (
        projectpartnerid, propertyid, category, customer, contact, city,
        minbudget, maxbudget, location, source, message, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectpartnerid,
        data.propertyId || null,
        category,
        data.name || "AI Lead",
        phone,
        data.city || null,
        minBudget,
        maxBudget,
        data.locationPreference || null,
        source,
        data.notes || "Qualified via Real Estate AI Advisor",
        ts,
        ts,
      ],
    );
    enquirersid = insert.insertId;
  }

  const profile = await upsertLeadProfile(userId, {
    enquirersid,
    name: data.name,
    phone,
    city: data.city,
    budgetMin: minBudget,
    budgetMax: maxBudget,
    propertyType: data.propertyType,
    locationPreference: data.locationPreference,
    homeLoanRequired: data.homeLoanRequired,
    purchaseTimeline: data.purchaseTimeline,
    leadStatus: "qualified",
  });

  return {
    success: true,
    enquirersid,
    leadScore: profile?.lead_score,
    leadStatus: profile?.lead_status,
  };
}

export async function assignToSalesAgent({
  userId,
  reason,
  assignedTo,
  enquirersId,
}) {
  const ts = now();
  const note = `[AI Handoff] ${reason}${assignedTo ? ` → ${assignedTo}` : ""}`;

  const profile = await upsertLeadProfile(userId, {
    enquirersid: enquirersId,
    leadStatus: "human_handoff",
    assignedTo: assignedTo || null,
    metadata: { reason, at: ts },
  });

  const eid = enquirersId || profile?.enquirersid;
  if (eid) {
    await db.query(
      `UPDATE enquirers SET message = CONCAT(COALESCE(message, ''), ?), updated_at = ? WHERE enquirersid = ?`,
      [`\n${note}`, ts, eid],
    );
  }

  return {
    success: true,
    leadStatus: "human_handoff",
    assignedTo: assignedTo || null,
    enquirersid: eid,
    reason,
  };
}
