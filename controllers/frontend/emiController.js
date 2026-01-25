import db from "../../config/dbconnect.js";

export const submitEmiForm = (req, res) => {
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

  const sql = `
  INSERT INTO loanemiforperson (
    employmentType, fullname, dateOfBirth, contactNo, panNumber, aadhaarNumber, email,
    state,
    city, pincode, employmentSector, workexperienceYear, workexperienceMonth,
    salaryType, grossPay, netPay, pfDeduction, otherIncome,
    yearIncome, monthIncome, ongoingEmi,
    businessSector, businessCategory, businessExperienceYears, businessExperienceMonths, businessOtherIncome
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
`;

  const values = [
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
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res
        .status(500)
        .json({ message: "Database insert error", error: err });
    }

    res.status(201).json({ message: "Form data saved successfully", result });
  });
};
