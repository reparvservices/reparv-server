import db from "#db";
import moment from "moment-timezone";

export const getAllSalesPartner = async (req, res) => {
  try {
    const partnerId = req.projectPartnerUser?.id; // Project Partner Logic

    const sql = "SELECT * FROM salespersons Where projectpartnerid = ?";
    db.query(sql, [partnerId], (err, result) => {
      if (err) {
        console.error("Error fetching:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getAllTerritoryPartner = async (req, res) => {
  try {
    const partnerId = req.projectPartnerUser?.id; // Project Partner Logic

    const sql = "SELECT * FROM territorypartner Where projectpartnerid = ?";
    db.query(sql, [partnerId], (err, result) => {
      if (err) {
        console.error("Error fetching:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

//asign login to sales partner
