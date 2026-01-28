import db from "../../config/dbconnect.js";
import moment from "moment";

/// Fetch Single Property by SEO Slug
export const getById = (req, res) => {
  const seoSlug = req.params.slug;

  if (!seoSlug) {
    return res.status(400).json({ message: "SEO slug is required" });
  }

  const sql = `
    SELECT 
      p.*,
      pp.contact AS projectPartnerContact,
      gu.contact AS guestUserContact,

      COUNT(DISTINCT CASE 
        WHEN pi.status = 'Available' THEN pi.propertyinfoid 
      END) AS availableCount,

      COUNT(DISTINCT CASE 
        WHEN pi.status = 'Booked' THEN pi.propertyinfoid 
      END) AS bookedCount,

      COUNT(DISTINCT w.user_id) AS likes

    FROM properties p

    LEFT JOIN propertiesinfo pi 
      ON p.propertyid = pi.propertyid

    LEFT JOIN projectpartner pp 
      ON p.projectpartnerid = pp.id

    LEFT JOIN guestUsers gu 
      ON p.guestUserId = gu.id

    LEFT JOIN user_property_wishlist w
      ON w.property_id = p.propertyid

    WHERE p.seoSlug = ?
    GROUP BY p.propertyid;
  `;

  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!result.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    const row = result[0];

    // Safe JSON parse
    let propertyType = [];
    try {
      propertyType = row.propertyType ? JSON.parse(row.propertyType) : [];
    } catch (err) {
      console.warn("Invalid JSON in propertyType:", row.propertyType);
    }

    const response = {
      ...row,
      propertyType,
      possessionDate: row.possessionDate
        ? moment.utc(row.possessionDate).format("DD MMM YYYY")
        : null,
      likes: Number(row.likes) || 0,
    };

    res.json(response);
  });
};

export const getByIdu = (req, res) => {
  const seoSlug = req.params.slug;
  const sql = `
      SELECT 
        properties.*,
        COUNT(CASE WHEN propertiesinfo.status = 'Available' THEN 1 END) AS availableCount,
        COUNT(CASE WHEN propertiesinfo.status = 'Booked' THEN 1 END) AS bookedCount
      FROM properties
      LEFT JOIN propertiesinfo ON properties.propertyid = propertiesinfo.propertyid
      WHERE properties.seoSlug = ?
      GROUP BY properties.propertyid;
  `;

  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "property info not found" });
    }

    // safely parse JSON + format dates
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
        possessionDate: row.possessionDate
          ? moment.utc(row.possessionDate).format("DD MMM YYYY")
          : null,
      };
    });

    res.json(formatted[0]);
  });
};

// **Fetch Single by ID**
export const getImages = (req, res) => {
  const seoSlug = req.params.slug;
  const sql = `SELECT * FROM properties WHERE seoSlug = ?`;
  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "property info not found" });
    }
    // safely parse JSON fields
    const formatted = result.map((row) => {
      let parsedType = null;
      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
        parsedType = [];
      }

      return {
        ...row,
        propertyType: parsedType,
      };
    });

    res.json(formatted);
  });
};
