import db from "../../config/dbconnect.js";
import moment from "moment";

export const getAll = (req, res) => {
  const filterStatus = req.params.filterStatus;

  if (!filterStatus) {
    return res.status(401).json({ message: "Status Not Selected" });
  }

  let sql = "";
  switch (filterStatus) {
    case "In Progress":
    case "Approved":
    case "Not Approved":
      sql = `SELECT * FROM loanemiforperson WHERE approved = ? ORDER BY created_at DESC`;
      break;
    case "All":
    default:
      sql = `SELECT * FROM loanemiforperson ORDER BY created_at DESC`;
  }

  const queryParams = ["In Progress", "Approved", "Not Approved"].includes(filterStatus)
    ? [filterStatus]
    : [];

  db.query(sql, queryParams, (err, partners) => {
    if (err) {
      console.error("Error fetching EMI data:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Count query by filterStatus
    const countQuery = `
      SELECT approved, COUNT(*) AS count
      FROM loanemiforperson
      GROUP BY approved
    `;

    db.query(countQuery, (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching EMI counts:", countErr);
        return res
          .status(500)
          .json({ message: "Database error", error: countErr });
      }

      const formatted = (partners || []).map((row) => ({
        ...row,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
        followUp: row.followUp || null,
        followUpDate: row.followUpDate
          ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      const statusCounts = {};
      counts.forEach((item) => {
        statusCounts[item.approved] = item.count;
      });

      return res.json({
        data: formatted,
        statusCounts,
      });
    });
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }
  const sql = "SELECT * FROM loanemiforperson WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }
    res.json(result[0]);
  });
};

export const edit = (req, res) => {
  const {
    id,
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

  if (!id) {
    return res.status(400).json({ message: "Missing ID for update." });
  }

  const updateSql = `
    UPDATE loanemiforperson SET 
      employmentType = ?, fullname = ?, dateOfBirth = ?, contactNo = ?, panNumber = ?, aadhaarNumber = ?, email = ?,
      state = ?, city = ?, pincode = ?, employmentSector = ?, workexperienceYear = ?, workexperienceMonth = ?,
      salaryType = ?, grossPay = ?, netPay = ?, pfDeduction = ?, otherIncome = ?,
      yearIncome = ?, monthIncome = ?, ongoingEmi = ?,
      businessSector = ?, businessCategory = ?, businessExperienceYears = ?, businessExperienceMonths = ?, businessOtherIncome = ?
    WHERE id = ?
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
    id,
  ];

  db.query(updateSql, values, (err, result) => {
    if (err) {
      console.error("Error updating data:", err);
      return res
        .status(500)
        .json({ message: "Database update error", error: err });
    }

    return res
      .status(200)
      .json({ message: "Form updated successfully", result });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM loanemiforperson WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE loanemiforperson SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: "status change successfully" });
      }
    );
  });
};

//* Change Approved status */
export const changeLoanApprovedStatus = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: "Empty status" });
  }

  db.query(
    "SELECT * FROM loanemiforperson WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      db.query(
        "UPDATE loanemiforperson SET approved = ? WHERE id = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error Approved :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({ message: "Approved Status change successfully" });
        }
      );
    }
  );
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM loanemiforperson WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "entry not found" });
      }

      db.query("DELETE FROM loanemiforperson WHERE id = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Entry deleted successfully" });
      });
    }
  );
};
