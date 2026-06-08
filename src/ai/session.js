import crypto from "crypto";

export const CHAT_MODES = {
  USER: "user",
  GUEST: "guest",
};

const STORAGE_MAX = 64;
const USER_PREFIX = "user:";
const GUEST_PREFIX = "guest:";

function newGuestId() {
  return `${GUEST_PREFIX}${crypto.randomUUID()}`.slice(0, STORAGE_MAX);
}

function normalizeGuestId(raw) {
  const id = String(raw || "").trim();
  if (!id) return null;
  if (id.startsWith(GUEST_PREFIX)) return id.slice(0, STORAGE_MAX);
  if (id.startsWith("guest-")) {
    return `${GUEST_PREFIX}${id.slice(6)}`.slice(0, STORAGE_MAX);
  }
  return `${GUEST_PREFIX}${id}`.slice(0, STORAGE_MAX);
}

function normalizeUserStorageId(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  if (id.startsWith(USER_PREFIX)) return id.slice(0, STORAGE_MAX);
  if (id.startsWith(GUEST_PREFIX) || id.startsWith("guest-")) return null;
  return `${USER_PREFIX}${id}`.slice(0, STORAGE_MAX);
}

/**
 * Resolve chat session for app user vs website guest.
 * - user: tracked by app userId → storage key `user:{id}`
 * - guest: anonymous website visitor → storage key `guest:{uuid}`
 */
export function resolveChatSession({ mode, userId, guestId } = {}) {
  const resolvedMode =
    mode === CHAT_MODES.USER ? CHAT_MODES.USER : CHAT_MODES.GUEST;

  if (resolvedMode === CHAT_MODES.USER) {
    const storageId = normalizeUserStorageId(userId);
    if (!storageId) {
      const err = new Error("userId is required when mode is user");
      err.status = 400;
      throw err;
    }
    return {
      mode: CHAT_MODES.USER,
      storageId,
      userId: storageId.slice(USER_PREFIX.length),
      guestId: null,
    };
  }

  const resolvedGuestId =
    normalizeGuestId(guestId) || normalizeGuestId(userId) || newGuestId();

  return {
    mode: CHAT_MODES.GUEST,
    storageId: resolvedGuestId,
    userId: null,
    guestId: resolvedGuestId,
  };
}

/** Backward-compatible resolver when clients only send userId. */
export function resolveChatSessionFromRequest(body = {}) {
  if (body.mode === CHAT_MODES.USER || body.mode === CHAT_MODES.GUEST) {
    return resolveChatSession(body);
  }

  const legacyId = String(body.userId || body.guestId || "").trim();
  if (!legacyId) {
    return resolveChatSession({ mode: CHAT_MODES.GUEST });
  }

  if (
    legacyId.startsWith(GUEST_PREFIX) ||
    legacyId.startsWith("guest-")
  ) {
    return resolveChatSession({ mode: CHAT_MODES.GUEST, guestId: legacyId });
  }

  return resolveChatSession({ mode: CHAT_MODES.GUEST, guestId: legacyId });
}

export function formatSessionResponse(session) {
  return {
    mode: session.mode,
    userId: session.userId,
    guestId: session.guestId,
  };
}
