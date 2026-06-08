import { renderAgentChatPage } from "./pages/agentChat.page.js";
import { getConversation } from "./memory.js";
import { resolveChatSession, CHAT_MODES } from "./session.js";

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

    const conv = await getConversation(session.storageId);
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
    });
  } catch (err) {
    console.error("[ai/history]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load conversation history.",
    });
  }
}
