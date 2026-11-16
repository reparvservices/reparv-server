import crypto from "crypto";

/** Constant-time string comparison (length mismatch is a plain false). */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** HMAC-SHA256 hex digest, as Razorpay signs checkout payloads. */
export function hmacHex(secret, data) {
  return crypto.createHmac("sha256", String(secret ?? "")).update(data).digest("hex");
}

/**
 * Verify a Razorpay checkout signature: HMAC_SHA256(secret, `${a}|${b}`).
 * Orders sign `order_id|payment_id`; subscriptions sign `payment_id|subscription_id`.
 * Returns false (never throws) when the secret or signature is missing.
 */
export function verifyCheckoutSignature(secret, first, second, signature) {
  if (!secret || !signature) return false;
  return safeEqual(hmacHex(secret, `${first}|${second}`), signature);
}
