import db from "../../config/dbconnect.js";
import moment from "moment";

export const getAll = (req, res) => {
  const { city, propertyCategory, propertyType, minBudget, maxBudget } = req.query;

  let sql = `
    SELECT p.*, 
           COUNT(DISTINCT w.user_id) AS likes
    FROM properties p
    LEFT JOIN user_property_wishlist w
      ON w.property_id = p.propertyid
    WHERE p.status='Active' 
      AND p.approve='Approved'
  `;
  const params = [];

  // propertyCategory
  if (propertyCategory && propertyCategory.trim() && propertyCategory !== "properties") {
    sql += ` AND LOWER(p.propertyCategory) = LOWER(?)`;
    params.push(propertyCategory.trim());
  }

  // propertyType safely
  if (propertyType && propertyType.trim()) {
    const types = propertyType.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length > 0) {
      const orConditions = types
        .map(() => `(p.propertyType IS NOT NULL AND p.propertyType != '' AND JSON_CONTAINS(p.propertyType, ?))`)
        .join(" OR ");
      sql += ` AND (${orConditions})`;
      types.forEach((cat) => params.push(JSON.stringify(cat)));
    }
  }

  // city
  if (city && city.trim()) {
    sql += ` AND LOWER(p.city) = LOWER(?)`;
    params.push(city.trim());
  }

  // budget
  const min = parseInt(minBudget);
  const max = parseInt(maxBudget);
  if (!isNaN(min) && !isNaN(max)) {
    sql += ` AND p.totalOfferPrice BETWEEN ? AND ?`;
    params.push(min, max);
  }

  sql += ` GROUP BY p.propertyid ORDER BY RAND()`;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
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
      };
    });

    res.json(formatted);
  });
};



// Get All Properties By Slug
export const getAllBySlug = (req, res) => {
  const { city, propertyCategory, propertyType } = req.query;

  let sql = `
    SELECT 
      p.*, 
      c.heading,
      c.content,
      c.metaTitle, 
      c.metaDescription,
      COUNT(DISTINCT w.user_id) AS likes
    FROM properties p
    LEFT JOIN cities c 
      ON p.city = c.city
    LEFT JOIN user_property_wishlist w
      ON w.property_id = p.propertyid
    WHERE p.status = 'Active' 
      AND p.approve = 'Approved'
  `;

  const params = [];

  if (propertyCategory && propertyCategory !== "properties") {
    sql += ` AND p.propertyCategory = ?`;
    params.push(propertyCategory);
  }

  // Handle propertyType (stored as JSON array in DB)
  if (propertyType && propertyType !== "properties") {
    const types = propertyType.split(",");
    const orConditions = types
      .map(() => "JSON_CONTAINS(p.propertyType, ?)")
      .join(" OR ");
    sql += ` AND (${orConditions})`;
    types.forEach((cat) => params.push(JSON.stringify(cat)));
  }

  if (city && city.trim() !== "") {
    sql += ` AND p.city = ?`;
    params.push(city);
  }

  sql += `
    GROUP BY p.propertyid
    ORDER BY RAND()
  `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    // Safely parse JSON fields
    const formatted = result.map((row) => {
      let parsedType = [];
      try {
        if (row.propertyType) {
          parsedType = JSON.parse(row.propertyType);
        }
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
      }

      return {
        ...row,
        propertyType: Array.isArray(parsedType) ? parsedType : [],
        likes: Number(row.likes) || 0,
      };
    });

    res.json(formatted);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = req.params.id;

  const sql = `
    SELECT 
      p.*,
      COUNT(DISTINCT CASE 
        WHEN pi.status = 'Available' THEN pi.id 
      END) AS availableCount,
      COUNT(DISTINCT CASE 
        WHEN pi.status = 'Booked' THEN pi.id 
      END) AS bookedCount,
      COUNT(DISTINCT w.user_id) AS likes
    FROM properties p
    LEFT JOIN propertiesinfo pi 
      ON p.propertyid = pi.propertyid
    LEFT JOIN user_property_wishlist w
      ON w.property_id = p.propertyid
    WHERE p.propertyid = ?
    GROUP BY p.propertyid;
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "property info not found" });
    }

    // safely parse JSON + format dates
    const row = result[0];
    let parsedType = [];
    try {
      parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
    } catch (e) {
      console.warn("Invalid JSON in propertyType:", row.propertyType);
    }

    const formatted = {
      ...row,
      propertyType: Array.isArray(parsedType) ? parsedType : [],
      possessionDate: row.possessionDate
        ? moment.utc(row.possessionDate).format("DD MMM YYYY")
        : null,
      likes: Number(row.likes) || 0,
    };

    res.json(formatted);
  });
};

// ** Fetch All Unique City In The Listed Property **
export const getAllCity = (req, res) => {
  const sql = `
    SELECT DISTINCT city 
    FROM properties 
    WHERE status = 'Active' AND approve = 'Approved' 
    ORDER BY city
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    // Return array of strings instead of array of objects
    res.json(result.map((row) => row.city));
  });
};

