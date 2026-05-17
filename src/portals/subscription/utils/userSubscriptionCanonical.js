/**
 * SQL fragment: one canonical `user_subscriptions.id` per (user_id, role).
 * Prefers active, then pending, then most recently updated.
 */
export const CANONICAL_USER_SUBSCRIPTION_IDS_SQL = `
  SELECT CAST(SUBSTRING_INDEX(
    GROUP_CONCAT(id ORDER BY
      CASE LOWER(status) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      updated_at DESC,
      id DESC
    ),
    ',', 1
  ) AS UNSIGNED) AS id
  FROM user_subscriptions
  GROUP BY user_id, role
`;
