import db from "#db";
import moment from "moment-timezone";

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function parseSessionUserId(userId) {
  const raw = String(userId || "");
  if (raw.startsWith("guest:")) {
    return { sessionType: "guest", sessionId: raw.slice(6) };
  }
  if (raw.startsWith("user:")) {
    return { sessionType: "user", sessionId: raw.slice(5) };
  }
  return { sessionType: "unknown", sessionId: raw };
}

function lastMessagePreview(chatHistory) {
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  if (!history.length) return "";
  const last = history[history.length - 1];
  const text = String(last?.content || "").trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function handleDbError(err, res, emptyPayload) {
  if (err?.code === "ER_NO_SUCH_TABLE") {
    return res.json(emptyPayload);
  }
  console.error(err);
  return res.status(500).json({ message: "Database error" });
}

export const listLeads = (req, res) => {
  const { search = "", lead_score, lead_status } = req.query || {};
  const where = ["1=1"];
  const params = [];

  if (lead_score && ["hot", "warm", "cold"].includes(lead_score)) {
    where.push("alp.lead_score = ?");
    params.push(lead_score);
  }

  if (
    lead_status &&
    ["qualifying", "qualified", "human_handoff"].includes(lead_status)
  ) {
    where.push("alp.lead_status = ?");
    params.push(lead_status);
  }

  const q = String(search || "").trim().toLowerCase();
  if (q) {
    where.push(
      `(LOWER(alp.name) LIKE ? OR LOWER(alp.phone) LIKE ? OR LOWER(alp.city) LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const sql = `
    SELECT
      alp.*,
      e.customer AS enquirer_customer,
      e.contact AS enquirer_contact,
      e.status AS enquirer_status,
      p.frontView,
      p.seoSlug,
      ac.channel AS conversation_channel
    FROM ai_lead_profiles alp
    LEFT JOIN enquirers e ON e.enquirersid = alp.enquirersid
    LEFT JOIN properties p ON p.propertyid = e.propertyid
    LEFT JOIN ai_conversations ac ON ac.user_id = alp.user_id
    WHERE ${where.join(" AND ")}
    ORDER BY alp.updated_at DESC
    LIMIT 500
  `;

  db.query(sql, params, (err, rows) => {
    if (err) return handleDbError(err, res, { leads: [] });

    const leads = (rows || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      session: parseSessionUserId(row.user_id),
      enquirersid: row.enquirersid,
      name: row.name,
      phone: row.phone,
      city: row.city,
      budget_min: row.budget_min,
      budget_max: row.budget_max,
      property_type: row.property_type,
      location_preference: row.location_preference,
      home_loan_required: row.home_loan_required,
      purchase_timeline: row.purchase_timeline,
      lead_score: row.lead_score,
      lead_status: row.lead_status,
      assigned_to: row.assigned_to,
      metadata: parseJson(row.metadata, null),
      channel: row.conversation_channel || "web",
      enquirer_customer: row.enquirer_customer,
      enquirer_contact: row.enquirer_contact,
      enquirer_status: row.enquirer_status,
      frontView: row.frontView,
      seoSlug: row.seoSlug,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json({ leads });
  });
};

export const getLeadById = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid lead id" });
  }

  const sql = `
    SELECT
      alp.*,
      e.customer AS enquirer_customer,
      e.contact AS enquirer_contact,
      e.status AS enquirer_status,
      e.message AS enquirer_message,
      p.frontView,
      p.seoSlug,
      p.propertyid,
      ac.channel AS conversation_channel,
      ac.chat_history,
      ac.preferences
    FROM ai_lead_profiles alp
    LEFT JOIN enquirers e ON e.enquirersid = alp.enquirersid
    LEFT JOIN properties p ON p.propertyid = e.propertyid
    LEFT JOIN ai_conversations ac ON ac.user_id = alp.user_id
    WHERE alp.id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) return handleDbError(err, res, { lead: null });
    if (!rows?.length) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const row = rows[0];
    res.json({
      lead: {
        id: row.id,
        user_id: row.user_id,
        session: parseSessionUserId(row.user_id),
        enquirersid: row.enquirersid,
        name: row.name,
        phone: row.phone,
        city: row.city,
        budget_min: row.budget_min,
        budget_max: row.budget_max,
        property_type: row.property_type,
        location_preference: row.location_preference,
        home_loan_required: row.home_loan_required,
        purchase_timeline: row.purchase_timeline,
        lead_score: row.lead_score,
        lead_status: row.lead_status,
        assigned_to: row.assigned_to,
        metadata: parseJson(row.metadata, null),
        channel: row.conversation_channel || "web",
        enquirer: row.enquirersid
          ? {
              enquirersid: row.enquirersid,
              customer: row.enquirer_customer,
              contact: row.enquirer_contact,
              status: row.enquirer_status,
              message: row.enquirer_message,
            }
          : null,
        property: row.propertyid
          ? {
              propertyid: row.propertyid,
              frontView: row.frontView,
              seoSlug: row.seoSlug,
            }
          : null,
        conversation: {
          chat_history: parseJson(row.chat_history, []),
          preferences: parseJson(row.preferences, {}),
        },
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  });
};

export const updateLeadStatus = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid lead id" });
  }

  const { lead_status, assigned_to } = req.body || {};
  const allowed = ["qualifying", "qualified", "human_handoff"];
  const updates = [];
  const params = [];

  if (lead_status != null) {
    if (!allowed.includes(lead_status)) {
      return res.status(400).json({ message: "Invalid lead_status" });
    }
    updates.push("lead_status = ?");
    params.push(lead_status);
  }

  if (assigned_to != null) {
    updates.push("assigned_to = ?");
    params.push(String(assigned_to).trim() || null);
  }

  if (!updates.length) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  const ts = moment().format("YYYY-MM-DD HH:mm:ss");
  updates.push("updated_at = ?");
  params.push(ts, id);

  db.query(
    `UPDATE ai_lead_profiles SET ${updates.join(", ")} WHERE id = ?`,
    params,
    (err, result) => {
      if (err) return handleDbError(err, res, { message: "Database error" });
      if (!result?.affectedRows) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json({ message: "Lead updated successfully" });
    },
  );
};

export const listConversations = (req, res) => {
  const sql = `
    SELECT
      ac.id,
      ac.user_id,
      ac.channel,
      ac.chat_history,
      ac.preferences,
      ac.enquirersid,
      ac.phone_e164,
      ac.language,
      ac.updated_at,
      ac.created_at,
      alp.name AS lead_name,
      alp.lead_score,
      alp.lead_status,
      e.customer AS enquirer_customer
    FROM ai_conversations ac
    LEFT JOIN ai_lead_profiles alp ON alp.user_id = ac.user_id
    LEFT JOIN enquirers e ON e.enquirersid = ac.enquirersid
    ORDER BY ac.updated_at DESC
    LIMIT 500
  `;

  db.query(sql, [], (err, rows) => {
    if (err) return handleDbError(err, res, { conversations: [] });

    const conversations = (rows || []).map((row) => {
      const chatHistory = parseJson(row.chat_history, []);
      const preferences = parseJson(row.preferences, {});
      const session = parseSessionUserId(row.user_id);
      const displayName =
        row.lead_name ||
        row.enquirer_customer ||
        row.phone_e164 ||
        row.user_id;

      return {
        id: row.id,
        user_id: row.user_id,
        session,
        display_name: displayName,
        channel: row.channel,
        phone_e164: row.phone_e164,
        language: row.language,
        enquirersid: row.enquirersid,
        lead_score: row.lead_score,
        lead_status: row.lead_status,
        last_message: lastMessagePreview(chatHistory),
        message_count: chatHistory.length,
        preferences,
        updated_at: row.updated_at,
        created_at: row.created_at,
      };
    });

    res.json({ conversations });
  });
};

export const getConversationByUserId = (req, res) => {
  const userId = decodeURIComponent(String(req.params.userId || "").trim());
  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const sql = `
    SELECT
      ac.*,
      alp.id AS lead_profile_id,
      alp.name AS lead_name,
      alp.phone AS lead_phone,
      alp.city AS lead_city,
      alp.budget_min,
      alp.budget_max,
      alp.property_type,
      alp.location_preference,
      alp.home_loan_required,
      alp.purchase_timeline,
      alp.lead_score,
      alp.lead_status,
      alp.assigned_to,
      alp.metadata AS lead_metadata,
      e.customer AS enquirer_customer,
      e.contact AS enquirer_contact,
      e.status AS enquirer_status
    FROM ai_conversations ac
    LEFT JOIN ai_lead_profiles alp ON alp.user_id = ac.user_id
    LEFT JOIN enquirers e ON e.enquirersid = ac.enquirersid
    WHERE ac.user_id = ?
    LIMIT 1
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) return handleDbError(err, res, { conversation: null });
    if (!rows?.length) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const row = rows[0];
    const chatHistory = parseJson(row.chat_history, []);

    res.json({
      conversation: {
        id: row.id,
        user_id: row.user_id,
        session: parseSessionUserId(row.user_id),
        channel: row.channel,
        phone_e164: row.phone_e164,
        language: row.language,
        enquirersid: row.enquirersid,
        chat_history: chatHistory.map((m, idx) => ({
          id: idx + 1,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content || "",
          at: m.at || null,
          properties: m.properties || null,
          tool_calls: m.toolCalls || m.tool_calls || null,
        })),
        preferences: parseJson(row.preferences, {}),
        lead_profile: row.lead_profile_id
          ? {
              id: row.lead_profile_id,
              name: row.lead_name,
              phone: row.lead_phone,
              city: row.lead_city,
              budget_min: row.budget_min,
              budget_max: row.budget_max,
              property_type: row.property_type,
              location_preference: row.location_preference,
              home_loan_required: row.home_loan_required,
              purchase_timeline: row.purchase_timeline,
              lead_score: row.lead_score,
              lead_status: row.lead_status,
              assigned_to: row.assigned_to,
              metadata: parseJson(row.lead_metadata, null),
            }
          : null,
        enquirer: row.enquirersid
          ? {
              enquirersid: row.enquirersid,
              customer: row.enquirer_customer,
              contact: row.enquirer_contact,
              status: row.enquirer_status,
            }
          : null,
        updated_at: row.updated_at,
        created_at: row.created_at,
      },
    });
  });
};
