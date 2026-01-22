// controllers/formController.js
import db from "../../config/dbconnect.js";

export const submitEmiForm = (req, res) => {
  let {
    employmentType,
    fullname,
    dateOfBirth,
    contactNo,
    panNumber,
    aadhaarNumber,
    email,
    state,
    city,
    pincode,
    employmentSector,
    workexperienceYear,
    workexperienceMonth,
    salaryType,
    grossPay,
    netPay,
    pfDeduction,
    otherIncome,
    yearIncome,
    monthIncome,
    ongoingEmi,
    businessSector,
    businessCategory,
    businessExperienceYears,
    businessExperienceMonths,
    businessOtherIncome,
    user_id,
    propertyid,
  } = req.body;

  //  Convert empty strings to NULL
  const toNull = (v) => (v === "" || v === undefined ? null : v);

  //  Convert date to MySQL format YYYY-MM-DD
  if (dateOfBirth) {
    const [dd, mm, yyyy] = dateOfBirth.split("/");
    dateOfBirth = `${yyyy}-${mm}-${dd}`;
  }

  const sql = `
    INSERT INTO loanemiforperson (
      user_id,
      propertyid,
      employmentType,
      fullname,
      dateOfBirth,
      contactNo,
      panNumber,
      aadhaarNumber,
      email,
      state,
      city,
      pincode,
      employmentSector,
      workexperienceYear,
      workexperienceMonth,
      salaryType,
      grossPay,
      netPay,
      pfDeduction,
      otherIncome,
      yearIncome,
      monthIncome,
      ongoingEmi,
      businessSector,
      businessCategory,
      businessExperienceYears,
      businessExperienceMonths,
      businessOtherIncome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    user_id,
    propertyid,
    employmentType,
    fullname,
    dateOfBirth,
    contactNo,
    panNumber,
    aadhaarNumber,
    email,
    state,
    city,
    pincode,
    employmentSector,
    toNull(workexperienceYear),
    toNull(workexperienceMonth),
    salaryType,
    toNull(grossPay),
    toNull(netPay),
    toNull(pfDeduction),
    otherIncome,
    toNull(yearIncome),
    toNull(monthIncome),
    toNull(ongoingEmi),
    toNull(businessSector),
    toNull(businessCategory),
    toNull(businessExperienceYears),
    toNull(businessExperienceMonths),
    toNull(businessOtherIncome),
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res.status(500).json({
        message: "Database insert error",
        error: err.sqlMessage,
      });
    }

    res.status(201).json({
      message: "Form data saved successfully",
      loanId: result.insertId,
    });
  });
};

export const getUserLoanCounts = (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const sql = `
      SELECT
        COUNT(*) AS total_applications,

        SUM(CASE WHEN approved = 'Active' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_status_count,

        SUM(CASE WHEN approved = 'Inactive' THEN 1 ELSE 0 END) AS inactive_approved_count,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactive_status_count,

        SUM(CASE WHEN approved = 'Rejected' THEN 1 ELSE 0 END) AS rejected_approved_count,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_status_count

      FROM loanemiforperson
      WHERE user_id = ?
    `;

    db.query(sql, [user_id], (err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      return res.status(200).json({
        success: true,
        user_id,
        data: results[0], // includes total_applications
      });
    });
  } catch (error) {
    console.error("Controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const getLoansByUserId = (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const sql = `
      SELECT * 
      FROM loanemiforperson
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;

    db.query(sql, [user_id], (err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      return res.status(200).json({
        success: true,
        total: results.length,
        data: results,
      });
    });
  } catch (error) {
    console.error("Controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
