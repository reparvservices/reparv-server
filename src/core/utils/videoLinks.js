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

// An uploaded property video (properties.propertyVideo): the S3 URL (or key)
// returned after a direct upload. Only common web video formats are accepted.
const PROPERTY_VIDEO_REGEX =
  /^(?:https:\/\/[\w.-]+\.amazonaws\.com\/|uploads\/|videos\/)[^\s?#]+\.(?:mp4|mov|webm|m4v)$/i;

/**
 * For adds and edits: validates propertyVideo only when it is in the body.
 * An empty string clears it. Returns { fields } or { error }.
 */
export function pickPropertyVideoFileUpdate(body = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, "propertyVideo")) return { fields: {} };
  const value = typeof body.propertyVideo === "string" ? body.propertyVideo.trim() : "";
  if (value && !PROPERTY_VIDEO_REGEX.test(value)) {
    return { error: "Property video must be an uploaded MP4, MOV or WEBM file" };
  }
  return { fields: { propertyVideo: value || null } };
}

// Project brochure (properties.brochureFile) uploaded directly to S3 by the
// website listing forms: a PDF or an image.
const BROCHURE_FILE_REGEX =
  /^(?:https:\/\/[\w.-]+\.amazonaws\.com\/|uploads\/|brochures\/)[^\s?#]+\.(?:pdf|jpe?g|png|webp)$/i;

/**
 * For adds and edits: validates brochureFile only when it is in the body.
 * An empty string clears it. Returns { fields } or { error }.
 */
export function pickBrochureFileUpdate(body = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, "brochureFile")) return { fields: {} };
  const value = typeof body.brochureFile === "string" ? body.brochureFile.trim() : "";
  if (value && !BROCHURE_FILE_REGEX.test(value)) {
    return { error: "Brochure must be an uploaded PDF, JPG, PNG or WEBP file" };
  }
  return { fields: { brochureFile: value || null } };
}
