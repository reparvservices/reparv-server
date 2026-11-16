// Pure helpers for the customer-app (read-only) feed. No DB access, so they are unit-testable.

const ROLE_LABEL = {
  sales_partner: "Sales Partner",
  territory_partner: "Territory Partner",
  project_partner: "Project Partner",
};

/** media_urls is stored as a JSON array string, but older rows hold a bare URL or null. */
export function parseMediaUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  } catch {
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  }
}

export function clampPage(value) {
  return Math.max(1, parseInt(value, 10) || 1);
}

export function clampLimit(value, fallback = 20, max = 30) {
  return Math.min(max, Math.max(1, parseInt(value, 10) || fallback));
}

/**
 * Shape a feed_posts row for customers. Only whitelisted fields leave the server, so author ids
 * for a partner's private data or viewer-specific flags (has_liked, is_saved) are never exposed.
 */
export function formatPublicPost(row) {
  return {
    id: row.id,
    post_type: row.post_type || "text",
    content: row.content || "",
    media_urls: parseMediaUrls(row.media_urls),
    thumbnail_url: row.thumbnail_url || null,
    tag_label: row.tag_label || null,
    tag_color: row.tag_color || null,
    tag_bg: row.tag_bg || null,
    likes_count: Number(row.likes_count) || 0,
    comments_count: Number(row.comments_count) || 0,
    created_at: row.created_at,
    author_name: row.author_name || "Reparv Partner",
    author_image: row.author_image || null,
    author_label: ROLE_LABEL[row.author_role] || "Partner",
  };
}

export function formatPublicComment(row) {
  return {
    id: row.id,
    content: row.content || "",
    created_at: row.created_at,
    author_name: row.author_name || row.partner_name || "Reparv Partner",
    author_image: row.author_image || null,
  };
}
