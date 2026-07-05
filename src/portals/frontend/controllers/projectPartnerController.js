import db from "#db";
import dbPromise from "#db/promise";
import moment from "moment-timezone";

const formatPropertyRow = (row) => {
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
};

// Fetch Project Partner by Contact **
export const getTrustedBuildersPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const cityFilter = "TRIM(p.city) = ?";

    const statsSql = `
      SELECT
        COUNT(DISTINCT p.propertyid) AS verifiedProjects,
        COUNT(DISTINCT pp.id) AS trustedBuilders,
        COUNT(DISTINCT TRIM(p.city)) AS cityCount
      FROM properties p
      INNER JOIN projectpartner pp ON pp.id = p.projectpartnerid
      WHERE p.status = 'Active'
        AND p.approve = 'Approved'
        AND pp.status = 'Active'
        AND ${cityFilter}
    `;

    const buildersSql = `
      SELECT
        pp.id,
        pp.fullname,
        pp.contact,
        pp.city,
        pp.state,
        pp.businessLogo,
        pp.userimage,
        pp.experience,
        pp.created_at,
        pp.rerano,
        COUNT(DISTINCT p.propertyid) AS projectCount,
        MAX(p.location) AS primaryLocation,
        (
          SELECT p2.frontView
          FROM properties p2
          WHERE p2.projectpartnerid = pp.id
            AND p2.status = 'Active'
            AND p2.approve = 'Approved'
            AND TRIM(p2.city) = ?
            AND p2.frontView IS NOT NULL
          ORDER BY p2.propertyid DESC
          LIMIT 1
        ) AS sampleFrontView
      FROM projectpartner pp
      INNER JOIN properties p ON p.projectpartnerid = pp.id
      WHERE pp.status = 'Active'
        AND p.status = 'Active'
        AND p.approve = 'Approved'
        AND ${cityFilter}
      GROUP BY pp.id
      ORDER BY projectCount DESC, pp.id DESC
      LIMIT 8
    `;

    const featuredSql = `
      SELECT
        p.*,
        pp.fullname AS partnerName,
        pp.contact AS partnerContact,
        b.company_name AS builderName,
        COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes,
        MAX(COALESCE(property_analytics.views, 0)) AS views
      FROM properties p
      INNER JOIN projectpartner pp ON pp.id = p.projectpartnerid
      LEFT JOIN builders b ON b.builderid = p.builderid
      LEFT JOIN property_analytics
        ON property_analytics.property_id = p.propertyid
      LEFT JOIN user_property_wishlist
        ON user_property_wishlist.property_id = p.propertyid
      WHERE p.status = 'Active'
        AND p.approve = 'Approved'
        AND pp.status = 'Active'
        AND TRIM(p.city) = ?
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
      LIMIT 6
    `;

    const citiesSql = `
      SELECT
        TRIM(p.city) AS city,
        COUNT(DISTINCT pp.id) AS builderCount
      FROM properties p
      INNER JOIN projectpartner pp ON pp.id = p.projectpartnerid
      WHERE p.status = 'Active'
        AND p.approve = 'Approved'
        AND pp.status = 'Active'
        AND TRIM(p.city) <> ''
      GROUP BY TRIM(p.city)
      ORDER BY builderCount DESC, city ASC
      LIMIT 12
    `;

    const filterCitiesSql = `
      SELECT DISTINCT TRIM(city) AS city
      FROM properties
      WHERE status = 'Active'
        AND approve = 'Approved'
        AND TRIM(city) <> ''
      ORDER BY city ASC
    `;

    const [[statsRows], [builderRows], [featuredRows], [cityRows], [filterCityRows]] =
      await Promise.all([
        dbPromise.query(statsSql, [city]),
        dbPromise.query(buildersSql, [city, city]),
        dbPromise.query(featuredSql, [city]),
        dbPromise.query(citiesSql),
        dbPromise.query(filterCitiesSql),
      ]);

    const stats = statsRows[0] || {};

    return res.json({
      city,
      stats: {
        verifiedProjects: Number(stats.verifiedProjects) || 0,
        trustedBuilders: Number(stats.trustedBuilders) || 0,
        cityCount: Number(stats.cityCount) || 0,
      },
      builders: builderRows,
      featuredProjects: featuredRows.map(formatPropertyRow),
      cities: cityRows.map((row) => ({
        name: row.city,
        builderCount: Number(row.builderCount) || 0,
      })),
      filterCities: filterCityRows.map((row) => row.city),
    });
  } catch (error) {
    console.error("getTrustedBuildersPageData:", error);
    return res.status(500).json({ message: "Failed to fetch trusted builders data" });
  }
};