export const getAllLocation = (req, res) => {
  const sql = `
      SELECT DISTINCT location 
      FROM properties 
      WHERE status='Active' AND approve='Approved'
    `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.status(200).json(result);
  });
};

export const getLocationsByCityAndCategory = (req, res) => {
  const { propertyCategory, propertyType, city } = req.query;

  if (!propertyCategory || !city) {
    return res
      .status(400)
      .json({ message: "propertyCategory and city are required." });
  }

  let sql = `
    SELECT DISTINCT location 
    FROM properties p
    WHERE LOWER(p.city) = LOWER(?) 
    AND LOWER(p.propertyCategory) = LOWER(?)
    AND p.status='Active' 
    AND p.approve='Approved'
  `;
  const params = [city.trim(), propertyCategory.trim()];

  // Handle propertyType (stored as JSON array in DB)
  if (propertyType && propertyType.trim() && propertyType !== "properties") {
    const types = propertyType.split(","); // e.g. "Flat,Villa"
    const orConditions = types
      .map(() => "JSON_CONTAINS(p.propertyType, ?)")
      .join(" OR ");
    sql += ` AND (${orConditions})`;
    types.forEach((cat) => params.push(JSON.stringify(cat.trim())));
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching locations:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Trim + deduplicate with Set
    const locations = [
      ...new Set(
        result
          .map((row) => row.location && row.location.trim())
          .filter((loc) => loc && loc !== "")
      ),
    ];

    res.status(200).json(locations);
  });
};

// ** Fetch Property Information by ID **
export const fetchAdditionalInfoForFlat = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property Details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    // Group by wing
    const grouped = result.reduce((acc, row) => {
      const wingName = row.wing || "Unknown";
      let wingGroup = acc.find((w) => w.wing === wingName);
      if (!wingGroup) {
        wingGroup = { wing: wingName, rows: [] };
        acc.push(wingGroup);
      }
      wingGroup.rows.push(row);
      return acc;
    }, []);

    res.json(grouped);
  });
};

// ** Fetch Property Information by ID (for Plots) **
export const fetchAdditionalInfoForPlot = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    // Group by khasrano (for plots)
    const grouped = result.reduce((acc, row) => {
      const khasraNo = row.khasrano || "Unkonown";
      let khasraGroup = acc.find((g) => g.khasrano === khasraNo);

      if (!khasraGroup) {
        khasraGroup = { khasrano: khasraNo, rows: [] };
        acc.push(khasraGroup);
      }

      khasraGroup.rows.push(row);
      return acc;
    }, []);

    res.json(grouped);
  });
};

// ** Fetch Property Information by ID **
export const fetchFlatById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyinfoid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property Details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    const data = result[0];

    // Now set the updated object in state
    res.json(data);
  });
};

// ** Fetch Property Information by ID **
export const fetchPlotById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyinfoid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property Details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    const data = result[0];

    // Now set the updated object in state
    res.json(data);
  });
};

export const getAdditionalInfo = (req, res) => {
  const { propertyId } = req.params;
  const { type } = req.query;

  console.log("propertyId:", propertyId, "type:", type);

  if (!propertyId) {
    return res.status(400).json({ message: "Property ID is required" });
  }
  if (!type) {
    return res.status(400).json({ message: "Property type is required" });
  }

  const sql = `
    SELECT *
    FROM propertiesinfo
    WHERE propertyid = ? AND type = ?
  `;

  db.query(sql, [propertyId, type], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "No data found" });
    }

    res.status(200).json(result[0]);
  });
};
