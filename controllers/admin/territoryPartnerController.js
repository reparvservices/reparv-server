import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import fs from "fs";
import path from "path";
import sendProjectPartnerChangeEmail from "../../utils/sendProjectPartnerChangeEmail.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;
export const getAll = (req, res) => {
  const partnerLister = req.params.partnerlister;

  if (!partnerLister) {
    return res.status(401).json({ message: "Partner Lister Not Selected" });
  }

  let sql;

  if (partnerLister === "Project Partner") {
    sql = `
       SELECT 
         tp.*, 
         pf.followUp, 
         pf.created_at AS followUpDate,
         pp.fullname AS projectPartnerName,
         pp.contact AS projectPartnerContact
       FROM territorypartner tp
       LEFT JOIN (
         SELECT p1.*
         FROM partnerFollowup p1
         INNER JOIN (
           SELECT partnerId, MAX(created_at) AS latest
           FROM partnerFollowup
           WHERE role = 'Territory Partner'
           GROUP BY partnerId
         ) p2 
         ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
         WHERE p1.role = 'Territory Partner'
       ) pf 
       ON tp.id = pf.partnerId
       LEFT JOIN projectpartner pp 
       ON tp.projectpartnerid = pp.id
       WHERE tp.projectpartnerid IS NOT NULL 
         AND tp.projectpartnerid != ''
       ORDER BY tp.created_at DESC;
     `;
  } else if (partnerLister === "Reparv") {
    sql = `
      SELECT territorypartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM territorypartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Territory Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Territory Partner'
      ) pf ON territorypartner.id = pf.partnerId
      WHERE 
      (
        territorypartner.partneradder IS NULL 
        OR territorypartner.partneradder = ''
      )
      AND
      (
        territorypartner.projectpartnerid IS NULL
        OR territorypartner.projectpartnerid = ''
      )
      ORDER BY territorypartner.created_at DESC;
    `;
  } else {
    sql = `
      SELECT territorypartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM territorypartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Territory Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Territory Partner'
      ) pf ON territorypartner.id = pf.partnerId
        OR territorypartner.partneradder = ''
      ORDER BY territorypartner.created_at DESC;
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
    "SELECT * FROM territorypartner WHERE status = 'Active' ORDER BY id DESC";
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
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }
  const sql = `SELECT territorypartner.*,
               projectpartner.fullname AS projectPartnerName, 
               projectpartner.contact AS projectPartnerContact
               FROM territorypartner
               LEFT JOIN projectpartner ON territorypartner.projectpartnerid = projectpartner.id
               WHERE territorypartner.id = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Territory Partner not found" });
    }
    res.json(result[0]);
  });
};

// **Add New Territory Partner **
// export const add = (req, res) => {
//   const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

//   const {
//     fullname,
//     contact,
//     email,
//     intrest,
//     refrence,
//     address,
//     state,
//     city,
//     projectpartnerid,
//     pincode,
//     experience,
//     adharno,
//     panno,
//     rerano,
//     bankname,
//     accountholdername,
//     accountnumber,
//     ifsc,
//   } = req.body;

//   // Validate required fields
//   if (!fullname || !contact || !email || !intrest) {
//     return res.status(400).json({ message: "All Fields required!" });
//   }

//   // Generate referral code
//   const createReferralCode = () => {
//     const chars =
//       "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
//     let code = "";
//     for (let i = 0; i < 6; i++) {
//       code += chars.charAt(Math.floor(Math.random() * chars.length));
//     }
//     return "REF-" + code; // Total 10 characters
//   };

//   const generateUniqueReferralCode = (callback) => {
//     const code = createReferralCode();
//     db.query(
//       "SELECT referral FROM territorypartner WHERE referral = ?",
//       [code],
//       (err, results) => {
//         if (err) return callback(err, null);
//         if (results.length > 0) return generateUniqueReferralCode(callback);
//         return callback(null, code);
//       }
//     );
//   };

//   // Handle uploaded files safely
//   const adharImageFile = req.files?.["adharImage"]?.[0];
//   const panImageFile = req.files?.["panImage"]?.[0];
//   const reraImageFile = req.files?.["reraImage"]?.[0];

//   const adharImageUrl = adharImageFile
//     ? `/uploads/${adharImageFile.filename}`
//     : null;
//   const panImageUrl = panImageFile ? `/uploads/${panImageFile.filename}` : null;
//   const reraImageUrl = reraImageFile
//     ? `/uploads/${reraImageFile.filename}`
//     : null;

