import crypto from "crypto";
import fs from "fs";

const PRODUCTION_BASE = "https://api.storekit.itunes.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com";

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeJwsPayload(jws) {
  const parts = String(jws || "").split(".");
  if (parts.length < 2) {
    throw new Error("Invalid signed transaction from Apple");
  }
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json);
}

function resolvePrivateKey() {
  const inline = process.env.APPLE_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf8");
  }
  return null;
}

export function isAppleIapConfigured() {
  return Boolean(
    process.env.APPLE_ISSUER_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_BUNDLE_ID?.trim() &&
      resolvePrivateKey(),
  );
}

export function createAppStoreServerJwt() {
  const issuerId = process.env.APPLE_ISSUER_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const privateKey = resolvePrivateKey();

  if (!issuerId || !keyId || !bundleId || !privateKey) {
    const e = new Error(
      "Apple IAP is not configured. Set APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_BUNDLE_ID, and APPLE_PRIVATE_KEY (or APPLE_PRIVATE_KEY_PATH).",
    );
    e.statusCode = 503;
    throw e;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function resolveApiBase(environment) {
  const env = String(environment || process.env.APPLE_ENVIRONMENT || "sandbox")
    .toLowerCase()
    .trim();
  return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

/**
 * Fetch and decode a StoreKit 2 transaction from Apple's App Store Server API.
 */
export async function fetchAppleTransaction(transactionId, environment) {
  const txId = String(transactionId || "").trim();
  if (!txId) {
    const e = new Error("transaction_id is required");
    e.statusCode = 400;
    throw e;
  }

  const token = createAppStoreServerJwt();
  const base = resolveApiBase(environment);
  const url = `${base}/inApps/v1/transactions/${encodeURIComponent(txId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const e = new Error(
      `Apple transaction lookup failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
    e.statusCode = res.status === 404 ? 404 : 502;
    throw e;
  }

  const data = await res.json();
  const signed = data?.signedTransactionInfo;
  if (!signed) {
    const e = new Error("Apple returned no signed transaction info");
    e.statusCode = 502;
    throw e;
  }

  const decoded = decodeJwsPayload(signed);
  return {
    raw: decoded,
    transactionId: String(decoded.transactionId || txId),
    originalTransactionId: String(decoded.originalTransactionId || decoded.transactionId || txId),
    productId: String(decoded.productId || ""),
    bundleId: String(decoded.bundleId || ""),
    expiresDate: decoded.expiresDate ? new Date(Number(decoded.expiresDate)) : null,
    purchaseDate: decoded.purchaseDate ? new Date(Number(decoded.purchaseDate)) : new Date(),
    environment: String(decoded.environment || environment || "Sandbox"),
    revocationDate: decoded.revocationDate ? new Date(Number(decoded.revocationDate)) : null,
    signedTransactionInfo: signed,
  };
}

export { decodeJwsPayload };
