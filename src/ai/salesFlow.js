export const SALES_STAGES = {
  GREET: "greet",
  BROWSING: "browsing",
  SHORTLIST: "shortlist",
  QUALIFYING: "qualifying",
  COLLECTING: "collecting",
  QUALIFIED: "qualified",
};

const CITY_PATTERN =
  /\b(Pune|Mumbai|Bangalore|Bengaluru|Hyderabad|Delhi|Noida|Gurgaon|Gurugram|Chennai|Kolkata|Ahmedabad|Nagpur|Nashik|Aurangabad|Thane|Navi Mumbai|Indore|Bhopal|Jaipur|Surat|Vadodara|Lucknow|Kanpur|Coimbatore|Kochi|Trivandrum|Visakhapatnam|Vizag|Patna|Ranchi|Raipur|Bhubaneswar|Chandigarh|Ludhiana|Dehradun|Goa)\b/i;

const SHOW_MORE_PATTERN =
  /\b(aur|or|more|kuch aur|dusre|different|alag|koi aur|show more|other options|nahi pasand|pasand nahi|nahi aaya|don't like|not interested in these|koi option nahi)\b/i;

const INTERESTED_PATTERN =
  /\b(pasand|interest|interested|like|liked|yeh wala|ye wala|isko|is project|is property|book|final|shortlist|site visit|visit chahiye|details chahiye|tell me more about|muje yeh|mujhe yeh|mujhe ye)\b/i;

const PURCHASE_INTENT_PATTERN =
  /\b(kharidna|kharid|purchase|buy|booking|book kar|lena hai|le sakta|le sakti|ready to buy|invest)\b/i;

const PHONE_PATTERN = /(?:\+91[\s-]?)?[6-9]\d{9}\b/;

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  return [];
}

export function detectIntent(message = "") {
  const text = String(message).trim();
  const lower = text.toLowerCase();

  if (PHONE_PATTERN.test(text)) return "share_phone";
  if (PURCHASE_INTENT_PATTERN.test(lower)) return "purchase_intent";
  if (SHOW_MORE_PATTERN.test(lower)) return "show_more";
  if (INTERESTED_PATTERN.test(lower)) return "interested";

  if (/^(hi|hello|hey|namaste|namaskar|good morning|good evening)\b/i.test(lower)) {
    return "greet";
  }

  if (
    /\b(property|properties|plot|flat|apartment|bhk|villa|dikhao|show|search|options|dekh|list)\b/i.test(
      lower,
    )
  ) {
    return "search";
  }

  return "general";
}

export function parseBudget(message = "") {
  const text = String(message).toLowerCase();
  const toInr = (num, unit) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return null;
    if (/cr|crore/.test(unit)) return n * 10000000;
    if (/l|lac|lakh/.test(unit)) return n * 100000;
    return n;
  };

  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore)?\s*(?:to|se|-|–)\s*(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore)?/i,
  );
  if (range) {
    return {
      budgetMin: toInr(range[1], range[2] || "lakh"),
      budgetMax: toInr(range[3], range[4] || range[2] || "lakh"),
    };
  }

  const under = text.match(
    /(?:under|below|upto|up to|max|within|se kam)\s*(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore)?/i,
  );
  if (under) {
    return { budgetMax: toInr(under[1], under[2] || "lakh") };
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore)/i);
  if (single) {
    const val = toInr(single[1], single[2]);
    return { budgetMax: val };
  }

  return {};
}

export function parsePhone(message = "") {
  const match = String(message).match(PHONE_PATTERN);
  if (!match) return null;
  let d = match[0].replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  return d.length >= 10 ? d.slice(-10) : null;
}

