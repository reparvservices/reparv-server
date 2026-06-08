export function requireAiPublicKey(req, res, next) {
  const expected = process.env.AI_AGENT_PUBLIC_KEY;
  if (!expected) return next();

  const key =
    req.headers["x-ai-api-key"] ||
    req.headers["x-api-key"] ||
    req.body?.apiKey;

  if (key !== expected) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing AI API key",
    });
  }
  return next();
}
