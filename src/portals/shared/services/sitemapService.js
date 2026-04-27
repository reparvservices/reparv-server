import db from "#db";

const query = (sql) =>
  new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

export const getProperties = async () => {
  const sql = `
    SELECT
      seoSlug,
      updated_at AS updatedAt
    FROM properties
    WHERE
      seoSlug IS NOT NULL
      AND seoSlug != ''
      AND status = 'Active'
      AND properties.approve = 'Approved'
    ORDER BY updated_at DESC
    LIMIT 50000
  `;
  return query(sql);
};

export const getBlogs = async () => {
  const sql = `
    SELECT
      seoSlug,
      updated_at AS updatedAt
    FROM blogs
    WHERE
      seoSlug IS NOT NULL
      AND seoSlug != ''
      AND status = 'Active'
    ORDER BY updated_at DESC
    LIMIT 50000
  `;
  return query(sql);
};

export const getNews = async () => {
  const sql = `
    SELECT
      seoSlug,
      updated_at AS updatedAt
    FROM news
    WHERE
      seoSlug IS NOT NULL
      AND seoSlug != ''
      AND status = 'Active'
    ORDER BY updated_at DESC
    LIMIT 50000
  `;
  return query(sql);
};