export function parseName(message = "") {
  const text = String(message).trim();
  const patterns = [
    /(?:my name is|i am|i'm|this is|mera naam|naam hai)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i,
    /^([A-Za-z][A-Za-z\s.'-]{2,30})$/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = m[1].trim();
      if (!/^(yes|no|ok|okay|hi|hello|thanks|thank you)$/i.test(name)) {
        return name;
      }
    }
  }
  return null;
}

function extractCity(message = "") {
  const m = String(message).match(CITY_PATTERN);
  return m ? m[1] : null;
}

function extractPropertyType(message = "") {
  const text = String(message).toLowerCase();
  if (/\d\s*bhk/.test(text)) return text.match(/\d\s*bhk/i)[0];
  if (/plot|zameen|land/.test(text)) return "Plot";
  if (/villa/.test(text)) return "Villa";
  if (/flat|apartment/.test(text)) return "Apartment";
  if (/commercial|shop|office/.test(text)) return "Commercial";
  return null;
}

function uniqueIds(ids = []) {
  return [...new Set(ids.map((id) => Number(id)).filter((id) => id > 0))];
}

function inferStage(prefs, leadProfile, intent) {
  if (leadProfile?.phone && leadProfile?.lead_status === "qualified") {
    return SALES_STAGES.QUALIFIED;
  }
  if (leadProfile?.phone || prefs.capturedPhone) {
    return SALES_STAGES.COLLECTING;
  }
  if (intent === "purchase_intent" || prefs.interestedPropertyId) {
    return SALES_STAGES.QUALIFYING;
  }
  if (intent === "interested" || prefs.interestedPropertyId) {
    return SALES_STAGES.SHORTLIST;
  }
  if (prefs.shownPropertyIds?.length || intent === "search" || intent === "show_more") {
    return SALES_STAGES.BROWSING;
  }
  return prefs.salesStage || SALES_STAGES.GREET;
}

export function mergeSalesState(conv, userMessage, toolResults, leadProfile) {
  const prefs = { ...(conv.preferences || {}) };
  const intent = detectIntent(userMessage);

  const budget = parseBudget(userMessage);
  if (budget.budgetMin != null) prefs.budgetMin = budget.budgetMin;
  if (budget.budgetMax != null) prefs.budgetMax = budget.budgetMax;
  if (budget.budgetMin != null || budget.budgetMax != null) {
    prefs.budget = userMessage.match(/(\d+.*?(?:lakh|lac|cr|crore).*?)/i)?.[0] || prefs.budget;
  }

  const city = extractCity(userMessage);
  if (city) prefs.city = city;

  const propertyType = extractPropertyType(userMessage);
  if (propertyType) prefs.propertyType = propertyType;

  const phone = parsePhone(userMessage);
  if (phone) prefs.capturedPhone = phone;

  const name = parseName(userMessage);
  if (name) prefs.capturedName = name;

  const shown = uniqueIds(parseJsonArray(prefs.shownPropertyIds));

  for (const tr of toolResults) {
    if (tr.name === "searchProperties") {
      const ids = (tr.result?.properties || []).map((p) => p.propertyId);
      prefs.shownPropertyIds = uniqueIds([...shown, ...ids]);
      prefs.searchRound = (Number(prefs.searchRound) || 0) + 1;
      prefs.lastSearch = { ...(tr.args || {}), at: new Date().toISOString() };
      if (tr.args?.city) prefs.city = tr.args.city;
      if (tr.args?.propertyType) prefs.propertyType = tr.args.propertyType;
    }

    if (tr.name === "getProjectDetails" && tr.args?.propertyId) {
      prefs.interestedPropertyId = tr.args.propertyId;
      if (tr.args?.projectName) prefs.interestedPropertyName = tr.args.projectName;
    }

    if (tr.name === "createLead") {
      prefs.salesStage = SALES_STAGES.QUALIFIED;
      if (tr.result?.leadScore) prefs.leadScore = tr.result.leadScore;
    }
  }

  if (intent === "interested" && toolResults.find((t) => t.name === "searchProperties")) {
    const first = toolResults.find((t) => t.name === "searchProperties")?.result
      ?.properties?.[0];
    if (first?.propertyId) {
      prefs.interestedPropertyId = first.propertyId;
      prefs.interestedPropertyName = first.projectName;
    }
  }

  prefs.salesStage = inferStage(prefs, leadProfile, intent);

  if (intent === "show_more") {
    prefs.salesStage = SALES_STAGES.BROWSING;
  }
  if (intent === "purchase_intent") {
    prefs.salesStage = SALES_STAGES.QUALIFYING;
  }

  return { preferences: prefs, intent };
}

export function buildSalesContextBlock(conv, leadProfile, intent) {
  const prefs = conv.preferences || {};
  const shown = uniqueIds(parseJsonArray(prefs.shownPropertyIds));
  const lastSearch = prefs.lastSearch || {};
  const stage = prefs.salesStage || SALES_STAGES.GREET;

  const missing = [];
  if (!leadProfile?.name && !prefs.capturedName) missing.push("name");
  if (!leadProfile?.phone && !prefs.capturedPhone) missing.push("phone");
  if (!leadProfile?.budget_max && !prefs.budgetMax && !prefs.budget) {
    missing.push("budget");
  }
  if (!leadProfile?.purchase_timeline) missing.push("purchase_timeline");

  const lines = [
    "",
    "=== SALES CONVERSATION STATE (act like a top Indian real estate salesperson) ===",
    `Funnel stage: ${stage}`,
    `User intent this message: ${intent}`,
  ];

  if (prefs.city) lines.push(`Target city: ${prefs.city}`);
  if (prefs.propertyType) lines.push(`Property type interest: ${prefs.propertyType}`);
  if (prefs.budget || prefs.budgetMax) {
    lines.push(`Budget mentioned: ${prefs.budget || prefs.budgetMax}`);
  }
  if (shown.length) {
    lines.push(
      `Already shown property IDs (never repeat in searchProperties — pass excludePropertyIds): [${shown.join(", ")}]`,
    );
  }
  if (prefs.interestedPropertyId) {
    lines.push(
      `User interested in property ID ${prefs.interestedPropertyId}${prefs.interestedPropertyName ? ` (${prefs.interestedPropertyName})` : ""}`,
    );
  }
  if (lastSearch.city || lastSearch.propertyType) {
    lines.push(`Last search filters: ${JSON.stringify(lastSearch)}`);
  }
  if (prefs.capturedName) lines.push(`Captured name (not yet in CRM): ${prefs.capturedName}`);
  if (prefs.capturedPhone) lines.push(`Captured phone (not yet in CRM): ${prefs.capturedPhone}`);
  if (missing.length) lines.push(`Still need from customer: ${missing.join(", ")}`);

  if (intent === "show_more" && shown.length) {
    lines.push(
      "ACTION: User wants DIFFERENT options. Call searchProperties with same city/type from lastSearch, excludePropertyIds from list above, limit 5.",
    );
  }
  if (intent === "interested" && prefs.interestedPropertyId) {
    lines.push(
      "ACTION: User likes a property. Briefly appreciate choice, use getProjectDetails if needed, then ask if they want to purchase / site visit.",
    );
  }
  if (intent === "purchase_intent" || stage === SALES_STAGES.QUALIFYING) {
    lines.push(
      "ACTION: Ask purchase intent confirmation, then collect details ONE AT A TIME: name → phone → budget → timeline. Do not ask all at once.",
    );
  }
  if (prefs.capturedPhone && !leadProfile?.phone) {
    lines.push(
      "ACTION: Phone received — call createLead with phone and any name/budget/city you have.",
    );
  }

  lines.push("=== END SALES STATE ===");
  return lines.join("\n");
}

function formatSpokenPrice(property) {
  const n = Number(property?.price ?? property?.totalSalesPrice);
  if (!Number.isFinite(n) || n <= 0) {
    return property?.priceDisplay || property?.formattedPrice || "";
  }
  if (n >= 10000000) return `लगभग ${(n / 10000000).toFixed(1)} करोड़`;
  if (n >= 100000) return `लगभग ${Math.round(n / 100000)} लाख`;
  return `लगभग ${n.toLocaleString("en-IN")} रुपये`;
}

function topSpokenProjects(properties = [], limit = 2) {
  return properties.slice(0, limit).map((p) => {
    const name = p.projectName || p.name || p.propertyName || "एक प्रोजेक्ट";
    const price = formatSpokenPrice(p);
    return price ? `${name}, ${price}` : name;
  });
}

export function buildPropertyReply(stage, properties = [], intent, prefs = {}) {
  const count = properties.length;
  const city =
    properties[0]?.city ||
    prefs.city ||
    extractCityFromProperties(properties) ||
    "Yahan";

  if (!count) {
    if (intent === "show_more") {
      return `${city} mein aur options abhi available nahi hain. Budget ya area thoda adjust karein, ya sales team se baat karwa dun?`;
    }
    return `${city} mein abhi matching property nahi mili. Koi aur city ya budget try karein?`;
  }

  if (intent === "show_more") {
    return `${city} mein ${count} aur alag options hain — neeche cards dekho. Koi pasand aaya?`;
  }

  if (stage === SALES_STAGES.SHORTLIST || prefs.interestedPropertyId) {
    return `Bahut badhiya choice! Is project ke baare mein aur jaanna hai ya site visit schedule karein?`;
  }

  return `${city} mein ${count} options hain — neeche cards check karo. Koi pasand aaya, ya aur options dikhaun?`;
}

/** Spoken summary for phone/TTS — no UI card references. */
export function buildVoicePropertyReply(stage, properties = [], intent, prefs = {}) {
  const count = properties.length;
  const city =
    properties[0]?.city ||
    prefs.city ||
    extractCityFromProperties(properties) ||
    "यहाँ";
  const spoken = topSpokenProjects(properties, 2);

  if (!count) {
    if (intent === "show_more") {
      return `${city} में और विकल्प अभी उपलब्ध नहीं हैं। बजट या शहर बदलें, या सेल्स टीम से बात करवाऊँ?`;
    }
    return `${city} में अभी मैचिंग प्रॉपर्टी नहीं मिली। कोई और शहर या बजट बताएँ?`;
  }

  if (intent === "show_more") {
    return `${city} में ${count} और विकल्प हैं। जैसे ${spoken.join(", और ")}। इनमें से कोई पसंद आया?`;
  }

  if (stage === SALES_STAGES.SHORTLIST || prefs.interestedPropertyId) {
    return `बहुत बढ़िया! इस प्रोजेक्ट के बारे में और जानना है या साइट विज़िट तय करें?`;
  }

  return `${city} में ${count} विकल्प मिले। मुख्य हैं: ${spoken.join(", और ")}। कोई पसंद आया या और सुनें?`;
}

function extractCityFromProperties(properties = []) {
  for (const p of properties) {
    if (p.city) return p.city;
    const loc = String(p.location || "").trim();
    if (!loc) continue;
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return null;
}
