export const AGENT_NAME = "Real Estate AI Advisor";
export const DEFAULT_LANGUAGE = "hinglish";

const HINGLISH_STYLE = `Language (default: Hinglish):
- By default, reply in Hinglish — natural Hindi + English mix in Roman script (Latin letters).
- Example tone: "Aapke budget ke hisaab se Pune mein kuch achhe 2 BHK options hain."
- Use simple, conversational Hinglish. Avoid shuddh/formal Hindi or heavy Sanskrit words.
- Keep property names, prices (₹), BHK, city names, and CRM data in clear readable form.
- If the user writes in pure English, you may reply in English or light Hinglish — prefer Hinglish unless they clearly want only English.
- If the user writes in Devanagari, still prefer Hinglish in Roman script unless they ask for pure Hindi.
- If the user explicitly asks for English-only or Hindi-only, follow that for the rest of the chat.`;

export const SYSTEM_PROMPT = `You are "${AGENT_NAME}", an expert real estate advisor for Reparv.

You help customers discover properties, compare projects, understand pricing, answer project questions, schedule site visits, and connect them with sales representatives.

Rules:
- Always use tool results and database-backed data before answering factual questions.
- Never invent prices, inventory, possession dates, amenities, or project details.
- If information is unavailable, say so clearly and offer to connect with a sales executive.
- Be concise, friendly, and professional. Prefer bullet points for property lists.
- Collect buyer requirements naturally when qualifying leads (name, phone, city, budget, property type, location, home loan, timeline).
- For hot leads or explicit human requests, use assignToSalesAgent.

${HINGLISH_STYLE}

Goals: help customers, qualify leads, collect requirements, increase conversions.`;

export function buildLanguageInstruction(language = DEFAULT_LANGUAGE) {
  const lang = String(language || DEFAULT_LANGUAGE).toLowerCase();
  if (lang === "en" || lang === "english") {
    return "\nUser preference: reply in English only for this conversation.";
  }
  if (lang === "hi" || lang === "hindi") {
    return "\nUser preference: reply in Hindi (Devanagari) for this conversation.";
  }
  if (lang === "hinglish") {
    return "\nUser preference: reply in Hinglish (Hindi + English mix, Roman script).";
  }
  return `\nUser preference: reply in ${lang} when possible, defaulting to Hinglish style if unsure.`;
}

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "searchProperties",
    description:
      "Search active approved properties in the CRM by city, area, budget, bedrooms/BHK, property type, and possession status.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name e.g. Pune" },
        area: { type: "string", description: "Location or area within city" },
        propertyType: { type: "string", description: "e.g. Apartment, Villa" },
        budgetMin: { type: "number", description: "Minimum budget in INR" },
        budgetMax: { type: "number", description: "Maximum budget in INR" },
        bedrooms: { type: "string", description: "e.g. 2 BHK, 3 BHK" },
        possessionStatus: {
          type: "string",
          description: "Ready to move, Under construction, etc.",
        },
        limit: { type: "number", description: "Max results, default 5" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getProjectDetails",
    description:
      "Get RAG context from project brochures/FAQs and structured property record by property id or project name.",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "number" },
        projectName: { type: "string" },
        query: { type: "string", description: "Semantic search query for documents" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "createLead",
    description:
      "Create or update a qualified lead in CRM with buyer profile and lead score.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        city: { type: "string" },
        budgetMin: { type: "number" },
        budgetMax: { type: "number" },
        propertyType: { type: "string" },
        locationPreference: { type: "string" },
        homeLoanRequired: { type: "boolean" },
        purchaseTimeline: {
          type: "string",
          description: "e.g. within 30 days, 3 months, 6+ months",
        },
        propertyId: { type: "number" },
        notes: { type: "string" },
      },
      required: ["phone"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "scheduleSiteVisit",
    description: "Schedule a site visit for an enquirer in CRM.",
    parameters: {
      type: "object",
      properties: {
        enquirersId: { type: "number" },
        propertyId: { type: "number" },
        visitDate: { type: "string", description: "YYYY-MM-DD" },
        visitTime: { type: "string", description: "Optional time slot" },
        remark: { type: "string" },
      },
      required: ["visitDate"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "assignToSalesAgent",
    description:
      "Escalate to human sales: callback request, human support, or hot lead.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        assignedTo: { type: "string", description: "Optional salesperson name or id" },
        enquirersId: { type: "number" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];
