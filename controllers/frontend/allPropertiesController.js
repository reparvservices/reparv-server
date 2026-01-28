import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All Active & Approved Properties (with Likes Count)**
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      properties.*,
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'

    GROUP BY properties.propertyid
    ORDER BY RAND()
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
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ORDER BY RAND()
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
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.hotDeal = 'active'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ORDER BY RAND()
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
      COUNT(DISTINCT user_property_wishlist.property_id) AS likes
    FROM properties

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.status = 'Active'
      AND properties.approve = 'Approved'
      AND properties.topPicksStatus = 'active'
      AND properties.city = ?

    GROUP BY properties.propertyid
    ORDER BY RAND()
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
      };
    });

    res.json(formatted);
  });
};
