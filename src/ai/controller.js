import { renderAgentChatPage } from "./pages/agentChat.page.js";
import { getConversation, normalizeChannel, CHANNELS } from "./memory.js";
import { runAgent } from "./agent.js";
import {
  resolveChatSession,
  resolveChatSessionFromRequest,
  formatSessionResponse,
  CHAT_MODES,
} from "./session.js";
import { DEFAULT_LANGUAGE } from "./prompt.js";

export function getAgentPage(req, res) {
  res.type("html").send(renderAgentChatPage(req));
}

export async function getConversationHistory(req, res) {
  try {
    const userId = req.guestUser?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Login required to load conversation history.",
      });
    }

    const session = resolveChatSession({
      mode: CHAT_MODES.USER,
      userId: String(userId),
    });

    const channel = normalizeChannel(req.query?.channel);
    const conv = await getConversation(session.storageId, channel);
    const messages = (conv.chatHistory || []).map((entry, index) => ({
      id: `history-${index}`,
      role:
        entry.role === "assistant"
          ? "bot"
          : entry.role === "user"
            ? "user"
            : "bot",
      text: entry.content || "",
    }));

    return res.json({
      success: true,
      messages,
      channel: conv.channel,
    });
  } catch (err) {
    console.error("[ai/history]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load conversation history.",
    });
  }
}

export async function postAgentChat(req, res) {
  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        type: "error",
        message: "message is required",
      });
    }

    const channel = normalizeChannel(body.channel);
    const session = resolveChatSessionFromRequest(body);
    const language =
      body.language ||
      (channel === CHANNELS.VOICE ? "hi" : DEFAULT_LANGUAGE);

    const result = await runAgent({
      session,
      message,
      language,
      channel,
      phone: body.phone || body.phone_e164 || null,
      voiceContext: body.voiceContext || null,
    });

    return res.json({
      type: "reply",
      session: formatSessionResponse(session),
      reply: result.reply,
      properties: result.properties,
      toolCalls: result.toolCalls,
      lead: result.lead,
      channel: result.channel || channel,
      disabled: result.disabled || false,
    });
  } catch (err) {
    console.error("[ai/chat]", err);
    return res.status(500).json({
      type: "error",
      message: err.message || "AI agent error",
    });
  }
}
