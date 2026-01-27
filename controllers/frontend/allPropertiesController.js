import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All**
export const getAll = (req, res) => {
  const sql =
    "SELECT * FROM properties WHERE status='Active' AND approve='Approved' ORDER BY RAND()";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
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

// ** Fetch All City **
export const getAllByCity = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }
  const sql = `SELECT * FROM properties WHERE status='Active' AND approve='Approved' AND city = ? ORDER BY RAND() `;
  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
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

// ** Fetch All City **
export const getHotDealProperties = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }
  const sql = `SELECT * FROM properties WHERE status='Active' AND approve='Approved' AND hotDeal = 'active' AND city = ? ORDER BY RAND() `;
  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
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

// ** Fetch All City **
export const getTopPicksProperties = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(401).json({ message: "City Not Selected!" });
  }
  const sql = `SELECT * FROM properties WHERE status='Active' AND approve='Approved' AND topPicksStatus = 'active' AND city = ? ORDER BY RAND() `;
  db.query(sql, [city], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
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
