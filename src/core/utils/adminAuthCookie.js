/**
 * HttpOnly admin JWT cookie (login + logout must use the same shape).
 * Admin UI and API are on different origins (e.g. localhost:5173 → :3000, or admin.* → api.*),
 * so SameSite=None + Secure is required. Modern browsers treat http://localhost as secure.
 */
export function getAdminTokenCookieOptions() {
  const secure = process.env.COOKIE_SECURE !== "false";

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    maxAge: 10 * 24 * 60 * 60 * 1000,
  };
}

export function getAdminTokenClearOptions() {
  const { httpOnly, secure, sameSite, path } = getAdminTokenCookieOptions();
  return { httpOnly, secure, sameSite, path };
}
