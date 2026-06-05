import { runAgent, searchPropertiesDirect, scoreLeadDirect } from "../ai/agent.service.js";
import { getConversation } from "../ai/memory.service.js";
import { getLeadProfile, formatLeadScoreResponse } from "../ai/lead-qualification.tool.js";
import { indexDocument } from "../vector/vector.service.js";
import { handleWhatsAppInbound } from "../whatsapp/webhook.controller.js";

export async function postChat(req, res) {
  try {
    const { userId, message, channel, language } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const result = await runAgent({
      userId: String(userId),
      message,
      channel: channel || "web",
      language: language || "en",
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[ai/chat]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "AI agent error",
    });
  }
}

export async function postWhatsApp(req, res) {
  try {
    const { phone, message, userId } = req.body;
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: "phone and message are required",
      });
    }

    const result = await handleWhatsAppInbound({
      phone_e164: phone,
      textBody: message,
      userId: userId || `wa:${phone}`,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[ai/whatsapp]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "WhatsApp AI error",
    });
  }
}

export async function postSearchProperties(req, res) {
  try {
    const properties = await searchPropertiesDirect(req.body || {});
    return res.json({ success: true, properties });
  } catch (err) {
    console.error("[ai/search-properties]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function postLeadScore(req, res) {
  try {
    const { userId, purchaseTimeline, ...rest } = req.body;
    if (!userId && !purchaseTimeline) {
      return res.status(400).json({
        success: false,
        message: "userId or purchaseTimeline required",
      });
    }

    const result = await scoreLeadDirect({
      userId,
      purchaseTimeline,
      ...rest,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[ai/lead-score]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getConversationByUser(req, res) {
  try {
    const userId = req.params.userId;
    const channel = req.query.channel || "web";
    const conv = await getConversation(userId, channel);
    const lead = await getLeadProfile(userId);

    return res.json({
      success: true,
      userId: conv.userId,
      chatHistory: conv.chatHistory,
      preferences: conv.preferences,
      lead: lead ? formatLeadScoreResponse(lead) : null,
    });
  } catch (err) {
    console.error("[ai/conversation]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/** Admin: index a PDF/text document into RAG (requires auth if mounted protected). */
export async function postIndexDocument(req, res) {
  try {
    const { title, docType, filePath, rawText, propertyId } = req.body;
    if (!title || (!filePath && !rawText)) {
      return res.status(400).json({
        success: false,
        message: "title and (filePath or rawText) required",
      });
    }

    const result = await indexDocument({
      title,
      docType,
      filePath,
      rawText,
      propertyId,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error("[ai/index-document]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
