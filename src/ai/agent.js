import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  DEFAULT_LANGUAGE,
  buildLanguageInstruction,
} from "./prompt.js";
import {
  getConversation,
  appendMessages,
  buildOpenAIInputFromHistory,
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

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_TOOL_ROUNDS = 8;

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

function extractCityFromProperties(properties = []) {
  for (const p of properties) {
    const loc = String(p.location || "").trim();
    if (!loc) continue;
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return null;
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

function compactPropertyReply(text, properties = []) {
  const count = properties.length;
  if (!count) return stripMarkdown(text);

  const cleaned = stripMarkdown(text);
  if (!isVerbosePropertyReply(text) && cleaned.length <= 200) {
    return cleaned;
  }

  const city = extractCityFromProperties(properties) || "Yahan";
  const noun = count === 1 ? "property" : `${count} properties`;

  return `${city} mein ${noun} mili hain — neeche cards check kariye. Kisi pe details ya site visit chahiye?`;
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

function mergePreferences(conv, userMessage, toolResults) {
  const prefs = { ...conv.preferences };
  const budgetMatch = userMessage.match(/(\d+)\s*(lakh|lac|cr|crore)/gi);
  if (budgetMatch) prefs.budget = budgetMatch.join(" ");
  const cityMatch = userMessage.match(
    /\b(Pune|Mumbai|Bangalore|Bengaluru|Hyderabad|Delhi|Noida|Gurgaon|Chennai|Kolkata|Ahmedabad)\b/i,
  );
  if (cityMatch) prefs.city = cityMatch[0];
  if (/bhk|2\s*bhk|3\s*bhk/i.test(userMessage)) {
    prefs.propertyType = userMessage.match(/\d\s*bhk/i)?.[0] || prefs.propertyType;
  }

  for (const tr of toolResults) {
    if (tr.name === "createLead" && tr.result?.leadScore) {
      prefs.leadScore = tr.result.leadScore;
    }
  }
  return prefs;
}

export async function runAgent({ session, message, language = DEFAULT_LANGUAGE }) {
  const storageId = session.storageId;
  if (!isAgentEnabled()) {
    return {
      reply:
        "Our AI advisor is temporarily unavailable. Please contact our sales team or try again shortly.",
      disabled: true,
    };
  }

  const text = String(message || "").trim();
  if (!text) {
    throw new Error("Message is required");
  }

  const conv = await getConversation(storageId);
  const historyInput = buildOpenAIInputFromHistory(conv.chatHistory);
  const leadProfile = await getLeadProfile(storageId).catch(() => null);

  const contextBlock = leadProfile
    ? `\nKnown lead profile: ${JSON.stringify(formatLeadScoreResponse(leadProfile))}`
    : "";

  const openai = getOpenAI();
  const toolResults = [];

  let input = [...historyInput, { role: "user", content: text }];
  let previousResponseId = null;
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const createParams = {
      model: MODEL,
      instructions:
        SYSTEM_PROMPT + buildLanguageInstruction(language) + contextBlock,
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
    finalText =
      "I could not complete that request. Would you like to speak with a sales executive?";
  }

  const properties = toolResults.find((t) => t.name === "searchProperties")
    ?.result?.properties;

  const reply =
    properties?.length > 0
      ? compactPropertyReply(finalText, properties)
      : stripMarkdown(finalText);

  const preferences = mergePreferences(conv, text, toolResults);
  const leadPhone = leadProfile?.phone || null;

  await appendMessages(
    storageId,
    [
      { role: "user", content: text, at: new Date().toISOString() },
      { role: "assistant", content: reply, at: new Date().toISOString() },
    ],
    {
      preferences: { ...preferences, sessionMode: session.mode },
      phone_e164: leadPhone || conv.phone_e164,
      language,
      enquirersid:
        toolResults.find((t) => t.result?.enquirersid)?.result?.enquirersid ||
        conv.enquirersid,
    },
  );

  return {
    reply,
    properties: properties || undefined,
    toolCalls: toolResults.map((t) => t.name),
    lead: formatLeadScoreResponse(
      await getLeadProfile(storageId).catch(() => null),
    ),
    session: {
      mode: session.mode,
      userId: session.userId,
      guestId: session.guestId,
    },
  };
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
