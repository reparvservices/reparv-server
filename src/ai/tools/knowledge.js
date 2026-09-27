import db from "#db/promise";

/**
 * Read-only knowledge tools for the AI advisor: FAQs, articles, EMI and
 * city coverage. Nothing here writes to the database.
 */

const SITE_URL = (
  process.env.FRONTEND_URL ||
  process.env.REPARV_WEB_URL ||
  "https://www.reparv.in"
).replace(/\/+$/, "");

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "what", "how", "can", "i", "me", "my", "do", "does",
  "for", "of", "in", "on", "to", "and", "or", "kya", "hai", "hain", "ka", "ki", "ke",
  "me", "mein", "se", "ko", "kaise", "kitna", "kitne", "please", "tell", "about",
]);

/** Meaningful keywords from a free-text question. */
function keywords(query, max = 6) {
  return [
    ...new Set(
      String(query || "")
        .toLowerCase()
        .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    ),
  ].slice(0, max);
}

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Rank rows by how many keywords appear in the given text fields. */
function rank(rows, words, fields) {
  return rows
    .map((row) => {
      const hay = fields.map((f) => String(row[f] || "").toLowerCase()).join(" ");
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Reparv FAQs (home loans, buying process, documents, RERA, fees…). */
export async function searchFAQs({ query, limit = 4 } = {}) {
  const words = keywords(query);
  if (!words.length) return { faqs: [], note: "Ask a more specific question." };

  const like = words.map(() => "(question LIKE ? OR answer LIKE ?)").join(" OR ");
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);
  const [rows] = await db.query(
    `SELECT id, question, answer
     FROM faq
     WHERE (status IS NULL OR status = 'Active') AND (${like})
     LIMIT 60`,
    params,
  );

  const faqs = rank(rows, words, ["question", "answer"])
    .slice(0, Math.min(Number(limit) || 4, 8))
    .map(({ row }) => ({
      question: stripHtml(row.question),
      answer: stripHtml(row.answer).slice(0, 700),
    }));
  return { faqs, found: faqs.length };
}

/** Reparv blog articles on buying, loans, locations and market trends. */
export async function searchArticles({ query, limit = 3 } = {}) {
  const words = keywords(query);
  if (!words.length) return { articles: [] };

  const like = words.map(() => "(tittle LIKE ? OR description LIKE ?)").join(" OR ");
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);
  const [rows] = await db.query(
    `SELECT id, tittle, description, seoSlug
     FROM blogs
     WHERE (status IS NULL OR status = 'Active') AND (${like})
     ORDER BY created_at DESC
     LIMIT 40`,
    params,
  );

  const articles = rank(rows, words, ["tittle", "description"])
    .slice(0, Math.min(Number(limit) || 3, 5))
    .map(({ row }) => ({
      title: stripHtml(row.tittle),
      summary: stripHtml(row.description).slice(0, 240),
      url: row.seoSlug ? `${SITE_URL}/blog/${row.seoSlug}` : null,
    }));
  return { articles, found: articles.length };
}

/**
 * Monthly EMI. Defaults: 20% down payment, 8.5% p.a., 20 years
 * (same defaults as the website's EMI calculator).
 */
export function calculateEMI({
  propertyPrice,
  loanAmount,
  downPaymentPercent = 20,
  interestRate = 8.5,
  tenureYears = 20,
} = {}) {
  const price = Number(propertyPrice) || 0;
  const principal =
    Number(loanAmount) || Math.max(0, price * (1 - (Number(downPaymentPercent) || 0) / 100));
  const rate = Number(interestRate);
  const years = Number(tenureYears);

  if (!(principal > 0) || !(rate >= 0) || !(years > 0)) {
    return { error: "Need a property price or loan amount, interest rate and tenure." };
  }

  const months = Math.round(years * 12);
  const r = rate / 12 / 100;
  const emi = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const totalPayment = emi * months;

  return {
    loanAmount: Math.round(principal),
    downPayment: price ? Math.round(price - principal) : null,
    interestRate: rate,
    tenureYears: years,
    monthlyEMI: Math.round(emi),
    totalInterest: Math.round(totalPayment - principal),
    totalPayment: Math.round(totalPayment),
    calculatorUrl: `${SITE_URL}/emi-calculator`,
  };
}

/** Cities where Reparv has live (approved, active) listings, with counts. */
export async function listCities({ limit = 20 } = {}) {
  const [rows] = await db.query(
    `SELECT city, COUNT(*) AS listings
     FROM properties
     WHERE status = 'Active' AND approve = 'Approved' AND city IS NOT NULL AND city <> ''
     GROUP BY city
     ORDER BY listings DESC
     LIMIT ?`,
    [Math.min(Number(limit) || 20, 50)],
  );
  return {
    cities: rows.map((r) => ({ city: r.city, listings: Number(r.listings) })),
  };
}