//   // Check for duplicates
//   const checkSql = `SELECT * FROM territorypartner WHERE contact = ? OR email = ?`;

//   db.query(checkSql, [contact, email.toLowerCase(),], (checkErr, checkResult) => {
//     if (checkErr) {
//       console.error("Error checking existing Territory Partner:", checkErr);
//       return res.status(500).json({
//         message: "Database error during validation",
//         error: checkErr,
//       });
//     }

//     if (checkResult.length > 0) {
//       return res.status(409).json({
//         message: "Territory Partner already exists with this Contact or Email.",
//       });
//     }

//     // Generate unique referral code before inserting
//     generateUniqueReferralCode((referralErr, referralCode) => {
//       if (referralErr) {
//         console.error("Error generating referral:", referralErr);
//         return res.status(500).json({
//           message: "Referral code generation failed",
//           error: referralErr,
//         });
//       }

//       // Insert new territory partner
//       const insertSql = `
//         INSERT INTO territorypartner 
//         (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, adharno, panno, rerano, 
//          bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, updated_at, created_at) 
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
//       `;

//       db.query(
//         insertSql,
//         [
//           projectpartnerid || null,
//           fullname,
//           contact,
//           email.toLowerCase(),
//           intrest,
//           refrence,
//           referralCode,
//           address,
//           state,
//           city,
//           pincode,
//           experience,
//           adharno,
//           panno,
//           rerano,
//           bankname,
//           accountholdername,
//           accountnumber,
//           ifsc,
//           adharImageUrl,
//           panImageUrl,
//           reraImageUrl,
//           currentdate,
//           currentdate,
//         ],
//         (insertErr, insertResult) => {
//           if (insertErr) {
//             console.error("Error inserting Territory Partner:", insertErr);
//             return res.status(500).json({
//               message: "Database error during insertion",
//               error: insertErr,
//             });
//           }

//           // Insert follow-up for the new Territory Partner
//           const followupSql = `
//             INSERT INTO partnerFollowup 
//             (partnerId, role, followUp, followUpText, created_at, updated_at)
//             VALUES (?, ?, ?, ?, ?, ?)
//           `;

//           db.query(
//             followupSql,
//             [
//               insertResult.insertId,
//               "Territory Partner",
//               "New",
//               "Newly Added Territory Partner",
//               currentdate,
//               currentdate,
//             ],
//             (followupErr) => {
//               if (followupErr) {
//                 console.error("Error adding follow-up:", followupErr);
//                 return res.status(500).json({
//                   message: "Follow-up insert failed",
//                   error: followupErr,
//                 });
//               }

