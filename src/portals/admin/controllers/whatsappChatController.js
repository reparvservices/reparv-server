import {
  sendTextMessage,
  normalizePhoneE164,
  resolveEnquiryByPhone,
  logOutboundMessage,
} from "#utils/whatsappAdminChat.js";
import db from "#db";

/** Turn a WhatsApp Cloud API error into something an admin can act on. */
function describeWhatsAppError(err) {
  const e = err?.response?.data?.error || err?.error || {};
  const code = Number(e.code);
  if (code === 190) {
    return "WhatsApp access token has expired. Update WHATSAPP_ACCESS_TOKEN on the server (use a permanent System User token).";
  }
  if (code === 131047) {
    return "More than 24 hours since this customer last messaged you. WhatsApp only allows approved template messages until they reply.";
  }
  if (code === 131026 || code === 131030) {
    return "This number can't receive WhatsApp messages (not on WhatsApp or not allowed for this account).";
  }
  if (code === 131056 || code === 130429 || code === 80007) {
    return "WhatsApp rate limit reached. Wait a moment and try again.";
  }
  if (code === 100 || code === 10 || code === 200) {
    return `WhatsApp rejected the request (${e.message || "permission or parameter error"}). Check the phone number ID and token permissions.`;
  }
  return e.message || err?.message || "WhatsApp send error";
}

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
        message: describeWhatsAppError(err),
        code: err?.response?.data?.error?.code || null,
      });
    }
  });
};

