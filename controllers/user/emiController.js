import db from "../../config/dbconnect.js";

export const submitEmiForm = (req, res) => {
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

    // Images from multer
    const panImage = req.files?.panImage?.[0]?.filename || null;
    const aadhaarFrontImage =
      req.files?.aadhaarFrontImage?.[0]?.filename || null;
    const aadhaarBackImage = req.files?.aadhaarBackImage?.[0]?.filename || null;

    // Validation (backend safety)
    if (!panImage || !aadhaarFrontImage || !aadhaarBackImage) {
      return res.status(400).json({
        message: "PAN image and Aadhaar front & back images are required",
      });
    }

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
        return res
          .status(500)
          .json({ message: "Database insert error", error: err });
      }

      res.status(201).json({
        message: "EMI form submitted successfully",
        id: result.insertId,
      });
    });
  } catch (error) {
    console.error("EMI Submit Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
