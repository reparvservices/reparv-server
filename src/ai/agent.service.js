import OpenAI from "openai";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "./prompt.js";
import {
  getConversation,
  appendMessages,
  buildOpenAIInputFromHistory,
} from "./memory.service.js";
import { propertySearch } from "./property-search.tool.js";
import { getProjectDetails } from "./project-info.tool.js";
import { createLead, assignToSalesAgent } from "./crm.tool.js";
import { scheduleSiteVisit } from "./site-visit.tool.js";
import {
  calculateLeadScore,
  getLeadProfile,
  formatLeadScoreResponse,
  upsertLeadProfile,
} from "./lead-qualification.tool.js";

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

async function executeTool(name, args, context) {
  const { userId, channel, phone } = context;

  switch (name) {
    case "searchProperties":
      return { properties: await propertySearch(args) };

    case "getProjectDetails":
      return await getProjectDetails(args);

    case "createLead": {
      const result = await createLead({ userId, ...args });
      const score = calculateLeadScore(args.purchaseTimeline);
      if (score === "hot") {
        await assignToSalesAgent({
          userId,
          reason: "Hot lead — purchase within 30 days",
          enquirersId: result.enquirersid,
        });
      }
      return result;
    }

    case "scheduleSiteVisit":
      return scheduleSiteVisit({
        ...args,
        enquirersId: args.enquirersId,
        userId,
        phone,
      });

    case "assignToSalesAgent":
      return assignToSalesAgent({
        userId,
        reason: args.reason,
        assignedTo: args.assignedTo,
        enquirersId: args.enquirersId,
      });

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function mergePreferences(conv, userMessage, toolResults) {
  const prefs = { ...conv.preferences };
  const budgetMatch = userMessage.match(
    /(\d+)\s*(lakh|lac|cr|crore)/gi,
  );
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

/**
 * Run the Real Estate AI Advisor for one user turn.
 */
export async function runAgent({
  userId,
  message,
  channel = "web",
  phone = null,
  language = "en",
}) {
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

  const conv = await getConversation(userId, channel);
  const historyInput = buildOpenAIInputFromHistory(conv.chatHistory);
  const leadProfile = await getLeadProfile(userId).catch(() => null);

  const contextBlock = leadProfile
    ? `\nKnown lead profile: ${JSON.stringify(formatLeadScoreResponse(leadProfile))}`
    : "";

  const openai = getOpenAI();
  const toolResults = [];

  let input = [
    ...historyInput,
    {
      role: "user",
      content: text,
    },
  ];

  let previousResponseId = null;
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const createParams = {
      model: MODEL,
      instructions: SYSTEM_PROMPT + contextBlock,
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
        userId,
        channel,
        phone,
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

  const preferences = mergePreferences(conv, text, toolResults);

  await appendMessages(
    userId,
    channel,
    [
      { role: "user", content: text, at: new Date().toISOString() },
      { role: "assistant", content: finalText, at: new Date().toISOString() },
    ],
    {
      preferences,
      phone_e164: phone || conv.phone_e164,
      language,
      enquirersid:
        toolResults.find((t) => t.result?.enquirersid)?.result?.enquirersid ||
        conv.enquirersid,
    },
  );

  const properties = toolResults.find((t) => t.name === "searchProperties")
    ?.result?.properties;

  return {
    reply: finalText,
    properties: properties || undefined,
    toolCalls: toolResults.map((t) => t.name),
    lead: formatLeadScoreResponse(await getLeadProfile(userId).catch(() => null)),
  };
}

export async function searchPropertiesDirect(filters) {
  return propertySearch(filters);
}

export async function scoreLeadDirect({ userId, purchaseTimeline, ...rest }) {
  const score = calculateLeadScore(purchaseTimeline);
  if (userId) {
    await upsertLeadProfile(userId, {
      purchaseTimeline,
      leadScore: score,
      ...rest,
    });
  }
  return {
    leadScore: score,
    ...(userId
      ? formatLeadScoreResponse(await getLeadProfile(userId))
      : {}),
  };
}
