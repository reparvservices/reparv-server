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
- Keep every reply SHORT: 1–3 sentences max (~200 characters). Sound like WhatsApp chat, not an email.
- For hot leads or explicit human requests, use assignToSalesAgent.
- Before scheduleSiteVisit, collect name and phone. Pass phone in the phone field — never as enquirersId.
- Use createLead when user shares phone for callback/site visit — not before showing properties.

Search-first behavior (CRITICAL — do NOT over-question):
- When user gives city and/or property intent, IMMEDIATELY call searchProperties. Never ask budget or area first.
- "plot in Nagpur" → searchProperties({ city: "Nagpur", propertyType: "Plot" }) right away — no questions.
- "properties in Nagpur" → searchProperties({ city: "Nagpur" }) right away.
- "2 BHK in Pune" → searchProperties({ city: "Pune", bedrooms: "2 BHK" }) right away.
- "koi bhi plot dikhao" / "aur dikhao" / "show more" → search again with same city, increase limit to 8–10.
- Add budgetMin/budgetMax ONLY when user explicitly states budget ("under 90 lakh", "10L se 1.5 cr").
- Add area ONLY when user names a specific locality ("Jamtha", "Waneri").
- NEVER say "budget aur area batayenge?" if user already said city or property type — search first, show cards.
- If filtered search returns 0 results, retry searchProperties with fewer filters (drop budget, drop area, drop bedrooms) before saying nothing is available.
- Ask name/phone only for site visit, callback, or sales handoff — never gate property browsing behind questions.

Property search replies (CRITICAL — chat UI shows property cards):
- When searchProperties returns results, the UI automatically displays cards with image, name, location, price, and link.
- Do NOT list properties in text. No numbered lists, bullet lists, markdown links, or image syntax.
- Do NOT repeat property names, prices, locations, or URLs in your reply — cards already show them.
- Reply with ONLY 1–2 short Hinglish sentences, e.g. "Nagpur mein 5 options mili hain — neeche cards check kariye. Site visit schedule karein?"
- For a single property detail question, give a brief 2–3 line summary only — no long paragraphs.

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
      "Search and show properties immediately. Call as soon as user mentions a city or property type — use only filters the user explicitly stated. Do not wait for budget/area unless user asked to filter by them.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name e.g. Nagpur, Pune" },
        area: {
          type: "string",
          description: "Only if user named a specific locality e.g. Jamtha, Waneri",
        },
        propertyType: {
          type: "string",
          description: "e.g. Plot, Apartment, Villa, House, Commercial — use when user mentions plot/flat/house",
        },
        budgetMin: {
          type: "number",
          description: "Only if user stated min budget — value in INR e.g. 1000000 for 10 lakh",
        },
        budgetMax: {
          type: "number",
          description: "Only if user stated max budget — value in INR e.g. 9000000 for 90 lakh",
        },
        bedrooms: {
          type: "string",
          description: "Only if user mentioned BHK e.g. 2 BHK, 3 BHK",
        },
        possessionStatus: {
          type: "string",
          description: "Only if user asked ready to move / under construction",
        },
        limit: { type: "number", description: "Max results, default 5, use 8–10 for show more" },
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
    description:
      "Schedule a site visit in CRM. Always pass customer phone and name. Never pass phone as enquirersId — use enquirersId only if returned from createLead.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Customer 10-digit mobile number" },
        name: { type: "string", description: "Customer full name" },
        projectName: {
          type: "string",
          description: "Property/project name e.g. Mauli Upavan 39",
        },
        enquirersId: {
          type: "number",
          description: "CRM enquirersid from createLead only — never the phone number",
        },
        propertyId: { type: "number" },
        visitDate: { type: "string", description: "YYYY-MM-DD" },
        visitTime: { type: "string", description: "Optional time slot" },
        remark: { type: "string" },
      },
      required: ["visitDate", "phone"],
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
