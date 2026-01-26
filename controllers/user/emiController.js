import db from "../../config/dbconnect.js";
import { uploadToS3 } from "../../utils/uploadToS3.js";

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

    // Helper for S3 upload
    const uploadImagesToS3 = async (fieldFiles) => {
      if (!fieldFiles || fieldFiles.length === 0) return null;
      const uploadedUrls = [];
      for (const file of fieldFiles) {
        const url = await uploadToS3(file);
        uploadedUrls.push(url);
      }
      return uploadedUrls[0]; // single image expected
    };

    // Upload images to S3
    const panImage = await uploadImagesToS3(req.files?.panImage);
    const aadhaarFrontImage = await uploadImagesToS3(
      req.files?.aadhaarFrontImage
    );
    const aadhaarBackImage = await uploadImagesToS3(
      req.files?.aadhaarBackImage
    );

    // Validation
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
      panImage,              // S3 URL
      aadhaarFrontImage,     // S3 URL
      aadhaarBackImage,      // S3 URL
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error inserting EMI form:", err);
        return res.status(500).json({
          message: "Database insert error",
          error: err,
        });
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