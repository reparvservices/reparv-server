import db from "../../config/dbconnect.js";
import { convertSingleImageToWebp } from "../../utils/convertSingleImageToWebp.js";
import { uploadToS3 } from "../../utils/imageUpload.js";
import moment from "moment";

// GET ALL LOAN APPLICATIONS + COUNTS
export const getAll = (req, res) => {
  const userId = req.guestUser?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const sql = `
    SELECT 
      l.*,
      SUM(CASE WHEN l.status = 'Active' THEN 1 ELSE 0 END) OVER() AS activeCount,
      SUM(CASE WHEN l.status = 'Inactive' THEN 1 ELSE 0 END) OVER() AS inactiveCount,
      SUM(CASE WHEN l.approved = 'Approved' THEN 1 ELSE 0 END) OVER() AS approvedCount
    FROM loanemiforperson l
    WHERE l.user_id = ?
    ORDER BY l.id DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("Get all loans error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // Format dates
    const formattedRows = rows.map((row) => ({
      ...row,
      created_at: row.created_at
        ? moment(row.created_at).format("DD MMM YYYY")
        : null,
      // updated_at: row.updated_at
      //   ? moment(row.updated_at).format("DD MMM YYYY | hh:mm A")
      //   : null,
    }));

    // Counts (single row se)
    const counts = rows.length
      ? {
          active: rows[0].activeCount,
          inactive: rows[0].inactiveCount,
          approved: rows[0].approvedCount,
        }
      : { active: 0, inactive: 0, approved: 0 };

    // SINGLE RESPONSE
    res.json({
      counts,
      data: formattedRows,
    });
  });
};

// GET LOAN BY ID
export const getById = (req, res) => {
  const loanId = parseInt(req.params.id);
  const userId = req.guestUser?.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (isNaN(loanId)) {
    return res.status(400).json({ message: "Invalid Loan ID" });
  }

  const sql = `
    SELECT *
    FROM loanemiforperson
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `;

  db.query(sql, [loanId, userId], (err, rows) => {
    if (err) {
      console.error("Get loan by ID error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!rows.length) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    const formatted = rows.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY"),
      //updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted[0]);
  });
};

export const submitEmiForm = async (req, res) => {
  try {
    const ID = req.guestUser?.id || null;
    if (!ID) {
      return res
        .status(400)
        .json({ message: "Unauthorized, Please Login Again!" });
    }

    const {
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
    } = req.body;

    /* ---------- HELPER: COMPRESS + UPLOAD ---------- */
    const uploadSingleImage = async (files) => {
      if (!files || files.length === 0) return null;

      const convertedImage = await convertSingleImageToWebp(files[0]);
      return await uploadToS3(convertedImage);
    };

    /* ---------- UPLOAD IMAGES ---------- */
    const panImage = await uploadSingleImage(req.files?.panImage);
    const aadhaarFrontImage = await uploadSingleImage(
      req.files?.aadhaarFrontImage
    );
    const aadhaarBackImage = await uploadSingleImage(
      req.files?.aadhaarBackImage
    );

    /* ---------- VALIDATION ---------- */
    if (!panImage || !aadhaarFrontImage || !aadhaarBackImage) {
      return res.status(400).json({
        message: "PAN image and Aadhaar front & back images are required",
      });
    }

    /* ---------- INSERT DATA ---------- */
    const sql = `
      INSERT INTO loanemiforperson (
        user_id, employmentType, fullname, dateOfBirth, contactNo, panNumber, aadhaarNumber, email,
        state, city, pincode, employmentSector, workexperienceYear, workexperienceMonth,
        salaryType, grossPay, netPay, pfDeduction, otherIncome,
        yearIncome, monthIncome, ongoingEmi,
        businessSector, businessCategory, businessExperienceYears, businessExperienceMonths, businessOtherIncome,
        panImage, aadhaarFrontImage, aadhaarBackImage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      ID,
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
      panImage,
      aadhaarFrontImage,
      aadhaarBackImage,
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error inserting EMI form:", err);
        return res.status(500).json({
          message: "Database insert error",
          error: err,
        });
      }

      return res.status(201).json({
        message: "EMI form submitted successfully",
        id: result.insertId,
      });
    });
  } catch (error) {
    console.error("EMI Submit Error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};
