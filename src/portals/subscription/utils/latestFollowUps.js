import dbPromise from "#db/promise";

/**
 * Latest partnerFollowup row per partner, for just the given partner ids.
 * One query for a whole page instead of a lookup per row (partnerFollowup
 * has no index on partnerId, so per-row lookups scale badly).
 * @returns {Map<number, {followUp: string, created_at: Date}>}
 */
export async function fetchLatestFollowUps(role, partnerIds) {
  const ids = [...new Set(partnerIds.filter((id) => id != null).map(Number))];
  if (!ids.length) return new Map();

  const [rows] = await dbPromise.query(
    `SELECT partnerId, followUp, created_at
     FROM partnerFollowup
     WHERE role = ? AND partnerId IN (?)
     ORDER BY created_at DESC, id DESC`,
    [role, ids],
  );

  const latest = new Map();
  for (const row of rows) {
    const id = Number(row.partnerId);
    if (!latest.has(id)) latest.set(id, row);
  }
  return latest;
}
