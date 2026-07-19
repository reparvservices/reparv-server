import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  DEFAULT_LANGUAGE,
  buildLanguageInstruction,
  buildChannelInstruction,
  buildVoiceContextBlock,
} from "./prompt.js";
import {
  getConversation,
  appendMessages,
  buildOpenAIInputFromHistory,
  normalizeChannel,
  CHANNELS,
} from "./memory.js";
import { executeTool } from "./tools/index.js";
import { propertySearch } from "./tools/properties.js";
import {
  calculateLeadScore,
  getLeadProfile,
  formatLeadScoreResponse,
  upsertLeadProfile,
} from "./tools/leads.js";
import {
  resolveChatSessionFromRequest,
  formatSessionResponse,
} from "./session.js";
import {
  buildSalesContextBlock,
  mergeSalesState,
  buildPropertyReply,
  buildVoicePropertyReply,
} from "./salesFlow.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_TOOL_ROUNDS = 8;
const MAX_VOICE_TOOL_ROUNDS = 5;

let openaiClient;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function isAgentEnabled() {
  return process.env.AI_AGENT_ENABLED !== "0";
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isVerbosePropertyReply(text) {
  const raw = String(text || "");
  return (
    raw.length > 200 ||
    /!\[[^\]]*]\(/.test(raw) ||
    /\[[^\]]+]\(https?:\/\//i.test(raw) ||
    /^\s*\d+\.\s+\S/m.test(raw) ||
    (raw.match(/\n/g) || []).length >= 2
  );
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text.trim();

  const parts = [];
  for (const item of response.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        if (c.type === "output_text" && c.text) parts.push(c.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractFunctionCalls(response) {
  return (response.output || []).filter((o) => o.type === "function_call");
}

async function persistPartialLead(storageId, prefs, leadProfile) {
  const patch = {};
  const name = prefs.capturedName || leadProfile?.name;
  const phone = prefs.capturedPhone || leadProfile?.phone;
  const city = prefs.city || leadProfile?.city;

  if (name && name !== leadProfile?.name) patch.name = name;
  if (phone && phone !== leadProfile?.phone) patch.phone = phone;
  if (city && city !== leadProfile?.city) patch.city = city;
  if (prefs.budgetMin != null) patch.budgetMin = prefs.budgetMin;
  if (prefs.budgetMax != null) patch.budgetMax = prefs.budgetMax;
  if (prefs.propertyType) patch.propertyType = prefs.propertyType;
  if (prefs.interestedPropertyId) {
    patch.locationPreference = prefs.interestedPropertyName || undefined;
  }

  if (Object.keys(patch).length) {
    await upsertLeadProfile(storageId, patch).catch(() => null);
  }
}

export async function runAgent({
  session,
  message,
  language = DEFAULT_LANGUAGE,
  channel = CHANNELS.WEB,
  phone = null,
  voiceContext = null,
} = {}) {
  const storageId = session.storageId;
  const resolvedChannel = normalizeChannel(channel);
  const isVoice = resolvedChannel === CHANNELS.VOICE;
  const toolRounds = isVoice ? MAX_VOICE_TOOL_ROUNDS : MAX_TOOL_ROUNDS;

  if (!isAgentEnabled()) {
    return {
      reply: isVoice
        ? "अभी एडवाइजर उपलब्ध नहीं है। कृपया थोड़ी देर बाद कॉल करें।"
        : "Our AI advisor is temporarily unavailable. Please contact our sales team or try again shortly.",
      disabled: true,
    };
  }

  const text = String(message || "").trim();
  if (!text) {
    throw new Error("Message is required");
  }

  const effectiveLanguage = isVoice
    ? language || "hi"
    : language || DEFAULT_LANGUAGE;

  const conv = await getConversation(storageId, resolvedChannel);
  const historyInput = buildOpenAIInputFromHistory(conv.chatHistory);
  const leadProfile = await getLeadProfile(storageId).catch(() => null);

  const { preferences: preIntentPrefs, intent } = mergeSalesState(
    conv,
    text,
    [],
    leadProfile,
  );

  // Seed prefs from voice call qualification when chat memory is empty
  if (isVoice && voiceContext?.collectedData) {
    const vc = voiceContext.collectedData;
    if (vc.city && !preIntentPrefs.city) preIntentPrefs.city = vc.city;
    if (vc.propertyType && !preIntentPrefs.propertyType) {
      preIntentPrefs.propertyType = vc.propertyType;
    }
    if (vc.budget && !preIntentPrefs.budgetMax) {
      const parsed = parseBudgetFromVoice(vc.budget);
      if (parsed.budgetMax) preIntentPrefs.budgetMax = parsed.budgetMax;
      if (parsed.budgetMin) preIntentPrefs.budgetMin = parsed.budgetMin;
    }
  }

  const salesContext = buildSalesContextBlock(
    { ...conv, preferences: preIntentPrefs },
    leadProfile,
    intent,
  );

  const contextBlock =
    (leadProfile
      ? `\nKnown lead profile: ${JSON.stringify(formatLeadScoreResponse(leadProfile))}`
      : "") +
    salesContext +
    buildVoiceContextBlock(voiceContext);

  const openai = getOpenAI();
  const toolResults = [];

  let input = [...historyInput, { role: "user", content: text }];
  let previousResponseId = null;
  let finalText = "";

  for (let round = 0; round < toolRounds; round++) {
    const createParams = {
      model: MODEL,
      instructions:
        SYSTEM_PROMPT +
        buildLanguageInstruction(effectiveLanguage) +
        buildChannelInstruction(resolvedChannel) +
        contextBlock,
      tools: TOOL_DEFINITIONS,
      input,
    };
    if (previousResponseId) {
      createParams.previous_response_id = previousResponseId;
    }

    const response = await openai.responses.create(createParams);
    previousResponseId = response.id;

    const calls = extractFunctionCalls(response);
    if (!calls.length) {
      finalText = extractOutputText(response);
      break;
    }

    const outputs = [];
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }

      if (call.name === "searchProperties") {
        const livePrefs = mergeSalesState(conv, text, toolResults, leadProfile)
          .preferences;
        const shown = livePrefs.shownPropertyIds || [];
        const rotate =
          intent === "show_more" ||
          (shown.length > 0 && !args.excludePropertyIds?.length);
        if (rotate && shown.length) {
          args.excludePropertyIds = shown;
        }
        if (!args.city && livePrefs.city) args.city = livePrefs.city;
        if (!args.city && preIntentPrefs.city) args.city = preIntentPrefs.city;
        if (!args.propertyType && livePrefs.propertyType) {
          args.propertyType = livePrefs.propertyType;
        }
        if (!args.propertyType && preIntentPrefs.propertyType) {
          args.propertyType = preIntentPrefs.propertyType;
        }
        if (livePrefs.budgetMax && args.budgetMax == null) {
          args.budgetMax = livePrefs.budgetMax;
        }
        if (preIntentPrefs.budgetMax && args.budgetMax == null) {
          args.budgetMax = preIntentPrefs.budgetMax;
        }
        if (livePrefs.budgetMin && args.budgetMin == null) {
          args.budgetMin = livePrefs.budgetMin;
        }
        args.searchRound = livePrefs.searchRound || 0;
        args.sortVariant = livePrefs.searchRound || 0;
        if (!args.limit) args.limit = isVoice ? 3 : 5;
      }

      if (call.name === "createLead") {
        const livePrefs = mergeSalesState(conv, text, toolResults, leadProfile)
          .preferences;
        if (!args.name && livePrefs.capturedName) args.name = livePrefs.capturedName;
        if (!args.name && voiceContext?.name) args.name = voiceContext.name;
        if (!args.phone && livePrefs.capturedPhone) args.phone = livePrefs.capturedPhone;
        if (!args.phone && phone) args.phone = String(phone).replace(/\D/g, "").slice(-10);
        if (!args.city && livePrefs.city) args.city = livePrefs.city;
        if (!args.city && preIntentPrefs.city) args.city = preIntentPrefs.city;
        if (!args.budgetMax && livePrefs.budgetMax) args.budgetMax = livePrefs.budgetMax;
        if (!args.budgetMin && livePrefs.budgetMin) args.budgetMin = livePrefs.budgetMin;
        if (!args.propertyId && livePrefs.interestedPropertyId) {
          args.propertyId = livePrefs.interestedPropertyId;
        }
        if (!args.propertyType && livePrefs.propertyType) {
          args.propertyType = livePrefs.propertyType;
        }
      }

      const result = await executeTool(call.name, args, {
        userId: storageId,
        mode: session.mode,
      });
      toolResults.push({ name: call.name, args, result });

      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    input = outputs;
  }

  if (!finalText) {
    finalText = isVoice
      ? "मैं यह पूरा नहीं कर पाई। क्या सेल्स एग्जीक्यूटिव से बात करवाऊँ?"
      : "I could not complete that request. Would you like to speak with a sales executive?";
  }

  const searchResult = toolResults.find((t) => t.name === "searchProperties");
  const properties = searchResult?.result?.properties;

  const { preferences, intent: finalIntent } = mergeSalesState(
    conv,
    text,
    toolResults,
    leadProfile,
  );

  await persistPartialLead(storageId, preferences, leadProfile);

  const updatedLead = await getLeadProfile(storageId).catch(() => leadProfile);
  const leadPhone =
    updatedLead?.phone ||
    preferences.capturedPhone ||
    (phone ? String(phone).replace(/\D/g, "").slice(-10) : null) ||
    null;

  let reply = stripMarkdown(finalText);
  if (properties !== undefined) {
    reply = isVoice
      ? buildVoicePropertyReply(
          preferences.salesStage,
          properties || [],
          finalIntent,
          preferences,
        )
      : buildPropertyReply(
          preferences.salesStage,
          properties || [],
          finalIntent,
          preferences,
        );
  } else if (isVerbosePropertyReply(finalText)) {
    reply = stripMarkdown(finalText).slice(0, isVoice ? 160 : 220);
  }

  if (isVoice) {
    reply = stripMarkdown(reply)
      .replace(/neeche cards[^.।!?]*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 220);
  }

  await appendMessages(
    storageId,
    [
      { role: "user", content: text, at: new Date().toISOString() },
      {
        role: "assistant",
        content: reply,
        at: new Date().toISOString(),
        properties: properties?.length ? properties : undefined,
        toolCalls: toolResults.map((t) => t.name),
      },
    ],
    {
      channel: resolvedChannel,
      preferences: {
        ...preferences,
        sessionMode: session.mode,
        channel: resolvedChannel,
      },
      phone_e164: leadPhone || conv.phone_e164,
      language: effectiveLanguage,
      enquirersid:
        toolResults.find((t) => t.result?.enquirersid)?.result?.enquirersid ||
        conv.enquirersid,
    },
  );

  return {
    reply,
    properties: properties || undefined,
    toolCalls: toolResults.map((t) => t.name),
    lead: formatLeadScoreResponse(updatedLead),
    channel: resolvedChannel,
    session: {
      mode: session.mode,
      userId: session.userId,
      guestId: session.guestId,
    },
  };
}

function parseBudgetFromVoice(raw) {
  const text = String(raw || "").toLowerCase();
  const toInr = (num, unit) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return null;
    if (/cr|crore|करोड़/.test(unit)) return n * 10000000;
    if (/l|lac|lakh|लाख/.test(unit)) return n * 100000;
    return n;
  };

  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore|लाख|करोड़)?\s*(?:to|-|–|से)\s*(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore|लाख|करोड़)?/i,
  );
  if (range) {
    return {
      budgetMin: toInr(range[1], range[2] || "lakh"),
      budgetMax: toInr(range[3], range[4] || range[2] || "lakh"),
    };
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore|लाख|करोड़)/i);
  if (single) {
    return { budgetMax: toInr(single[1], single[2]) };
  }

  return {};
}

export async function searchPropertiesDirect(filters) {
  return propertySearch(filters);
}

export async function scoreLeadDirect({
  mode,
  userId,
  guestId,
  purchaseTimeline,
  ...rest
}) {
  const session = resolveChatSessionFromRequest({ mode, userId, guestId });
  const score = calculateLeadScore(purchaseTimeline);
  await upsertLeadProfile(session.storageId, {
    purchaseTimeline,
    leadScore: score,
    ...rest,
  });
  return {
    leadScore: score,
    session: formatSessionResponse(session),
    ...formatLeadScoreResponse(await getLeadProfile(session.storageId)),
  };
}
