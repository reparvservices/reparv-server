import {
  sendTextMessage,
  normalizePhoneE164,
  resolveEnquiryByPhone,
  logOutboundMessage,
} from "../../utils/whatsappAdminChat.js";
import db from "../../config/dbconnect.js";

export const listConversations = (req, res) => {
  db.query(
    `SELECT t1.phone_e164,
            t1.customer_name,
            t1.body AS last_message,
            t1.created_at
     FROM whatsapp_admin_chat t1
     INNER JOIN (
       SELECT phone_e164, MAX(id) AS max_id
       FROM whatsapp_admin_chat
       GROUP BY phone_e164
     ) t2
     ON t1.phone_e164 = t2.phone_e164 AND t1.id = t2.max_id
     ORDER BY t1.created_at DESC
     LIMIT 200`,
    [],
    (err, rows) => {
      if (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
          return res.json({ conversations: [] });
        }
        console.error(err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ conversations: rows || [] });
    },
  );
};

export const getMessages = (req, res) => {
  const phone_e164 = normalizePhoneE164(req.query.phone);
  if (!phone_e164) {
    return res.status(400).json({ message: "Invalid phone" });
  }

  const afterIdRaw = req.query.afterId;
  const afterId = afterIdRaw ? parseInt(afterIdRaw, 10) : null;

  const whereParts = ["phone_e164 = ?"];
  const params = [phone_e164];
  if (afterId && Number.isFinite(afterId) && afterId > 0) {
    whereParts.push("id > ?");
    params.push(afterId);
  }

  const whereClause = whereParts.join(" AND ");

  db.query(
    `SELECT id, direction, body, created_at, wa_message_id
     FROM whatsapp_admin_chat
     WHERE ${whereClause}
     ORDER BY id ASC
     LIMIT 400`,
    params,
    (err, rows) => {
      if (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
          return res.json({ messages: [] });
        }
        console.error(err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ phone_e164, messages: rows || [] });
    },
  );
};

export const sendMessage = async (req, res) => {
  const { phone, text } = req.body || {};
  const phone_e164 = normalizePhoneE164(phone);

  if (!phone_e164 || !String(text || "").trim()) {
    return res.status(400).json({ message: "phone and text are required" });
  }

  resolveEnquiryByPhone(phone_e164, async (resolveErr, enquiry) => {
    if (resolveErr) {
      // still allow sending
      console.error("resolveEnquiryByPhone:", resolveErr);
    }

    try {
      const data = await sendTextMessage({ toDigits: phone_e164, body: text });
      const wa_message_id = data?.messages?.[0]?.id || null;

      await logOutboundMessage({
        phone_e164,
        wa_message_id,
        body: String(text).trim().slice(0, 4096),
        enquirersid: enquiry?.enquirersid || null,
        customer_name: enquiry?.customer_name || null,
      });

      return res.json({ message: "Sent", wa_message_id });
    } catch (err) {
      console.error("sendTextMessage error:", err?.response?.data || err);
      return res.status(502).json({
        message: "WhatsApp send error",
        details: err?.response?.data || err.message,
      });
    }
  });
};

