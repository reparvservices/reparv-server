const DEFAULT_GST_RATE = Number(process.env.SUBSCRIPTION_GST_RATE || 18);

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const roundInt = (n) => Math.round(Number(n));

/** Admin enters base (excl. GST); total = base + 18% */
export function splitGstFromBase(baseInput, rate = DEFAULT_GST_RATE) {
  const base = roundInt(baseInput);
  const gst = roundInt((base * rate) / 100);
  const total = base + gst;
  return { base, gst, total, rate };
}

/** When only total charged is known (e.g. payment amount), reverse split for invoice line */
export function splitGstFromTotal(totalInput, rate = DEFAULT_GST_RATE) {
  const total = round2(totalInput);
  const divisor = 1 + rate / 100;
  const base = round2(total / divisor);
  const gst = round2(total - base);
  return { base, gst, total, rate };
}

const normalizeState = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** B2C: missing buyer state → treat as seller state (intra-state CGST+SGST). */
export function resolveBuyerStateForTax(buyerState, sellerState) {
  const buyer = String(buyerState || "").trim();
  if (buyer) return buyer;
  return String(sellerState || "").trim() || null;
}

/** Same state → CGST + SGST; else IGST */
export function splitGstForState(sellerState, buyerState, taxableAmount, rate = DEFAULT_GST_RATE) {
  const taxable = round2(taxableAmount);
  const seller = normalizeState(sellerState);
  const buyer = normalizeState(resolveBuyerStateForTax(buyerState, sellerState));
  const isIntra = seller && buyer && seller === buyer;

  if (isIntra) {
    const half = round2((taxable * rate) / 100 / 2);
    return {
      tax_type: "intra_state",
      cgst_amount: half,
      sgst_amount: half,
      igst_amount: 0,
      gst_total: round2(half * 2),
      place_of_supply: buyerState || sellerState,
    };
  }

  const igst = round2((taxable * rate) / 100);
  return {
    tax_type: "inter_state",
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: igst,
    gst_total: igst,
    place_of_supply: buyerState || sellerState || sellerState,
  };
}

export function getSellerConfig() {
  return {
    name: process.env.REPARV_LEGAL_NAME || "Reparv Technologies Pvt Ltd",
    gstin: process.env.REPARV_GSTIN || "",
    address:
      process.env.REPARV_BILLING_ADDRESS ||
      "Plot No. 11, Third Bus Stop, Gorle Layout, Trimurti Nagar, Nagpur, Maharashtra, India, 440022",
    state: process.env.REPARV_STATE || "Maharashtra",
  };
}

export function getHsnSac() {
  return process.env.SUBSCRIPTION_HSN_SAC || "998314";
}

export function getGstRate() {
  return DEFAULT_GST_RATE;
}

/** Resolve base_price from API body (prefers base_price, falls back to price as base for legacy) */
export function resolvePlanPricingFromBody(body) {
  const rate = getGstRate();
  if (body.base_price != null && body.base_price !== "") {
    return splitGstFromBase(body.base_price, rate);
  }
  if (body.price != null && body.price !== "") {
    return splitGstFromBase(body.price, rate);
  }
  return null;
}
