import db from "#db";

/** Trending: weighted score (views + likes) */
const LIST_ORDER = `
ORDER BY 
  (COALESCE(property_analytics.views, 0) * 0.7 + 
   COUNT(DISTINCT user_property_wishlist.guest_user_id) * 0.3) DESC,
  properties.propertyid DESC
`;

// ** Fetch All City (Trending Properties) **
export const getAllByCity = (req, res) => {
  const city = req.params.city;

  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }

  const sql = `
    SELECT 
      properties.*,
      COALESCE(property_analytics.views, 0) AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes,

      -- Trending Score
      (COALESCE(property_analytics.views, 0) * 0.7 + 
       COUNT(DISTINCT user_property_wishlist.guest_user_id) * 0.3) AS trendingScore

    FROM properties

    LEFT JOIN property_analytics 
      ON property_analytics.property_id = properties.propertyid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ${LIST_ORDER}
  `;

  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      trendingScore: Number(row.trendingScore) || 0,
    }));

    res.json(formatted);
  });
};