import db from "#db";

/** Stable sort: views (popular) then id. Avoids ORDER BY RAND() full-table cost. */
const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";
const LIST_ORDER = `ORDER BY ${VIEWS_EXPR} DESC, properties.propertyid DESC`;

// **Fetch All Active & Approved Properties (with Likes Count)**
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      properties.*,
      ${VIEWS_EXPR} AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties
    LEFT JOIN property_analytics 
      ON property_analytics.property_id = properties.propertyid
    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'

    GROUP BY properties.propertyid
    ${LIST_ORDER}
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    const formatted = result.map((row) => {
      let parsedType = [];

      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
      }

      return {
        ...row,
        propertyType: parsedType,
        likes: Number(row.likes) || 0,
        views: Number(row.views) || 0,
      };
    });

    res.json(formatted);
  });
};

// ** Fetch All City **
export const getAllByCity = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }

  const sql = `
    SELECT 
      properties.*,
      ${VIEWS_EXPR} AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
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

    const formatted = result.map((row) => {
      let parsedType = [];

      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
      }

      return {
        ...row,
        propertyType: parsedType,
        likes: Number(row.likes) || 0,
        views: Number(row.views) || 0,
      };
    });

    res.json(formatted);
  });
};

// Fetch Properties By Budget (EMI Based)
export const getAllByBudget = (req, res) => {
  const city = req.params.city;
  const { minBudget, maxBudget } = req.query;

  if (!city) {
    return res.status(400).json({ message: "City not selected!" });
  }

  if (!minBudget || !maxBudget) {
    return res.status(400).json({ message: "Budget range required!" });
  }

  const sql = `
    SELECT 
      properties.*,
      ${VIEWS_EXPR} AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties

    LEFT JOIN property_analytics 
      ON property_analytics.property_id = properties.propertyid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.city = ?
      AND properties.totalSalesPrice BETWEEN ? AND ?

    GROUP BY properties.propertyid
    ORDER BY properties.totalSalesPrice ASC
  `;

  db.query(sql, [city, Number(minBudget), Number(maxBudget)], (err, result) => {
    if (err) {
      console.error("Budget fetch error:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    const formatted = result.map((row) => {
      let parsedType = [];

      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyid);
      }

      return {
        ...row,
        propertyType: parsedType,
        likes: Number(row.likes) || 0,
        views: Number(row.views) || 0,
      };
    });

    res.json(formatted);
  });
};

// ** Fetch Hot Deal Properties **
export const getHotDealProperties = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }

  const sql = `
    SELECT 
      properties.*,
      ${VIEWS_EXPR} AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties

    LEFT JOIN property_analytics 
      ON property_analytics.property_id = properties.propertyid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.hotDeal = 'active'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ${LIST_ORDER}
  `;

  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => {
      let parsedType = [];

      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
      }

      return {
        ...row,
        propertyType: parsedType,
        likes: Number(row.likes) || 0,
        views: Number(row.views) || 0,
      };
    });

    res.json(formatted);
  });
};

// ** Fetch Top Picks Properties **
export const getTopPicksProperties = (req, res) => {
  const city = req.params.city;

  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }

  const sql = `
    SELECT 
      properties.*,
      MAX(projectpartner.businessLogo) AS businessLogo,
      ${VIEWS_EXPR} AS views,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties

    LEFT JOIN property_analytics
      ON property_analytics.property_id = properties.propertyid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    LEFT JOIN projectpartner
      ON projectpartner.id = properties.projectpartnerid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.topPicksStatus = 'active'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ${LIST_ORDER}
  `;

  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching top picks:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    const formatted = result.map((row) => {
      let parsedType = [];

      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
      }

      return {
        ...row,
        propertyType: parsedType,
        likes: Number(row.likes) || 0,
        views: Number(row.views) || 0,
        businessLogo: row.businessLogo || null,
      };
    });

    res.json(formatted);
  });
};
