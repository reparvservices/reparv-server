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
    }
  );
};
