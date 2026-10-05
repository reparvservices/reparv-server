// Property video links: a YouTube video (stored in properties.videoLink)
// and an Instagram reel (stored in properties.instagramReelLink).

// Same URL shapes the apps' YouTube players can parse: watch?v=, shorts/, youtu.be/
const YOUTUBE_REGEX =
  /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)[\w-]{11}(?:[?&#/].*)?$/i;

const INSTAGRAM_REEL_REGEX =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/[\w-]+\/?(?:[?#].*)?$/i;

/**
 * Validates the optional YouTube and Instagram reel links of a property.
 * Returns { videoLink, instagramReelLink } (trimmed, or null when empty)
 * and an error message when either link is invalid.
 */
export function parsePropertyVideoLinks({ videoLink, instagramReelLink }) {
  const youtube = typeof videoLink === "string" ? videoLink.trim() : "";
  const instagram =
    typeof instagramReelLink === "string" ? instagramReelLink.trim() : "";

  if (youtube && !YOUTUBE_REGEX.test(youtube)) {
    return { error: "Enter a valid YouTube video link" };
  }
  if (instagram && !INSTAGRAM_REEL_REGEX.test(instagram)) {
    return { error: "Enter a valid Instagram reel link" };
  }

  return {
    videoLink: youtube || null,
    instagramReelLink: instagram || null,
  };
}

/**
 * For edits: validates only the link fields present in the request body, so
 * clients that don't send them leave the stored links unchanged.
 * An empty string clears a link. Returns { fields } or { error }.
 */
export function pickPropertyVideoLinkUpdates(body = {}) {
  const sent = ["videoLink", "instagramReelLink"].filter((key) =>
    Object.prototype.hasOwnProperty.call(body, key),
  );
  if (!sent.length) return { fields: {} };

  const parsed = parsePropertyVideoLinks(body);
  if (parsed.error) return { error: parsed.error };

  return { fields: Object.fromEntries(sent.map((key) => [key, parsed[key]])) };
}