//               return res.status(201).json({
//                 message: "Territory Partner added successfully",
//                 Id: insertResult.insertId,
//               });
//             }
//           );
//         }
//       );
//     });
//   });
// };

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

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
    projectpartnerid,
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
    return res.status(400).json({ message: "All Fields required!" });
  }

  email = email.toLowerCase();

  if (!username || username.trim() === "") {
    username = null;
  }

  /* ---------- REFERRAL CODE ---------- */
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
      "SELECT referral FROM territorypartner WHERE referral = ?",
      [code],
      (err, results) => {
        if (err) return callback(err, null);
        if (results.length > 0) return generateUniqueReferralCode(callback);
        return callback(null, code);
      }
    );
  };

  /* ---------- DUPLICATE CHECK ---------- */
  const checkSql = `
    SELECT contact, email, username 
    FROM territorypartner 
    WHERE contact = ? OR email = ? OR username = ?
  `;

  db.query(checkSql, [contact, email, username], async (checkErr, rows) => {
    if (checkErr) {
      return res.status(500).json({
        message: "Database error during validation",
        error: checkErr,
      });
    }

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

    /* ---------- S3 IMAGE UPLOAD ---------- */
    let adharImageUrl = null;
    let panImageUrl = null;
    let reraImageUrl = null;

    try {
      if (req.files?.adharImage?.[0]) {
        adharImageUrl = await uploadToS3(req.files.adharImage[0]);
      }

      if (req.files?.panImage?.[0]) {
        panImageUrl = await uploadToS3(req.files.panImage[0]);
      }

      if (req.files?.reraImage?.[0]) {
        reraImageUrl = await uploadToS3(req.files.reraImage[0]);
      }
    } catch (uploadErr) {
      return res.status(500).json({
        message: "Image upload failed",
        error: uploadErr,
      });
    }

    /* ---------- REFERRAL + LOGIN ---------- */
    generateUniqueReferralCode(async (referralErr, referralCode) => {
      if (referralErr) {
        return res.status(500).json({
          message: "Referral code generation failed",
          error: referralErr,
        });
      }

      let hashedPassword = null;
      let loginstatus = "Inactive";

      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
        loginstatus = "Active";
      }

      /* ---------- INSERT ---------- */
      const insertSql = `
        INSERT INTO territorypartner
        (projectpartnerid, fullname, contact, email, intrest, refrence, referral,
        address, state, city, pincode, experience, adharno, panno, rerano,
        bankname, accountholdername, accountnumber, ifsc,
        adharimage, panimage, reraimage,
        username, password, loginstatus,
        updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [
          projectpartnerid || null,
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
        async (insertErr, insertResult) => {
          if (insertErr) {
            return res.status(500).json({
              message: "Database error during insertion",
              error: insertErr,
            });
          }

          const partnerId = insertResult.insertId;

          /* ---------- STATUS ACTIVE ---------- */
          db.query(
            "UPDATE territorypartner SET status = 'Active' WHERE id = ?",
            [partnerId]
          );

          /* ---------- FOLLOWUP ---------- */
          const followupSql = `
            INSERT INTO partnerFollowup 
            (partnerId, role, followUp, followUpText, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.query(
            followupSql,
            [
              partnerId,
              "Territory Partner",
              "New",
              "Newly Added Territory Partner",
              currentdate,
              currentdate,
            ],
            async (followupErr) => {
              if (followupErr) {
                return res.status(500).json({
                  message: "Follow-up insert failed",
                  error: followupErr,
                });
              }

              if (password) {
                await sendEmail(
                  email,
                  username,
                  password,
                  "Territory Partner",
                  "https://territory.reparv.in"
                );
              }

              return res.status(201).json({
                message: password
                  ? "Territory Partner added & login assigned"
                  : "Territory Partner added successfully",
                Id: partnerId,
              });
            }
          );
        }
      );
    });
  });
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

  /* ---------- FETCH OLD DATA ---------- */
  db.query(
    "SELECT adharimage, panimage, reraimage FROM territorypartner WHERE id = ?",
    [partnerid],
    async (selectErr, results) => {
      if (selectErr) {
        return res.status(500).json({
          message: "Database error while fetching old data",
          error: selectErr,
        });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Partner not found" });
      }

      const oldData = results[0];

      /* ---------- S3 UPLOAD (IF NEW FILES) ---------- */
      let adharImageUrl = oldData.adharimage;
      let panImageUrl = oldData.panimage;
      let reraImageUrl = oldData.reraimage;

      try {
        if (req.files?.adharImage?.[0]) {
          adharImageUrl = await uploadToS3(req.files.adharImage[0]);
        }

        if (req.files?.panImage?.[0]) {
          panImageUrl = await uploadToS3(req.files.panImage[0]);
        }

        if (req.files?.reraImage?.[0]) {
          reraImageUrl = await uploadToS3(req.files.reraImage[0]);
        }
      } catch (uploadErr) {
        return res.status(500).json({
          message: "Image upload failed",
          error: uploadErr,
        });
      }

      /* ---------- UPDATE QUERY ---------- */
      const updateSql = `
        UPDATE territorypartner SET
          fullname = ?,
          contact = ?,
          email = ?,
          intrest = ?,
          address = ?,
          state = ?,
          city = ?,
          pincode = ?,
          experience = ?,
          adharno = ?,
          panno = ?,
          rerano = ?,
          bankname = ?,
          accountholdername = ?,
          accountnumber = ?,
          ifsc = ?,
          adharimage = ?,
          panimage = ?,
          reraimage = ?,
          updated_at = ?
        WHERE id = ?
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
        adharImageUrl,
        panImageUrl,
        reraImageUrl,
        currentdate,
        partnerid,
      ];

      /* ---------- EXECUTE UPDATE ---------- */
      db.query(updateSql, updateValues, (updateErr) => {
        if (updateErr) {
          return res.status(500).json({
            message: "Database error during update",
            error: updateErr,
          });
        }

        return res
          .status(200)
          .json({ message: "Territory Partner updated successfully" });
      });
    }
  );
};


// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query(
    "SELECT * FROM territorypartner WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Territory Partner not found" });
      }

      db.query("DELETE FROM territorypartner WHERE id = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: "Territory Partner deleted successfully" });
      });
    }
  );
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query(
    "SELECT * FROM territorypartner WHERE id = ?",
    [Id],
    (err, result) => {
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
        "UPDATE territorypartner SET status = ? WHERE id = ?",
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
            .json({ message: "Territory Partner status change successfully" });
        }
      );
    }
  );
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
      return res.status(400).json({ message: "Invalid Payment Id" });
    }

    // Get partner details
    db.query(
      "SELECT * FROM territorypartner WHERE id = ?",
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
          UPDATE territorypartner
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
              "Territory Partner",
              "https://territory.reparv.in"
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
  db.query(sql, [Id, "Territory Partner"], (err, result) => {
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

  // Check if territory partner exists
  db.query(
    "SELECT * FROM territorypartner WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res
          .status(404)
          .json({ message: "Territory partner not found." });
      }

      // Insert follow-up
      db.query(
        "INSERT INTO partnerFollowup (partnerId, role, followUp, followUpText, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          Id,
          "Territory Partner",
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
            "UPDATE territorypartner SET paymentstatus = 'Follow Up', updated_at = ? WHERE id = ?",
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
                  "Territory partner follow-up added and payment status updated to 'Follow Up'.",
              });
            }
          );
        }
      );
    }
  );
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
      "SELECT * FROM territorypartner WHERE id = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        if (result.length === 0) {
          return res
            .status(404)
            .json({ message: "Territory Partner not found" });
        }

        let loginstatus = "Active";
        const email = result[0].email;

        db.query(
          "UPDATE territorypartner SET loginstatus = ?, username = ?, password = ? WHERE id = ?",
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
              "Territory Partner",
              "https://territory.reparv.in"
            )
              .then(() => {
                res.status(200).json({
                  message:
                    "Territory Partner login assigned successfully and email sent.",
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

// Fetch Project Partner List
export const getProjectPartnerList = (req, res) => {
  const Id = req.params.id;

  // Step 1: Get details
  const sql = "SELECT * FROM territorypartner WHERE id = ?";
  db.query(sql, [Id], (err, results) => {
    if (err) {
      console.error("Error fetching Partner:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const partner = results[0];

    const { city } = partner;

    // Step 2: Get matching project partner
    const projectPartnerSql = `
      SELECT * FROM projectpartner
      ORDER BY created_at DESC
    `;

    db.query(projectPartnerSql, (err, projectPartnerResults) => {
      if (err) {
        console.error("Error fetching project Partner:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(projectPartnerResults);
    });
  });
};

// ** Assign Project Partner to Territory Partner & Send Email **
export const assignProjectPartner = async (req, res) => {
  try {
    const Id = parseInt(req.params.id);
    if (isNaN(Id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const { projectPartnerId } = req.body;
    if (isNaN(projectPartnerId)) {
      return res.status(400).json({ message: "Invalid Project Partner ID" });
    }

    // 1. Fetch Territory Partner details
    db.query(
      "SELECT * FROM territorypartner WHERE id = ?",
      [Id],
      (tpErr, tpResult) => {
        if (tpErr) {
          console.error("Database error:", tpErr);
          return res
            .status(500)
            .json({ message: "Database error", error: tpErr });
        }

        if (tpResult.length === 0) {
          return res
            .status(404)
            .json({ message: "Territory Partner not found" });
        }

        const territoryPartner = tpResult[0];

        // 2. Fetch Project Partner details
        db.query(
          "SELECT * FROM projectpartner WHERE id = ?",
          [projectPartnerId],
          async (ppErr, ppResult) => {
            if (ppErr) {
              console.error("Database error:", ppErr);
              return res
                .status(500)
                .json({ message: "Database error", error: ppErr });
            }

            if (ppResult.length === 0) {
              return res
                .status(404)
                .json({ message: "Project Partner not found" });
            }

            const projectPartner = ppResult[0];

            // 3. Update territory partner
            db.query(
              "UPDATE territorypartner SET changeProjectPartnerReason = NULL, projectpartnerid = ? WHERE id = ?",
              [projectPartnerId, Id],
              async (updateErr) => {
                if (updateErr) {
                  console.error("Error updating territory partner:", updateErr);
                  return res
                    .status(500)
                    .json({ message: "Database error", error: updateErr });
                }

                // 4. Send Email to Territory Partner
                try {
                  await sendProjectPartnerChangeEmail(
                    territoryPartner.email,
                    projectPartner.fullname,
                    projectPartner.contact,
                    "Territory Partner",
                    "https://territory.reparv.in"
                  );
                } catch (emailErr) {
                  console.error("Email sending failed:", emailErr);
                }

                return res.status(200).json({
                  message: "Project Partner assigned & email sent successfully",
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("Error assigning project partner:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
