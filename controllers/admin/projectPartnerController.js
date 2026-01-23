import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

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

export const add = async (req, res) => {
  let currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  let {
    fullname,
    contact,
    email,
    username,
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
    password,
  } = req.body;

  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({ message: "All fields are required!" });
  }

  email = email?.toLowerCase();
  if (!username || username.trim() === "") username = null;

  // Referral code generator
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

  try {
    //  Upload files to S3 if provided
    const adharImageFiles = req.files?.["adharImage"] || [];
    const panImageFiles = req.files?.["panImage"] || [];
    const reraImageFiles = req.files?.["reraImage"] || [];

    let adharImageUrl = null;
    if (adharImageFiles.length > 0) {
      adharImageUrl = await uploadToS3(adharImageFiles[0], "documents/adhar");
    }

    let panImageUrl = null;
    if (panImageFiles.length > 0) {
      panImageUrl = await uploadToS3(panImageFiles[0], "documents/pan");
    }

    let reraImageUrl = null;
    if (reraImageFiles.length > 0) {
      reraImageUrl = await uploadToS3(reraImageFiles[0], "documents/rera");
    }

    //  Check duplicates
    const checkSql =
      "SELECT * FROM projectpartner WHERE contact = ? OR email = ? OR username = ?";
    db.query(checkSql, [contact, email, username], async (checkErr, rows) => {
      if (checkErr)
        return res.status(500).json({
          message: "Database error during validation",
          error: checkErr,
        });

      if (rows.length > 0) {
        const dup = rows[0];
        let duplicateField = "";
        if (dup.contact === contact) duplicateField = "Contact number already exists";
        else if (dup.email === email) duplicateField = "Email already exists";
        else if (dup.username === username) duplicateField = "Username already exists";

        return res.status(409).json({
          message: duplicateField,
          field: duplicateField.includes("Contact")
            ? "contact"
            : duplicateField.includes("Email")
            ? "email"
            : "username",
        });
      }

      //  Generate unique referral code
      generateUniqueReferralCode(async (referralErr, referralCode) => {
        if (referralErr)
          return res.status(500).json({
            message: "Error generating unique referral code",
            error: referralErr,
          });

        let hashedPassword = null;
        let loginstatus = "Inactive";

        if (password) {
          hashedPassword = await bcrypt.hash(password, 10);
          loginstatus = "Active";
        }

        //  Insert new partner
        const insertSql = `
          INSERT INTO projectpartner 
          (fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, adharno, panno, rerano,
           bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage,
           username, password, loginstatus, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertSql,
          [
            fullname,
            contact,
            email,
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
            username,
            hashedPassword,
            loginstatus,
            currentdate,
            currentdate,
          ],
          (insertErr, insertResult) => {
            if (insertErr)
              return res.status(500).json({
                message: "Database error during insert",
                error: insertErr,
              });

            //  Update status to Active
            db.query(
              "UPDATE projectpartner SET status = 'Active' WHERE id = ?",
              [insertResult.insertId],
              (updateErr) => {
                if (updateErr) console.error("Error updating status:", updateErr);
              }
            );

            //  Add follow-up
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
              async (followupErr) => {
                if (followupErr)
                  return res.status(500).json({
                    message: "Follow-up insert failed",
                    error: followupErr,
                  });

                // 7️⃣ Send email only if password exists
                if (password) {
                  try {
                    await sendEmail(
                      email,
                      username,
                      password,
                      "Project Partner",
                      "https://projectpartner.reparv.in"
                    );
                  } catch (err) {
                    console.error("Email send failed:", err);
                  }
                }

                return res.status(201).json({
                  message: password
                    ? "Project Partner added & login assigned"
                    : "Project Partner added successfully",
                  Id: insertResult.insertId,
                });
              }
            );
          }
        );
      });
    });
  } catch (err) {
    console.error("Error adding Project Partner:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const edit = async (req, res) => {
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

  try {
    // 1️⃣ Fetch old images from DB
    const rows = await new Promise((resolve, reject) =>
      db.query(
        "SELECT adharimage, panimage, reraimage FROM projectpartner WHERE id = ?",
        [partnerid],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Project Partner not found" });
    }

    const oldData = rows[0];

    // Make sure we parse JSON or default to empty array
    let oldAdhar = [];
    let oldPan = [];
    let oldRera = [];

    try {
      oldAdhar = oldData.adharimage ? JSON.parse(oldData.adharimage) : [];
    } catch {
      oldAdhar = oldData.adharimage ? [oldData.adharimage] : [];
    }

    try {
      oldPan = oldData.panimage ? JSON.parse(oldData.panimage) : [];
    } catch {
      oldPan = oldData.panimage ? [oldData.panimage] : [];
    }

    try {
      oldRera = oldData.reraimage ? JSON.parse(oldData.reraimage) : [];
    } catch {
      oldRera = oldData.reraimage ? [oldData.reraimage] : [];
    }

    // 2️⃣ Upload new files to S3 if provided
    const adharFile = req.files?.["adharImage"]?.[0];
    const panFile = req.files?.["panImage"]?.[0];
    const reraFile = req.files?.["reraImage"]?.[0];

    let newAdharUrls = [...oldAdhar];
    let newPanUrls = [...oldPan];
    let newReraUrls = [...oldRera];

    if (adharFile) {
      const url = await uploadToS3(adharFile, "documents/adhar");
      for (const oldUrl of oldAdhar) await deleteFromS3(oldUrl);
      newAdharUrls = [url];
    }

    if (panFile) {
      const url = await uploadToS3(panFile, "documents/pan");
      for (const oldUrl of oldPan) await deleteFromS3(oldUrl);
      newPanUrls = [url];
    }

    if (reraFile) {
      const url = await uploadToS3(reraFile, "documents/rera");
      for (const oldUrl of oldRera) await deleteFromS3(oldUrl);
      newReraUrls = [url];
    }

    // 3️⃣ Build update query
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

    if (newAdharUrls.length > 0) {
      updateSql += `, adharimage = ?`;
      updateValues.push(JSON.stringify(newAdharUrls));
    }

    if (newPanUrls.length > 0) {
      updateSql += `, panimage = ?`;
      updateValues.push(JSON.stringify(newPanUrls));
    }

    if (newReraUrls.length > 0) {
      updateSql += `, reraimage = ?`;
      updateValues.push(JSON.stringify(newReraUrls));
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(partnerid);

    await new Promise((resolve, reject) =>
      db.query(updateSql, updateValues, (err) => (err ? reject(err) : resolve()))
    );

    res.status(200).json({ message: "Project Partner updated successfully" });
  } catch (err) {
    console.error("Error updating Project Partner:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
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

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const { seoSlug, seoTitle, seoDescription, seoKeywords, twitterSite, twitterDescription } =
    req.body;
  if (!seoTitle || !seoDescription || !seoKeywords) {
    return res
      .status(401)
      .json({ message: "Seo Title and Seo Description and Seo Keywords Are Required" });
  }
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM projectpartner WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    db.query(
      "UPDATE projectpartner SET seoSlug = ?, seoTitle = ?, seoDescription = ?, seoKeywords = ?, twitterSite = ?, twitterDescription = ? WHERE id = ?",
      [seoSlug, seoTitle, seoDescription, seoKeywords, twitterSite, twitterDescription, Id],
      (err, result) => {
        if (err) {
          console.error("Error While Add Seo Details:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Seo Details Add successfully" });
      }
    );
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
