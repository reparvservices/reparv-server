import rateLimit from "express-rate-limit";

/** Throttles login/password-reset attempts to slow brute-force and credential-stuffing. */
export const loginRateLimit = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60_000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});
