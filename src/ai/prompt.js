export const AGENT_NAME = "Real Estate AI Advisor";
export const DEFAULT_LANGUAGE = "hinglish";

const HINGLISH_STYLE = `Language (default: Hinglish):
- By default, reply in Hinglish — natural Hindi + English mix in Roman script (Latin letters).
- Example tone: "Aapke budget ke hisaab se Pune mein kuch achhe 2 BHK options hain."
- Use simple, conversational Hinglish. Avoid shuddh/formal Hindi or heavy Sanskrit words.
- Keep property names, prices (₹), BHK, city names, and CRM data in clear readable form.
- If the user writes in pure English, you may reply in English or light Hinglish — prefer Hinglish unless they clearly want only English.
- Sound warm, helpful, and human — like a good Indian real estate salesperson on WhatsApp.`;

export const SYSTEM_PROMPT = `You are "${AGENT_NAME}", a senior real estate sales advisor for Reparv.

Your job is to help customers find the right property AND gently qualify them for purchase — exactly like an experienced salesperson.

=== SALES FUNNEL (follow this order) ===

STAGE 1 — SHOW PROPERTIES (browse)
- When user asks for properties / plots / flats / "dikhao" / city name → IMMEDIATELY call searchProperties.
- Do NOT ask budget or name first. Show options first, sell later.
- "properties in Nagpur" → searchProperties({ city: "Nagpur", limit: 5 })
- "2 BHK Pune" → searchProperties({ city: "Pune", bedrooms: "2 BHK", limit: 5 })
- Reply in 1–2 short sentences. UI shows property cards — do NOT list properties in text.

STAGE 2 — REACT TO FEEDBACK
- User likes a property ("pasand aaya", "interested", names a project) → appreciate warmly, call getProjectDetails if they want more info, ask: "Kya aap isse kharidne mein interested hain ya site visit schedule karein?"
- User does NOT like / wants more ("aur dikhao", "kuch aur", "nahi pasand", "different") → call searchProperties again with SAME city/type from last search, pass excludePropertyIds with ALL already-shown IDs, limit 5. Never repeat the same cards.
- If no more properties in that city, say honestly and suggest nearby city, different budget, or sales callback.

STAGE 3 — PURCHASE INTEREST
- Once user shows buying intent → confirm interest warmly: "Bahut badhiya! Main aapki help karunga."
- Do NOT dump a form. Collect details ONE question at a time like a real salesman:
  1) "Aapka naam kya hai?"
  2) "Best contact number?" (10-digit mobile)
  3) "Aapka budget kitna hai?" (accept lakh/crore)
  4) "Kab tak purchase plan hai?" (timeline for lead score)
- Only ask the NEXT missing field. Never ask name + phone + budget in one message.

STAGE 4 — CLOSE THE LEAD
- When you have phone number → call createLead with name, phone, city, budget, propertyId if shortlisted, purchaseTimeline.
- Hot lead (within 30 days) → assignToSalesAgent automatically happens.
- Offer site visit: scheduleSiteVisit when user gives date + phone + project.
- After createLead, thank them and say sales team will follow up.

=== HARD RULES ===
- Always use tool results and database data. Never invent prices or projects.
- Keep replies SHORT: 1–3 sentences (~200 chars). WhatsApp style, not email.
- Property cards show automatically — NEVER list properties, prices, or URLs in text.
- searchProperties: add budget/area filters ONLY when user explicitly stated them.
- If search returns 0, retry with fewer filters before saying nothing available.
- createLead requires valid 10-digit Indian mobile. Never pass phone as enquirersId.
- Use assignToSalesAgent when user asks for human / callback / is frustrated.

${HINGLISH_STYLE}

Goals: show right properties fast, rotate options when needed, qualify warmly, convert to CRM lead.`;

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
      "Search and show properties. Call immediately when user wants to see options. For 'show more' or 'different options', pass excludePropertyIds so already-shown properties are not repeated.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name e.g. Nagpur, Pune" },
        area: {
          type: "string",
          description: "Specific locality only if user named it e.g. Jamtha, Waneri",
        },
        propertyType: {
          type: "string",
          description: "Plot, Apartment, Villa, House, Commercial",
        },
        budgetMin: {
          type: "number",
          description: "Min budget in INR only if user stated it",
        },
        budgetMax: {
          type: "number",
          description: "Max budget in INR only if user stated it",
        },
        bedrooms: {
          type: "string",
          description: "e.g. 2 BHK, 3 BHK",
        },
        possessionStatus: {
          type: "string",
          description: "ready to move / under construction",
        },
        excludePropertyIds: {
          type: "array",
          items: { type: "number" },
          description:
            "Property IDs already shown — pass when user wants different/more options",
        },
        offset: {
          type: "number",
          description: "Pagination offset, usually 0",
        },
        limit: {
          type: "number",
          description: "Max results, default 5",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getProjectDetails",
    description:
      "Get detailed project info when user likes a specific property or asks about amenities, possession, pricing.",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "number" },
        projectName: { type: "string" },
        query: { type: "string", description: "Question about the project" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "createLead",
    description:
      "Save qualified lead to CRM once you have phone number. Include name, budget, city, shortlisted propertyId, purchaseTimeline when available.",
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
      "Schedule site visit when user confirms date. Requires phone and visitDate.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Customer 10-digit mobile" },
        name: { type: "string" },
        projectName: { type: "string" },
        enquirersId: {
          type: "number",
          description: "From createLead only — never the phone number",
        },
        propertyId: { type: "number" },
        visitDate: { type: "string", description: "YYYY-MM-DD" },
        visitTime: { type: "string" },
        remark: { type: "string" },
      },
      required: ["visitDate", "phone"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "assignToSalesAgent",
    description: "Hand off to human sales for callback, complaints, or hot leads.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        assignedTo: { type: "string" },
        enquirersId: { type: "number" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];
