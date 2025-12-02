import fs from "fs";
import path from "path";
import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";

const saltRounds = 10;
// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM guestUsers ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql =
    "SELECT * FROM guestUsers WHERE status = 'Active' ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = "SELECT * FROM guestUsers WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result[0]);
  });
};

// **Add New **
export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    fullname,
    contact,
    email,
    address,
    state,
    city,
    pincode,
    experience,
    adharno,
    panno,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const adharImageFile = req.files?.["adharImage"]?.[0];
  const panImageFile = req.files?.["panImage"]?.[0];

  const adharImageUrl = adharImageFile
    ? `/uploads/${adharImageFile.filename}`
    : null;
  const panImageUrl = panImageFile ? `/uploads/${panImageFile.filename}` : null;

  const checkSql = `SELECT * FROM guestUsers WHERE contact = ? OR email = ?`;

  db.query(checkSql, [contact, email.toLowerCase(),], (checkErr, checkResult) => {
    if (checkErr) {
      console.error("Error checking existing user:", checkErr);
      return res
        .status(500)
        .json({ message: "Database error during validation", error: checkErr });
    }

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "User already exists with this contact or email",
      });
    }

    // Only insert if no existing partner
    const sql = `INSERT INTO guestUsers (fullname, contact, email, address, state, city, pincode, experience, adharno, panno, bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, updated_at, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      sql,
      [
        fullname,
        contact,
        email.toLowerCase(),
        address,
        state,
        city,
        pincode,
        experience,
        adharno,
        panno,
        bankname,
        accountholdername,
        accountnumber,
        ifsc,
        adharImageUrl,
        panImageUrl,
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        return res.status(201).json({
          message: "User added successfully",
          Id: result.insertId,
        });
      }
    );
  });
};

export const edit = (req, res) => {
  const userid = req.params.id;
  if (!userid) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    fullname,
    contact,
    email,
    address,
    state,
    city,
    pincode,
    experience,
    adharno,
    panno,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Handle uploaded files
  const adharImageFile = req.files?.["adharImage"]?.[0];
  const panImageFile = req.files?.["panImage"]?.[0];

  const adharImageUrl = adharImageFile
    ? `/uploads/${adharImageFile.filename}`
    : null;
  const panImageUrl = panImageFile ? `/uploads/${panImageFile.filename}` : null;

  // First fetch old images (to delete if replaced)
  const selectSql = `SELECT adharimage, panimage FROM guestUsers WHERE id = ?`;
  db.query(selectSql, [userid], (selectErr, rows) => {
    if (selectErr) {
      console.error("Error fetching old images:", selectErr);
      return res.status(500).json({ message: "Database error" });
    }

    const oldAdhar = rows[0]?.adharimage;
    const oldPan = rows[0]?.panimage;

    let updateSql = `
      UPDATE guestUsers 
      SET fullname = ?, contact = ?, email = ?, address = ?, state = ?, city = ?, 
          pincode = ?, experience = ?, adharno = ?, panno = ?, bankname = ?, 
          accountholdername = ?, accountnumber = ?, ifsc = ?, updated_at = ?
    `;
    const updateValues = [
      fullname,
      contact,
      email.toLowerCase(),
      address,
      state,
      city,
      pincode,
      experience,
      adharno,
      panno,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
      currentdate,
    ];

    if (adharImageUrl) {
      updateSql += `, adharimage = ?`;
      updateValues.push(adharImageUrl);
    }

    if (panImageUrl) {
      updateSql += `, panimage = ?`;
      updateValues.push(panImageUrl);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(userid);

    db.query(updateSql, updateValues, (updateErr) => {
      if (updateErr) {
        console.error("Error updating User:", updateErr);
        return res
          .status(500)
          .json({ message: "Database error during update", error: updateErr });
      }

      // Delete old Aadhaar image if replaced
      if (adharImageUrl && oldAdhar) {
        const oldPath = path.join(process.cwd(), oldAdhar.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) {
          fs.unlink(oldPath, (err) => {
            if (err) console.warn("Failed to delete old Aadhaar image:", err);
          });
        }
      }

      // Delete old PAN image if replaced
      if (panImageUrl && oldPan) {
        const oldPath = path.join(process.cwd(), oldPan.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) {
          fs.unlink(oldPath, (err) => {
            if (err) console.warn("Failed to delete old PAN image:", err);
          });
        }
      }

      res.status(200).json({ message: "User updated successfully" });
    });
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query("SELECT * FROM guestUsers WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "user not found" });
    }

    db.query("DELETE FROM guestUsers WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "User deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  db.query("SELECT * FROM guestUsers WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE guestUsers SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error Changing Status :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Status change successfully" });
      }
    );
  });
};

export const assignLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const Id = parseInt(req.params.id);

    if (isNaN(Id)) {
      return res.status(400).json({ message: "Invalid Partner ID" });
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Use 10 as salt rounds

    db.query("SELECT * FROM guestUsers WHERE id = ?", [Id], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      let loginstatus = "Active";
      const email = result[0].email;

      db.query(
        "UPDATE guestUsers SET loginstatus = ?, username = ?, password = ? WHERE id = ?",
        [loginstatus, username, hashedPassword, Id],
        (err, updateResult) => {
          if (err) {
            console.error("Error updating record:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          // Send email after successful update
          sendEmail(
            email,
            username,
            password,
            "Guest User",
            "https://users.reparv.in"
          )
            .then(() => {
              res.status(200).json({
                message: "User login assigned successfully and email sent.",
              });
            })
            .catch((emailError) => {
              console.error("Error sending email:", emailError);
              res
                .status(500)
                .json({ message: "Login updated but email failed to send." });
            });
        }
      );
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
