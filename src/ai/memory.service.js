import moment from "moment-timezone";
import db from "#db/promise";

const MAX_HISTORY = 40;

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export async function getConversation(userId, channel = "web") {
  const [rows] = await db.query(
    `SELECT * FROM ai_conversations WHERE user_id = ? AND channel = ? LIMIT 1`,
    [userId, channel],
  );
  if (!rows?.length) {
    return {
      userId,
      channel,
      chatHistory: [],
      preferences: { budget: "", city: "", propertyType: "" },
      enquirersid: null,
      phone_e164: null,
      language: "en",
    };
  }
  const row = rows[0];
  return {
    userId: row.user_id,
    channel: row.channel,
    chatHistory: parseJson(row.chat_history, []),
    preferences: parseJson(row.preferences, {
      budget: "",
      city: "",
      propertyType: "",
    }),
    enquirersid: row.enquirersid,
    phone_e164: row.phone_e164,
    language: row.language || "en",
  };
}

export async function saveConversation({
  userId,
  channel = "web",
  chatHistory,
  preferences,
  enquirersid,
  phone_e164,
  language,
}) {
  const trimmed = (chatHistory || []).slice(-MAX_HISTORY);
  const ts = now();
  const prefsJson = JSON.stringify(
    preferences || { budget: "", city: "", propertyType: "" },
  );
  const histJson = JSON.stringify(trimmed);

  await db.query(
    `INSERT INTO ai_conversations
      (user_id, channel, chat_history, preferences, enquirersid, phone_e164, language, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       chat_history = VALUES(chat_history),
       preferences = VALUES(preferences),
       enquirersid = COALESCE(VALUES(enquirersid), enquirersid),
       phone_e164 = COALESCE(VALUES(phone_e164), phone_e164),
       language = VALUES(language),
       updated_at = VALUES(updated_at)`,
    [
      userId,
      channel,
      histJson,
      prefsJson,
      enquirersid || null,
      phone_e164 || null,
      language || "en",
      ts,
      ts,
    ],
  );

  return getConversation(userId, channel);
}

export async function appendMessages(userId, channel, newMessages, updates = {}) {
  const conv = await getConversation(userId, channel);
  const chatHistory = [...conv.chatHistory, ...newMessages].slice(-MAX_HISTORY);
  const preferences = { ...conv.preferences, ...(updates.preferences || {}) };

  return saveConversation({
    userId,
    channel,
    chatHistory,
    preferences,
    enquirersid: updates.enquirersid ?? conv.enquirersid,
    phone_e164: updates.phone_e164 ?? conv.phone_e164,
    language: updates.language ?? conv.language,
  });
}

export function buildOpenAIInputFromHistory(chatHistory) {
  return (chatHistory || []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}
