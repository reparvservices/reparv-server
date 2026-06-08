import { runAgent } from "../ai/agent.service.js";

export async function postChat(req, res) {
  try {
    const { userId, message, language } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: "message is required" });
    }

    const result = await runAgent({
      userId: String(userId),
      message,
      channel: "web",
      language: language || "en",
    });

    return res.json({
      success: true,
      reply: result.reply,
    });
  } catch (err) {
    console.error("[ai/chat]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "AI agent error",
    });
  }
}