export const getProjectPartnerByContact = (req, res) => {
  const contact = parseInt(req.params.contact);
  if (!contact) {
    return res.status(400).json({ message: "Contact Not Found" });
  }
  const sql = "SELECT * FROM projectpartner WHERE contact = ? AND status = ?";

  db.query(sql, [contact, "Active"], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Project Partner not found" });
    }
    res.json(result[0]);
  });
};

// Fetch Unique Cities of Properties by Project Partner Id
export const getCities = (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid or missing ID" });
  }

  const sql = `
    SELECT DISTINCT city 
    FROM properties 
    WHERE projectpartnerid = ?
    ORDER BY city ASC
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error fetching cities:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const cities = result.map((row) => row.city);
    res.json(cities); // only array of cities
  });
};

export const getAllProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  let sql = `
    SELECT 
      properties.*,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties
    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid
    WHERE properties.status = 'Active' 
      AND properties.approve = 'Approved' 
      AND properties.projectpartnerid = ?
      AND properties.city = ?
  `;

  const params = [projectPartnerId, selectedCity];

  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND properties.propertyCategory = ?`;
    params.push(propertyCategory);
  }

  sql += `
    GROUP BY properties.propertyid
    ORDER BY properties.propertyid DESC
  `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const formatted = result.map((row) => {
      let parsedType = [];
      try {
        if (row.propertyType) {
          const parsed = JSON.parse(row.propertyType);
          parsedType = Array.isArray(parsed) ? parsed : [parsed];
        }
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

export const getHotDealProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  let sql = `
    SELECT 
      properties.*,
      builders.company_name,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties
    LEFT JOIN builders 
      ON properties.builderid = builders.builderid
    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid
    WHERE properties.projectpartnerid = ?
      AND properties.city = ?
      AND properties.hotDeal = ?
  `;

  const params = [projectPartnerId, selectedCity, "Active"];

  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND properties.propertyCategory = ?`;
    params.push(propertyCategory);
  }

  sql += `
    GROUP BY properties.propertyid
    ORDER BY properties.propertyid DESC
  `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const formatted = result.map((row) => {
      let parsedType = [];
      try {
        if (row.propertyType) {
          const parsed = JSON.parse(row.propertyType);
          parsedType = Array.isArray(parsed) ? parsed : [parsed];
        }
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

export const getPremiumProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  let sql = `
    SELECT 
      properties.*,
      COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes 
    FROM properties
    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid
    WHERE properties.projectpartnerid = ?
      AND properties.city = ?
  `;

  const params = [projectPartnerId, selectedCity];

  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND properties.propertyCategory = ?`;
    params.push(propertyCategory);
  }

  sql += `
    GROUP BY properties.propertyid
    ORDER BY properties.totalOfferPrice DESC
    LIMIT 5
  `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const formatted = result.map((row) => {
      let parsedType = [];
      try {
        if (row.propertyType) {
          const parsed = JSON.parse(row.propertyType);
          parsedType = Array.isArray(parsed) ? parsed : [parsed];
        }
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

export const addMessage = async (req, res) => {
  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  const { fullname, contact, message } = req.body;

  // Validate request fields
  if (!fullname || !contact || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql = `
    INSERT INTO messages (projectPartnerId, fullname, contact, message, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [Id, fullname, contact, message, currentDate, currentDate],
    (err, result) => {
      if (err) {
        console.error("Error inserting message:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Message added successfully",
        id: result.insertId,
      });
    },
  );
};
