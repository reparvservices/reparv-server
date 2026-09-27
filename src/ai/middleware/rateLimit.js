import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const aiChatRateLimit = rateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.AI_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Per chat user/guest as well as IP: behind a proxy/load balancer every
  // visitor can share one IP and would otherwise share one limit.
  keyGenerator: (req) => {
    const who = req.body?.userId
      ? `u:${req.body.userId}`
      : req.body?.guestId
        ? `g:${req.body.guestId}`
        : "anon";
    return `${ipKeyGenerator(req.ip || "")}|${who}`;
  },
  message: {
    success: false,
    message: "Too many AI requests. Please try again in a minute.",
  },
});
