import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

export const addClient = async (req, res) => {
  try {
    const {
      salespersonId,
      name,
      contact,
      email,
      city,
      budget,
      profession,
      status,
      purpose,
      income,
      paymentmode,
      timeperiod,
      decisionmaker,
      asset,
      extra,
      remark,
    } = req.body;

    if (!salespersonId) {
      return res.json({
        message: "User not found !",
      });
    }

    const sql = `
    INSERT INTO salespersonclients (
     salespersonId, name, contact, email, city, budget, profession,
      status, purpose, income, paymentmode, timeperiod, decisionmaker,
      asset, extra, remark
    ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    db.query(
      sql,
      [
        salespersonId,
        name,
        contact,
        email,
        city,
        budget,
        profession,
        status,
        purpose,
        income,
        paymentmode,
        timeperiod,
        decisionmaker,
        asset,
        extra,
        remark,
      ],
      (err, result) => {
        if (err) {
          console.error("Insert error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(201)
          .json({ message: "Client added successfully", id: result.insertId });
      }
    );
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};
