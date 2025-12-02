import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import fs from "fs";
import path from "path";

const saltRounds = 10;

export const getAll = (req, res) => {
  const partnerLister = req.params.partnerlister;

  if (!partnerLister) {
    return res.status(401).json({ message: "Partner Lister Not Selected" });
  }

  let sql;
  if (partnerLister === "Reparv") {
    sql = `
      SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM projectpartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Project Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Project Partner'
      ) pf ON projectpartner.id = pf.partnerId
      WHERE projectpartner.partneradder IS NULL 
        OR projectpartner.partneradder = ''
      ORDER BY projectpartner.created_at DESC;
    `;
  } else {
    sql = `
      SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM projectpartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Project Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Project Partner'
      ) pf ON projectpartner.id = pf.partnerId
        OR projectpartner.partneradder = ''
      ORDER BY projectpartner.created_at DESC;
    `;
  }

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
      followUp: row.followUp || null,
      followUpDate: row.followUpDate
        ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql =
    "SELECT * FROM projectpartner WHERE status = 'Active' ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch All**
export const getAllByCity = (req, res) => {
  const city = req.params.city;
  if (!city) {
    return res.status(400).json({ message: "Invalid City" });
  }
  const sql =
    "SELECT * FROM projectpartner WHERE status = 'Active' AND city = ? ORDER BY id DESC";
  db.query(sql, [city], (err, result) => {
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
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }
  const sql = "SELECT * FROM projectpartner WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Project Partner not found" });
    }
    res.json(result[0]);
  });
};

// **Add New Project Partner **
export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    fullname,
    contact,
    email,
    intrest,
    refrence,
    address,
    state,
    city,
    pincode,
    experience,
    adharno,
    panno,
    rerano,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({ message: "All fields are required!" });
  }

  const createReferralCode = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "REF-" + code;
  };

  const generateUniqueReferralCode = (callback) => {
    const code = createReferralCode();
    db.query(
      "SELECT referral FROM projectpartner WHERE referral = ?",
      [code],
      (err, results) => {
        if (err) return callback(err, null);
        if (results.length > 0) return generateUniqueReferralCode(callback);
        return callback(null, code);
      }
    );
  };

  const adharImageFile = req.files?.["adharImage"]?.[0];
  const panImageFile = req.files?.["panImage"]?.[0];
  const reraImageFile = req.files?.["reraImage"]?.[0];

  const adharImageUrl = adharImageFile
    ? `/uploads/${adharImageFile.filename}`
    : null;
  const panImageUrl = panImageFile ? `/uploads/${panImageFile.filename}` : null;
  const reraImageUrl = reraImageFile
    ? `/uploads/${reraImageFile.filename}`
    : null;

  const checkSql = `SELECT * FROM projectpartner WHERE contact = ? OR email = ?`;

  db.query(checkSql, [contact, email.toLowerCase()], (checkErr, checkResult) => {
    if (checkErr) {
      console.error("Error checking existing Project Partner:", checkErr);
      return res.status(500).json({
        message: "Database error during validation",
        error: checkErr,
      });
    }

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "Project Partner already exists with this Contact or Email",
      });
    }

    generateUniqueReferralCode((referralErr, referralCode) => {
      if (referralErr) {
        console.error("Referral code generation failed:", referralErr);
        return res.status(500).json({
          message: "Error generating unique referral code",
          error: referralErr,
        });
      }

      const insertSql = `
        INSERT INTO projectpartner 
        (fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, adharno, panno, rerano, bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, updated_at, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [
          fullname,
          contact,
          email.toLowerCase(),
          intrest,
          refrence,
          referralCode,
          address,
          state,
          city,
          pincode,
          experience,
          adharno,
          panno,
          rerano,
          bankname,
          accountholdername,
          accountnumber,
          ifsc,
          adharImageUrl,
          panImageUrl,
          reraImageUrl,
          currentdate,
          currentdate,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error inserting Project Partner:", insertErr);
            return res.status(500).json({
              message: "Database error during insert",
              error: insertErr,
            });
          }

          const followupSql = `
            INSERT INTO partnerFollowup 
            (partnerId, role, followUp, followUpText, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.query(
            followupSql,
            [
              insertResult.insertId,
              "Project Partner",
              "New",
              "Newly Added Project Partner",
              currentdate,
              currentdate,
            ],
            (followupErr) => {
              if (followupErr) {
                console.error("Error adding follow-up:", followupErr);
                return res.status(500).json({
                  message: "Follow-up insert failed",
                  error: followupErr,
                });
              }

              return res.status(201).json({
                message: "Project Partner added successfully",
                Id: insertResult.insertId,
              });
            }
          );
        }
      );
    });
  });
};

