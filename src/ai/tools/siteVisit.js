import moment from "moment-timezone";
import db from "#db/promise";
import { getLeadProfile } from "./leads.js";
import { createLead } from "./crm.js";
import { findPropertyByName } from "./properties.js";

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

/** Phone numbers are often mistaken for enquirersId by the LLM */
function sanitizeEnquirerId(raw) {
  if (raw == null || raw === "") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 10) return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 50_000_000) return null;
  return Math.floor(n);
}

async function lookupEnquirerById(id) {
  const [rows] = await db.query(
    `SELECT enquirersid FROM enquirers WHERE enquirersid = ? LIMIT 1`,
    [id],
  );
  return rows[0]?.enquirersid || null;
}

async function lookupEnquirerByPhone(phone) {
  const [rows] = await db.query(
    `SELECT enquirersid FROM enquirers WHERE contact = ? ORDER BY updated_at DESC LIMIT 1`,
    [phone],
  );
  return rows[0]?.enquirersid || null;
}

async function resolveEnquirerId({
  enquirersId,
  userId,
  phone,
  name,
  propertyId,
  projectName,
}) {
  const directId = sanitizeEnquirerId(enquirersId);
  if (directId) {
    const found = await lookupEnquirerById(directId);
    if (found) return found;
  }

  if (userId) {
    const profile = await getLeadProfile(userId);
    const profileId = sanitizeEnquirerId(profile?.enquirersid);
    if (profileId) {
      const found = await lookupEnquirerById(profileId);
      if (found) return found;
    }

    const profilePhone = normalizePhone(profile?.phone);
    if (profilePhone) {
      const found = await lookupEnquirerByPhone(profilePhone);
      if (found) return found;
    }
  }

  const resolvedPhone = normalizePhone(phone);
  if (resolvedPhone) {
    let resolvedPropertyId = propertyId;
    if (!resolvedPropertyId && projectName) {
      const prop = await findPropertyByName(projectName);
      resolvedPropertyId = prop?.propertyid;
    }

    const lead = await createLead({
      userId,
      phone: resolvedPhone,
      name,
      propertyId: resolvedPropertyId,
      notes: "Site visit request via AI Agent",
    });
    return lead.enquirersid;
  }

  return null;
}

async function resolvePropertyId(propertyId, projectName) {
  if (propertyId) return propertyId;
  if (!projectName) return null;
  const prop = await findPropertyByName(projectName);
  return prop?.propertyid || null;
}

export async function scheduleSiteVisit({
  enquirersId,
  propertyId,
  projectName,
  visitDate,
  visitTime,
  remark,
  userId,
  phone,
  name,
}) {
  try {
    const ts = now();

    const enquirerId = await resolveEnquirerId({
      enquirersId,
      userId,
      phone,
      name,
      propertyId,
      projectName,
    });

    if (!enquirerId) {
      return {
        success: false,
        error:
          "Phone number chahiye site visit schedule karne ke liye. Apna naam aur number share kariye.",
      };
    }

    const pid = await resolvePropertyId(propertyId, projectName);

    const visitRemark = [
      remark || "Site visit scheduled via AI Agent",
      visitTime ? `Time: ${visitTime}` : null,
      pid ? `Property ID: ${pid}` : null,
      projectName ? `Property: ${projectName}` : null,
      name ? `Customer: ${name}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const formattedDate = moment(
      visitDate,
      ["YYYY-MM-DD", "DD-MM-YYYY"],
      true,
    ).isValid()
      ? moment(visitDate).format("YYYY-MM-DD")
      : visitDate || moment().add(7, "days").format("YYYY-MM-DD");

    await db.query(
      `UPDATE enquirers SET visitdate = ?, updated_at = ? WHERE enquirersid = ?`,
      [formattedDate, ts, enquirerId],
    );

    if (pid) {
      await db.query(
        `UPDATE enquirers SET propertyid = ?, updated_at = ? WHERE enquirersid = ?`,
        [pid, ts, enquirerId],
      );
    }

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
  } catch (err) {
    console.error("[scheduleSiteVisit]", err);
    return {
      success: false,
      error:
        "Site visit abhi schedule nahi ho payi. Thodi der baad try kariye ya humari sales team se contact karein.",
    };
  }
}
