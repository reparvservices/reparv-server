import db from "../../config/dbconnect.js";
import moment from "moment";

// Fetch Project Partner by Contact **
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

export const getAllProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Base SQL
  let sql = `
    SELECT * FROM properties
    WHERE projectpartnerid = ?
    AND city = ?
  `;

  const params = [projectPartnerId, selectedCity];

  // If propertyCategory present → add filter
  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND propertyCategory = ?`;
    params.push(propertyCategory);
  }

  sql += ` ORDER BY propertyid DESC`;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // Safely parse JSON fields
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

export const getHotDealProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Base SQL
  let sql = `
    SELECT * FROM properties
    WHERE projectpartnerid = ?
    AND city = ? AND hotDeal = ?
  `;

  const params = [projectPartnerId, selectedCity, "Active"];

  // If propertyCategory present → add filter
  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND propertyCategory = ?`;
    params.push(propertyCategory);
  }

  sql += ` ORDER BY propertyid DESC`;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // Safely parse JSON fields
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

export const getPremiumProperties = (req, res) => {
  const { propertyCategory, projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Base Query
  let sql = `
    SELECT * FROM properties
    WHERE projectpartnerid = ?
    AND city = ?
  `;

  const params = [projectPartnerId, selectedCity];

  // Optional category filter
  if (propertyCategory && propertyCategory.trim() !== "") {
    sql += ` AND propertyCategory = ?`;
    params.push(propertyCategory);
  }

  // Sort highest totalPrice first and pick top 5
  sql += ` ORDER BY totalOfferPrice DESC LIMIT 5`;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // Safely parse JSON fields
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
