import db from "#db";
import moment from "moment-timezone";

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = req.params.id;
  const sql = `
      SELECT 
        properties.*,
        COUNT(CASE WHEN propertiesinfo.status = 'Available' THEN 1 END) AS availableCount,
        COUNT(CASE WHEN propertiesinfo.status = 'Booked' THEN 1 END) AS bookedCount
      FROM properties
      LEFT JOIN propertiesinfo ON properties.propertyid = propertiesinfo.propertyid
      WHERE properties.propertyid = ?
      GROUP BY properties.propertyid;
    `;
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "property info not found" });
    }
    res.json(result[0]);
  });
};

// **Fetch Single by ID**
export const getImages = (req, res) => {
  const Id = req.params.id;
  const sql = `SELECT * FROM properties WHERE propertyid = ?`;
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "property info not found" });
    }
    res.json(result);
  });
};
