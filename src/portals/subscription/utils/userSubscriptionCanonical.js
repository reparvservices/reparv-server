/**
 * SQL fragment: one canonical `user_subscriptions.id` per (user_id, role).
 * Same rule as the partner apps: the most recently started plan that still
 * grants access, then pending, then most recently updated.
 */
export const CANONICAL_USER_SUBSCRIPTION_IDS_SQL = `
  SELECT CAST(SUBSTRING_INDEX(
    GROUP_CONCAT(id ORDER BY
      CASE
        WHEN LOWER(status) IN ('active', 'trial', 'cancelled')
          AND (end_date IS NULL OR end_date >= NOW()) THEN 0
        WHEN LOWER(status) = 'pending' THEN 1
        ELSE 2
      END,
      start_date DESC,
      updated_at DESC,
      id DESC
    ),
    ',', 1
  ) AS UNSIGNED) AS id
  FROM user_subscriptions
  GROUP BY user_id, role
`;
