import db from "#db";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      rc.*,
      sp.plan_name AS planName,
      CONCAT(sp.duration, ' ' , IF(sp.billing_cycle = 'yearly', 'Year', 'Month')) AS planDuration,
      sp.price AS totalPrice
    FROM redeem_codes AS rc
    LEFT JOIN subscription_plans AS sp
      ON rc.planId = sp.id
    ORDER BY rc.id DESC;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching redeem codes:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Format start and end dates
    const formattedResult = result.map((row) => ({
      ...row,
      startDate: row.startDate
        ? moment(row.startDate).format("DD MMM YYYY")
        : null,
      endDate: row.endDate ? moment(row.endDate).format("DD MMM YYYY") : null,
    }));

    res.status(200).json(formattedResult);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id, 10);

  const sql = `
    SELECT 
      rc.*, 
      sp.plan_name AS planName,
      CONCAT(sp.duration, ' ' , IF(sp.billing_cycle = 'yearly', 'Year', 'Month')) AS planDuration,
      sp.price AS totalPrice
    FROM redeem_codes AS rc
    LEFT JOIN subscription_plans AS sp
      ON rc.planId = sp.id
    WHERE rc.id = ?;
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching discount:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Format dates (DD MMM YYYY)
    const row = result[0];
    const formattedResult = {
      ...row,
      startDate: row.startDate
        ? moment(row.startDate).format("DD MMM YYYY")
        : null,
      endDate: row.endDate ? moment(row.endDate).format("DD MMM YYYY") : null,
    };

    res.status(200).json(formattedResult);
  });
};

export const checkRedeemCode = (req, res) => {
  try {
    let { partnerType, redeemCode } = req.body;

    if (
      !partnerType ||
      partnerType.trim() === "" ||
      !redeemCode ||
      redeemCode.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        unique: null,
        message: "Redeem Code",
      });
    }

    redeemCode = redeemCode.trim();

    // Case-sensitive check using BINARY in MySQL
    const sql =
      "SELECT id FROM redeem_codes WHERE partnerType = ? AND BINARY redeemCode = ? LIMIT 1";

    db.query(sql, [partnerType, redeemCode], (err, rows) => {
      if (err) {
        console.error("Error checking redeem code:", err);
        return res.status(500).json({
          success: false,
          unique: null,
          message: "Server error while checking redeem code",
        });
      }

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          unique: false,
          message: "Redeem Code already exists",
        });
      }

      return res.status(200).json({
        success: true,
        unique: true,
        message: "Redeem Code is available",
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      success: false,
      unique: null,
      message: "Unexpected server error",
    });
  }
};

export const addDiscount = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { partnerType, planId, redeemCode, discount, startDate, endDate } =
    req.body;

  if (
    !partnerType ||
    !planId ||
    !redeemCode ||
    !discount ||
    !startDate ||
    !endDate
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Step 1: Check if redeemCode already exists for this partnerType
  const checkSQL = `SELECT id FROM redeem_codes WHERE partnerType = ? AND redeemCode = ? LIMIT 1`;

  db.query(checkSQL, [partnerType, redeemCode], (err, rows) => {
    if (err) {
      return res
        .status(500)
        .json({ message: "Database error while checking", error: err });
    }

    // If exists, return conflict/validation message
    if (rows.length > 0) {
      return res.status(400).json({
        message: "Redeem code already exists",
        redeemCode,
        unique: false,
      });
    }

    // Step 2: Insert only if unique
    const insertSQL = `INSERT INTO redeem_codes (redeemCode, partnerType, planId, discount, startDate, endDate, updated_at, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      insertSQL,
      [
        redeemCode,
        partnerType,
        planId,
        discount,
        startDate,
        endDate,
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error during insert", error: err });
        }

        res.status(201).json({
          message: "Discount added successfully",
          redeemCode,
          discountId: result.insertId,
          unique: true,
        });
      }
    );
  });
};

export const updateDiscount = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id, 10);
  if (!Id) {
    return res.status(400).json({ message: "Invalid Id" });
  }
  const { partnerType, planId, discount, startDate, endDate } = req.body;

  if (!partnerType || !planId || !discount || !startDate || !endDate) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query("SELECT * FROM redeem_codes WHERE id = ?", [Id], (err, result) => {
    if (err)
      return res.status(500).json({ message: "Database error", error: err });
    if (result.length === 0)
      return res.status(404).json({ message: "Discount not found" });

    const updateSQL = `UPDATE redeem_codes 
                       SET partnerType=?, planId=?, discount=?, startDate=?, endDate=?, updated_at=?
                       WHERE id=?`;

    db.query(
      updateSQL,
      [partnerType, planId, discount, startDate, endDate, currentdate, Id],
      (err) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Database error", error: err });

        res.status(200).json({ message: "Discount updated successfully" });
      }
    );
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM redeem_codes WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "discount not found" });
    }

    db.query("DELETE FROM redeem_codes WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Discount deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM redeem_codes WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    let status = "";
    if (result[0].status === "Active") {
      status = "Inactive";
    } else {
      status = "Active";
    }
    console.log(status);
    db.query(
      "UPDATE redeem_codes SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({
          message: "Discount status change successfully",
        });
      }
    );
  });
};