export const edit = (req, res) => {
  const partnerid = parseInt(req.params.id);
  if (isNaN(partnerid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    fullname,
    contact,
    email,
    intrest,
    address,
    state,
    city,
    pincode,
    experience,
    adharno,
    panno,
    rerano,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Handle uploaded multiple files
  const adharImageFiles = req.files?.["adharImage"] || [];
  const panImageFiles = req.files?.["panImage"] || [];
  const reraImageFiles = req.files?.["reraImage"] || [];

  // Map to URLs
  const adharImageUrls = adharImageFiles.map((f) => `/uploads/${f.filename}`);
  const panImageUrls = panImageFiles.map((f) => `/uploads/${f.filename}`);
  const reraImageUrls = reraImageFiles.map((f) => `/uploads/${f.filename}`);

  // Convert to JSON for DB
  const adharImagesJson =
    adharImageUrls.length > 0 ? JSON.stringify(adharImageUrls) : null;
  const panImagesJson =
    panImageUrls.length > 0 ? JSON.stringify(panImageUrls) : null;
  const reraImagesJson =
    reraImageUrls.length > 0 ? JSON.stringify(reraImageUrls) : null;

  // Fetch old images first
  const selectSql = `SELECT adharimage, panimage, reraimage FROM projectpartner WHERE id = ?`;
  db.query(selectSql, [partnerid], (selectErr, rows) => {
    if (selectErr) {
      console.error("Error fetching old images:", selectErr);
      return res
        .status(500)
        .json({ message: "Error fetching old images", error: selectErr });
    }

    const oldData = rows[0] || {};

    // Utility: delete old files
    const deleteOldFiles = (oldImagesJson) => {
      try {
        const oldImages = JSON.parse(oldImagesJson || "[]");
        oldImages.forEach((imgPath) => {
          const fullPath = path.join(process.cwd(), imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        });
      } catch (err) {
        console.error("Error deleting old files:", err);
      }
    };

    // Delete old images only if new ones are uploaded
    if (adharImagesJson) deleteOldFiles(oldData?.adharimage);
    if (panImagesJson) deleteOldFiles(oldData?.panimage);
    if (reraImagesJson) deleteOldFiles(oldData?.reraimage);

    // Build Update Query
    let updateSql = `
      UPDATE projectpartner 
      SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, 
          state = ?, city = ?, pincode = ?, experience = ?, adharno = ?, 
          panno = ?, rerano = ?, bankname = ?, accountholdername = ?, 
          accountnumber = ?, ifsc = ?, updated_at = ?
    `;

    const updateValues = [
      fullname,
      contact,
      email.toLowerCase(),
      intrest,
      address,
      state,
      city,
      pincode,
      experience,
      adharno,
      panno,
      rerano,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
      currentdate,
    ];

    // ---------- UPDATE IMAGE COLUMNS ----------
    if (adharImagesJson) {
      updateSql += `, adharimage = ?`;
      updateValues.push(adharImagesJson);
    }

    if (panImagesJson) {
      updateSql += `, panimage = ?`;
      updateValues.push(panImagesJson);
    }

    if (reraImagesJson) {
      updateSql += `, reraimage = ?`;
      updateValues.push(reraImagesJson);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(partnerid);

    db.query(updateSql, updateValues, (updateErr) => {
      if (updateErr) {
        console.error("Error updating project Partner:", updateErr);
        return res
          .status(500)
          .json({ message: "Database error during update", error: updateErr });
      }

      res.status(200).json({ message: "Project Partner updated successfully" });
    });
  });
};

export const updateBusinessDetails = (req, res) => {
  const partnerid = parseInt(req.params.id);
  if (isNaN(partnerid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    whatsappNumber,
    businessAddress,
    businessState,
    businessCity,
    businessPincode,
  } = req.body;

  // Validation
  if (
    !whatsappNumber ||
    !businessAddress ||
    !businessState ||
    !businessCity ||
    !businessPincode
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Uploaded image (optional)
  const businessLogo = req.file || null;
  const businessLogoPath = businessLogo
    ? `/uploads/${businessLogo.filename}`
    : null;

  // Fetch Old Image First
  const selectSql = `SELECT businessLogo FROM projectpartner WHERE id = ?`;

  db.query(selectSql, [partnerid], (selectErr, rows) => {
    if (selectErr) {
      return res.status(500).json({
        message: "Error fetching old image",
        error: selectErr,
      });
    }

    const oldLogoPath = rows[0]?.businessLogo;

    // Delete old logo (only if new one uploaded)
    if (businessLogoPath && oldLogoPath) {
      const fullPath = path.join(process.cwd(), oldLogoPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    // Build Update Query
    let updateSql = `
      UPDATE projectpartner 
      SET whatsappNumber = ?, businessAddress = ?, 
          businessState = ?, businessCity = ?, 
          businessPincode = ?, updated_at = ?
    `;

    const updateValues = [
      whatsappNumber,
      businessAddress,
      businessState,
      businessCity,
      businessPincode,
      currentdate,
    ];

    // If new logo uploaded, update it
    if (businessLogoPath) {
      updateSql += `, businessLogo = ? `;
      updateValues.push(businessLogoPath);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(partnerid);

    // Execute Update Query
    db.query(updateSql, updateValues, (updateErr) => {
      if (updateErr) {
        return res.status(500).json({
          message: "Database error during update",
          error: updateErr,
        });
      }

      res.status(200).json({
        message: "Business Details updated successfully",
      });
    });
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query("SELECT * FROM projectpartner WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Project Partner not found" });
    }

    db.query("DELETE FROM projectpartner WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Project Partner deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query("SELECT * FROM projectpartner WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE projectpartner SET status = ? WHERE id = ?",
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
          .json({ message: "Project Partner status change successfully" });
      }
    );
  });
};

// Update Payment ID and Send Email
export const updatePaymentId = async (req, res) => {
  try {
    const partnerid = req.params.id;
    if (!partnerid) {
      return res.status(400).json({ message: "Invalid Partner ID" });
    }

    const { amount, paymentid } = req.body;
    if (!amount || !paymentid) {
      return res
        .status(400)
        .json({ message: "Amount and Payment ID are required" });
    }

    const isValid = await verifyRazorpayPayment(paymentid, amount);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid Payment ID" });
    }

    // Get partner details
    db.query(
      "SELECT * FROM projectpartner WHERE id = ?",
      [partnerid],
      async (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Partner not found" });
        }

        const email = result[0].email;

        const extractNameFromEmail = (email) => {
          if (!email) return "";
          const namePart = email.split("@")[0];
          const lettersOnly = namePart.match(/[a-zA-Z]+/);
          if (!lettersOnly) return "";
          const name = lettersOnly[0].toLowerCase();
          return name.charAt(0).toUpperCase() + name.slice(1);
        };

        const username = extractNameFromEmail(email);

        const generatePassword = () => {
          const chars =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
          let password = "";
          for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return password;
        };

        const password = generatePassword();
        let hashedPassword;

        try {
          hashedPassword = await bcrypt.hash(password, 10);
        } catch (hashErr) {
          console.error("Error hashing password:", hashErr);
          return res.status(500).json({ message: "Failed to hash password" });
        }

        const updateSql = `
          UPDATE projectpartner 
          SET amount = ?, paymentid = ?, username = ?, password = ?, paymentstatus = "Success", loginstatus = "Active" 
          WHERE id = ?
        `;
        const updateValues = [
          amount,
          paymentid,
          username,
          hashedPassword,
          partnerid,
        ];

        db.query(updateSql, updateValues, async (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Error updating Payment ID:", updateErr);
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });
          }

          try {
            await sendEmail(
              email,
              username,
              password,
              "Project Partner",
              "https://projectpartner.reparv.in"
            );
            return res.status(200).json({
              message: "Payment ID updated and email sent successfully.",
              partner: {
                partnerid,
                username,
                email,
              },
            });
          } catch (emailError) {
            console.error("Error sending email:", emailError);
            return res.status(500).json({
              message: "Payment ID updated but failed to send email.",
              partner: {
                partnerid,
                username,
                email,
              },
            });
          }
        });
      }
    );
  } catch (err) {
    console.error("Unexpected server error:", err);
    return res
      .status(500)
      .json({ message: "Unexpected server error", error: err });
  }
};

export const fetchFollowUpList = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  const sql =
    "SELECT * FROM partnerFollowup WHERE partnerId = ? AND role = ? ORDER BY created_at DESC";
  db.query(sql, [Id, "Project Partner"], (err, result) => {
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

export const addFollowUp = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  const { followUp, followUpText } = req.body;
  if (!followUp || !followUpText) {
    return res.status(400).json({ message: "Follow Up message is required." });
  }

  // Check if partner exists
  db.query("SELECT * FROM projectpartner WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Partner not found." });
    }

    // Insert follow-up
    db.query(
      "INSERT INTO partnerFollowup (partnerId, role, followUp, followUpText, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        Id,
        "Project Partner",
        followUp.trim(),
        followUpText.trim(),
        currentdate,
        currentdate,
      ],
      (insertErr, insertResult) => {
        if (insertErr) {
          console.error("Error adding follow-up:", insertErr);
          return res
            .status(500)
            .json({ message: "Database error", error: insertErr });
        }

        // Update paymentstatus
        db.query(
          "UPDATE projectpartner SET paymentstatus = 'Follow Up', updated_at = ? WHERE id = ?",
          [currentdate, Id],
          (updateErr, updateResult) => {
            if (updateErr) {
              console.error("Error updating paymentstatus:", updateErr);
              return res
                .status(500)
                .json({ message: "Database error", error: updateErr });
            }

            return res.status(200).json({
              message:
                "Partner follow-up added and payment status updated to 'Follow Up'.",
            });
          }
        );
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

    db.query(
      "SELECT * FROM projectpartner WHERE id = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        if (result.length === 0) {
          return res.status(404).json({ message: "Projet Partner not found" });
        }

        let loginstatus = "Active";
        const email = result[0].email;

        db.query(
          "UPDATE projectpartner SET loginstatus = ?, username = ?, password = ? WHERE id = ?",
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
              "Project Partner",
              "https://projectpartner.reparv.in"
            )
              .then(() => {
                res.status(200).json({
                  message:
                    "Project Partner login assigned successfully and email sent.",
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
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
