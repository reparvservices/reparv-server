import db from "#db";
import moment from "moment-timezone";

// **Fetch All Properties**
export const getAll = (req, res) => {
  // A sales partner works under one project partner: show that partner's listings.
  // (LEFT JOIN: newer listings have no builder and must not drop out of the list.)
  const projectPartnerId = req.salesUser?.projectpartnerid;
  if (!projectPartnerId) return res.json([]);
  const sql = `SELECT properties.*, builders.company_name FROM properties
               LEFT JOIN builders ON properties.builderid = builders.builderid
               WHERE properties.projectpartnerid = ?
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Single Property by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const projectPartnerId = req.salesUser?.projectpartnerid;
  if (!projectPartnerId) return res.status(404).json({ message: "Property not found" });

  const sql =
    "SELECT properties.*, builders.company_name FROM properties LEFT JOIN builders ON builders.builderid = properties.builderid WHERE properties.propertyid = ? AND properties.projectpartnerid = ?";
  db.query(sql, [Id, projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }
    res.json(result[0]);
  });
};

// ** Fetch Property Information by ID **
export const fetchAdditionalInfo = (req, res) => {
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

    res.json(result); // Return only the first property
  });
};

//update propertyinfo status available Or Notavailable
export const updateStatus = (req, res) => {
  const id = parseInt(req.params.id);
  const sql = `
  UPDATE propertiesinfo SET status = ? WHERE propertyinfoid = ?
  `;
  const val = "Booked";
  db.query(sql, [val, id], (err, result) => {
    if (err) {
      console.error("Error deleting :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res
      .status(200)
      .json({ message: "Property Info Status change successfully" });
  });
};
