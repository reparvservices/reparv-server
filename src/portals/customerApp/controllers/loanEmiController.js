// controllers/formController.js
import db from "#db";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import { uploadToS3 } from "#utils/imageUpload.js";

export const submitEmiForm = async (req, res) => {
  try {
    let {
      // Common
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
      user_id,
      propertyid,

      // Job fields
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

      // Business fields
      businessType,
      businessName,
      businessVintage,
      annualTurnover,
      monthlyNetIncome,
      existingLoanEMI,
      gstRegistered,
      itrFiled,
    } = req.body;

    const toNull = (v) =>
      v === "" || v === undefined || v === null ? null : v;

    // 📅 DOB convert (DD/MM/YYYY → YYYY-MM-DD)
    if (dateOfBirth && dateOfBirth.includes("/")) {
      const [dd, mm, yyyy] = dateOfBirth.split("/");
      dateOfBirth = `${yyyy}-${mm}-${dd}`;
    }

    // ─── Boolean coerce ──────────────────────────────────────────────────
    const toBool = (v) => {
      if (v === "1" || v === true || v === "true") return 1;
      if (v === "0" || v === false || v === "false") return 0;
      return null;
    };

    /* ===== IMAGE UPLOAD (WEBP + S3) ===== */
    let panImage = null;
    let aadhaarFrontImage = null;
    let aadhaarBackImage = null;

    if (req.files?.panImage?.[0]) {
      const converted = await convertSingleImageToWebp(req.files.panImage[0]);
      panImage = converted ? await uploadToS3(converted) : null;
    }

    if (req.files?.aadhaarFrontImage?.[0]) {
      const converted = await convertSingleImageToWebp(
        req.files.aadhaarFrontImage[0],
      );
      aadhaarFrontImage = converted ? await uploadToS3(converted) : null;
    }

    if (req.files?.aadhaarBackImage?.[0]) {
      const converted = await convertSingleImageToWebp(
        req.files.aadhaarBackImage[0],
      );
      aadhaarBackImage = converted ? await uploadToS3(converted) : null;
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

        -- Job fields
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

        -- Business fields
        businessType,
        businessName,
        businessVintage,
        annualTurnover,
        monthlyNetIncome,
        existingLoanEMI,
        gstRegistered,
        itrFiled,

        -- Document images
        panImage,
        aadhaarFrontImage,
        aadhaarBackImage
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,?,?
      )
    `;

    const values = [
      // Common (12)
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

      // Job (11)
      toNull(employmentSector),
      toNull(workexperienceYear),
      toNull(workexperienceMonth),
      toNull(salaryType),
      toNull(grossPay),
      toNull(netPay),
      toNull(pfDeduction),
      toNull(otherIncome),
      toNull(yearIncome),
      toNull(monthIncome),
      toNull(ongoingEmi),

      // Business (8)
      toNull(businessType),
      toNull(businessName),
      toNull(businessVintage),
      toNull(annualTurnover),
      toNull(monthlyNetIncome),
      toNull(existingLoanEMI),
      toBool(gstRegistered),
      toBool(itrFiled),

      // Images (3)
      panImage,
      aadhaarFrontImage,
      aadhaarBackImage,
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database insert error",
          error: err.sqlMessage,
        });
      }
      console.log("login result", result);
      res.status(201).json({
        message: "Loan form submitted successfully",
        loanId: result.insertId,
      });
    });
  } catch (err) {
    console.error("EMI Submit Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
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
