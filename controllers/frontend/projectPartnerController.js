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
  const { projectPartnerId, selectedCity } = req.body;

  if (!projectPartnerId || !selectedCity) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const sql = `
    SELECT * FROM properties 
    WHERE projectpartnerid = ? 
    AND city = ?
    ORDER BY propertyid DESC
  `;

  db.query(sql, [projectPartnerId, selectedCity], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(result);
  });
};
