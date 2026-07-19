import moment from "moment-timezone";
import db from "#db/promise";
import { DEFAULT_LANGUAGE } from "./prompt.js";

export const CHANNELS = {
  WEB: "web",
  VOICE: "voice",
};

const DEFAULT_CHANNEL = CHANNELS.WEB;
const MAX_HISTORY = 40;
const MAX_VOICE_HISTORY = 24;

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

export function normalizeChannel(channel) {
  const c = String(channel || DEFAULT_CHANNEL).toLowerCase().trim();
  if (c === CHANNELS.VOICE) return CHANNELS.VOICE;
  return CHANNELS.WEB;
}

function historyLimit(channel) {
  return normalizeChannel(channel) === CHANNELS.VOICE
    ? MAX_VOICE_HISTORY
    : MAX_HISTORY;
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

export async function getConversation(userId, channel = DEFAULT_CHANNEL) {
  const resolvedChannel = normalizeChannel(channel);
  const [rows] = await db.query(
    `SELECT * FROM ai_conversations WHERE user_id = ? AND channel = ? LIMIT 1`,
    [userId, resolvedChannel],
  );
  if (!rows?.length) {
    return {
      userId,
      channel: resolvedChannel,
      chatHistory: [],
      preferences: { budget: "", city: "", propertyType: "" },
      enquirersid: null,
      phone_e164: null,
      language: DEFAULT_LANGUAGE,
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
    language: row.language || DEFAULT_LANGUAGE,
  };
}

async function saveConversation({
  userId,
  channel = DEFAULT_CHANNEL,
  chatHistory,
  preferences,
  enquirersid,
  phone_e164,
  language,
}) {
  const resolvedChannel = normalizeChannel(channel);
  const trimmed = (chatHistory || []).slice(-historyLimit(resolvedChannel));
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
      resolvedChannel,
      histJson,
      prefsJson,
      enquirersid || null,
      phone_e164 || null,
      language || DEFAULT_LANGUAGE,
      ts,
      ts,
    ],
  );

  return getConversation(userId, resolvedChannel);
}

export async function appendMessages(userId, newMessages, updates = {}) {
  const channel = normalizeChannel(updates.channel);
  const conv = await getConversation(userId, channel);
  const chatHistory = [...conv.chatHistory, ...newMessages].slice(
    -historyLimit(channel),
  );
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
