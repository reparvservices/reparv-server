import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import fs from "fs";
import path from "path";
import sendProjectPartnerChangeEmail from "../../utils/sendProjectPartnerChangeEmail.js";

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
        s.*, 
        pf.followUp, 
        pf.created_at AS followUpDate, 
        pp.fullname AS projectPartnerName, 
        pp.contact AS projectPartnerContact
      FROM salespersons s
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Sales Person'
          GROUP BY partnerId
        ) p2 
        ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Sales Person'
      ) pf 
      ON s.salespersonsid = pf.partnerId
      LEFT JOIN projectpartner pp 
      ON s.projectpartnerid = pp.id
      WHERE s.projectpartnerid IS NOT NULL 
        AND s.projectpartnerid != ''
      ORDER BY s.created_at DESC;
    `;
  } else if (partnerLister === "Reparv") {
    sql = `
      SELECT salespersons.*, pf.followUp, pf.created_at AS followUpDate
      FROM salespersons
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Sales Person'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Sales Person'
      ) pf ON salespersons.salespersonsid = pf.partnerId
      WHERE 
      (
        salespersons.partneradder IS NULL OR salespersons.partneradder = ''
      )
      AND
      (
        salespersons.projectpartnerid IS NULL OR salespersons.projectpartnerid = ''
      )
      ORDER BY salespersons.created_at DESC;
    `;
  } else {
    sql = `
      SELECT salespersons.*, pf.followUp, pf.created_at AS followUpDate
      FROM salespersons
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Sales Person'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Sales Person'
      ) pf ON salespersons.salespersonsid = pf.partnerId
        OR salespersons.partneradder = ''
      ORDER BY salespersons.created_at DESC;
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

// **Fetch All Active**
export const getAllActive = (req, res) => {
  const sql =
    "SELECT * FROM salespersons WHERE status = 'Active' ORDER BY salespersonsid DESC";
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
  const sql = `SELECT salespersons.*,
               projectpartner.fullname AS projectPartnerName, 
               projectpartner.contact AS projectPartnerContact
               FROM salespersons
               LEFT JOIN projectpartner ON salespersons.projectpartnerid = projectpartner.id 
               WHERE salespersons.salespersonsid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Sales person not found" });
    }
    res.json(result[0]);
  });
};

// **Add New Sales Person **
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
//     rerano,
//     adharno,
//     panno,
//     bankname,
//     accountholdername,
//     accountnumber,
//     ifsc,
//   } = req.body;

//   // Validate required fields
//   if (!fullname || !contact || !email || !intrest) {
//     return res.status(400).json({
//       message: "FullName, Contact and Email Required!",
//     });
//   }

//   // Function to generate referral code
//   const createReferralCode = () => {
//     const chars =
//       "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
//     let code = "";
//     for (let i = 0; i < 6; i++) {
//       code += chars.charAt(Math.floor(Math.random() * chars.length));
//     }
//     return "REF-" + code; // Total 10 characters
//   };

//   // Check if referral is unique
//   const generateUniqueReferralCode = (callback) => {
//     const code = createReferralCode();
//     db.query(
//       "SELECT referral FROM salespersons WHERE referral = ?",
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
//   const checkSql = `SELECT * FROM salespersons WHERE contact = ? OR email = ?`;

//   db.query(checkSql, [contact, email.toLowerCase(),], (checkErr, checkResult) => {
//     if (checkErr) {
//       console.error("Error checking existing salespersons:", checkErr);
//       return res.status(500).json({
//         message: "Database error during validation",
//         error: checkErr,
//       });
//     }

//     if (checkResult.length > 0) {
//       return res.status(409).json({
//         message: "Sales person already exists with this Contact or Email Id.",
//       });
//     }

//     // Generate unique referral code
//     generateUniqueReferralCode((referralErr, referralCode) => {
//       if (referralErr) {
//         console.error("Referral code generation failed:", referralErr);
//         return res.status(500).json({
//           message: "Error generating referral code",
//           error: referralErr,
//         });
//       }

//       // Insert new salespersons
//       const insertSql = `
//         INSERT INTO salespersons 
//         (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, rerano, adharno, panno, 
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
//           rerano,
//           adharno,
//           panno,
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
//             console.error("Error inserting Sales Person:", insertErr);
//             return res.status(500).json({
//               message: "Database error",
//               error: insertErr,
//             });
//           }

//           // Insert default follow-up entry
//           const followupSql = `
//             INSERT INTO partnerFollowup 
//             (partnerId, role, followUp, followUpText, created_at, updated_at) 
//             VALUES (?, ?, ?, ?, ?, ?)
//           `;

//           db.query(
//             followupSql,
//             [
//               insertResult.insertId,
//               "Sales Person",
//               "New",
//               "Newly Added Sales Person",
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
//                 message: "Sales Person added successfully",
//                 Id: insertResult.insertId,
//               });
//             }
//           );
//         }
//       );
//     });
//   });
// };

export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    fullname,
    contact,
    email,
    username,
    password,
    intrest,
    refrence,
    address,
    state,
    city,
    projectpartnerid,
    pincode,
    experience,
    rerano,
    adharno,
    panno,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({
      message: "FullName, Contact and Email Required!",
    });
  }
  //  Convert email to lowercase
  email = email?.toLowerCase();

  // Referral generator (unchanged)
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
      "SELECT referral FROM salespersons WHERE referral = ?",
      [code],
      (err, results) => {
        if (err) return callback(err, null);
        if (results.length > 0) return generateUniqueReferralCode(callback);
        return callback(null, code);
      }
    );
  };

  // File uploads (unchanged)
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

  const checkSql = `SELECT * FROM salespersons WHERE contact = ? OR email = ?`;

  db.query(checkSql, [contact, email], async (checkErr, checkResult) => {
    if (checkErr) {
      return res.status(500).json({
        message: "Database error during validation",
        error: checkErr,
      });
    }

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "Sales person already exists with this Contact or Email Id.",
      });
    }

    generateUniqueReferralCode(async (referralErr, referralCode) => {
      if (referralErr) {
        return res.status(500).json({
          message: "Error generating referral code",
          error: referralErr,
        });
      }

      // Password (ONLY WHEN password provided)

      let hashedPassword = null;

      let loginstatus = null;

      if (password) {
        hashedPassword = await bcrypt.hash(password, saltRounds);

        loginstatus = "Active";
      }

      const insertSql = `
        INSERT INTO salespersons 
        (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, rerano, adharno, panno,
         bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, username, password, loginstatus, updated_at, created_at) 
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
          rerano,
          adharno,
          panno,
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
          if (insertErr) {
            return res.status(500).json({
              message: "Database error",
              error: insertErr,
            });
          }

          const newId = insertResult.insertId;

          // --------------------------------------------------
          // 🆕 NEW: Make status ACTIVE after creating record
          // --------------------------------------------------
          db.query(
            "UPDATE salespersons SET status = 'Active' WHERE salespersonsid = ?",
            [newId],
            (updateErr) => {
              if (updateErr) {
                console.error("Error updating status:", updateErr);
              }
            }
          );

          // existing follow-up insert
          const followupSql = `
            INSERT INTO partnerFollowup 
            (partnerId, role, followUp, followUpText, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.query(
            followupSql,
            [
              newId,
              "Sales Person",
              "New",
              "Newly Added Sales Person",
              currentdate,
              currentdate,
            ],
            () => {
              if (password) {
                sendEmail(
                  email,
                  username,
                  password,
                  "Sales Partner",
                  "https://sales.reparv.in"
                );
              }

              return res.status(201).json({
                message: password
                  ? "Sales Person added & login assigned"
                  : "Sales Person added successfully",
                Id: newId,
              });
            }
          );
        }
      );
    });
  });
};
export const edit = (req, res) => {
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
    rerano,
    adharno,
    panno,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  const salespersonsid = parseInt(req.params.id);
  if (isNaN(salespersonsid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Handle new uploaded files
  const adharImageFiles = req.files?.["adharImage"] || [];
  const panImageFiles = req.files?.["panImage"] || [];
  const reraImageFiles = req.files?.["reraImage"] || [];

  const adharImageUrls = adharImageFiles.map(
    (file) => `/uploads/${file.filename}`
  );
  const panImageUrls = panImageFiles.map((file) => `/uploads/${file.filename}`);
  const reraImageUrls = reraImageFiles.map(
    (file) => `/uploads/${file.filename}`
  );

  // STEP 1: Get old images
  db.query(
    "SELECT adharimage, panimage, reraimage FROM salespersons WHERE salespersonsid = ?",
    [salespersonsid],
    (selectErr, results) => {
      if (selectErr) {
        console.error("Error fetching old images:", selectErr);
        return res
          .status(500)
          .json({ message: "Database error while fetching old images" });
      }

      const oldData = results[0];

      // Utility: delete old images
      const deleteOldFiles = (oldImagesJson) => {
        try {
          const oldImages = JSON.parse(oldImagesJson || "[]");
          oldImages.forEach((url) => {
            const filePath = path.join(process.cwd(), "public", url);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        } catch (err) {
          console.error("Error deleting old files:", err);
        }
      };

      // Prepare SQL
      let updateSql = `UPDATE salespersons 
        SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, 
        pincode = ?, experience = ?, rerano = ?, adharno = ?, panno = ?, bankname = ?, 
        accountholdername = ?, accountnumber = ?, ifsc = ?, updated_at = ?`;
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
        rerano,
        adharno,
        panno,
        bankname,
        accountholdername,
        accountnumber,
        ifsc,
        currentdate,
      ];

      // Aadhaar
      if (adharImageUrls.length > 0) {
        updateSql += `, adharimage = ?`;
        updateValues.push(JSON.stringify(adharImageUrls));
        deleteOldFiles(oldData?.adharimage);
      }

      // PAN
      if (panImageUrls.length > 0) {
        updateSql += `, panimage = ?`;
        updateValues.push(JSON.stringify(panImageUrls));
        deleteOldFiles(oldData?.panimage);
      }

      // RERA
      if (reraImageUrls.length > 0) {
        updateSql += `, reraimage = ?`;
        updateValues.push(JSON.stringify(reraImageUrls));
        deleteOldFiles(oldData?.reraimage);
      }

      updateSql += ` WHERE salespersonsid = ?`;
      updateValues.push(salespersonsid);

      // STEP 2: Update DB
      db.query(updateSql, updateValues, (updateErr) => {
        if (updateErr) {
          console.error("Error updating salespersons:", updateErr);
          return res.status(500).json({
            message: "Database error during update",
            error: updateErr,
          });
        }

        res.status(200).json({ message: "Sales person updated successfully" });
      });
    }
  );
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Sales person ID" });
  }

  db.query(
    "SELECT * FROM salespersons WHERE salespersonsid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Sales person not found" });
      }

      db.query(
        "DELETE FROM salespersons WHERE salespersonsid = ?",
        [Id],
        (err) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Sales person deleted successfully" });
        }
      );
    }
  );
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Sales person ID" });
  }

  db.query(
    "SELECT * FROM salespersons WHERE salespersonsid = ?",
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
        "UPDATE salespersons SET status = ? WHERE salespersonsid = ?",
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
            .json({ message: "Sales person status change successfully" });
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
      return res.status(400).json({ message: "Invalid Payment ID" });
    }

    // Get partner details
    db.query(
      "SELECT * FROM salespersons WHERE salespersonsid = ?",
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
          UPDATE salespersons
          SET amount = ?, paymentid = ?, username = ?, password = ?, paymentstatus = "Success", loginstatus = "Active" 
          WHERE salespersonsid = ?
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
              "Sales Partner",
              "https://sales.reparv.in"
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
  db.query(sql, [Id, "Sales Person"], (err, result) => {
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
    return res.status(400).json({ message: "Follow up message is required." });
  }

  // Check if salespersons exists
  db.query(
    "SELECT * FROM salespersons WHERE salespersonsid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error (fetching salesperson):", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "salesperson not found" });
      }

      // Insert follow-up entry
      db.query(
        "INSERT INTO partnerFollowup (partnerId, role, followUp, followUpText, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          Id,
          "Sales Person",
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

          // Update payment status after follow-up is added
          db.query(
            "UPDATE salespersons SET paymentstatus = 'Follow Up', updated_at = ? WHERE salespersonsid = ?",
            [currentdate, Id],
            (updateErr, updateResult) => {
              if (updateErr) {
                console.error("Error updating payment status:", updateErr);
                return res
                  .status(500)
                  .json({ message: "Database error", error: updateErr });
              }

              return res
                .status(200)
                .json({ message: "Partner follow-up added successfully." });
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
      return res.status(400).json({ message: "Invalid ID" });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Fetch salespersons details first
    db.query(
      "SELECT * FROM salespersons WHERE salespersonsid = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Sales Person not found" });
        }

        // Store original email before updating the database
        const email = result[0].email;
        let loginstatus = "Active";

        // Update salespersons details
        db.query(
          "UPDATE salespersons SET loginstatus = ?, username = ?, password = ? WHERE salespersonsid = ?",
          [loginstatus, username, hashedPassword, Id],
          (updateErr, updateResult) => {
            if (updateErr) {
              console.error("Error updating salespersons:", updateErr);
              return res
                .status(500)
                .json({ message: "Database error", error: updateErr });
            }

            // Send email after successful update
            sendEmail(
              email,
              username,
              password,
              "Sales Partner",
              "https://sales.reparv.in"
            );

            res
              .status(200)
              .json({ message: "Sales Person login assigned successfully" });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error assigning login:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

// Fetch Project Partner List
export const getProjectPartnerList = (req, res) => {
  const Id = req.params.id;

  // Step 1: Get details
  const sql = "SELECT * FROM salespersons WHERE salespersonsid = ?";
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

// ** Assign Project Partner & Send Email **
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

    // 1. Fetch Sales Partner Details
    db.query(
      "SELECT * FROM salespersons WHERE salespersonsid = ?",
      [Id],
      (salesErr, salesResult) => {
        if (salesErr) {
          console.error("Database error:", salesErr);
          return res.status(500).json({ message: "Database error", error: salesErr });
        }

        if (salesResult.length === 0) {
          return res.status(404).json({ message: "Sales Person not found" });
        }

        const salesPerson = salesResult[0];

        // 2. Fetch Project Partner Details
        db.query(
          "SELECT * FROM projectpartner WHERE id = ?",
          [projectPartnerId],
          async (ppErr, ppResult) => {
            if (ppErr) {
              console.error("Database error:", ppErr);
              return res.status(500).json({ message: "Database error", error: ppErr });
            }

            if (ppResult.length === 0) {
              return res.status(404).json({ message: "Project Partner not found" });
            }

            const projectPartner = ppResult[0];

            // 3. Update Sales Person
            db.query(
              "UPDATE salespersons SET changeProjectPartnerReason = NULL, projectpartnerid = ? WHERE salespersonsid = ?",
              [projectPartnerId, Id],
              async (updateErr) => {
                if (updateErr) {
                  console.error("Error updating salespersons:", updateErr);
                  return res.status(500).json({ message: "Database error", error: updateErr });
                }

                // 4. Send Email to Sales Person
                try {
                  await sendProjectPartnerChangeEmail(
                    salesPerson.email,                            
                    projectPartner.fullname,                   
                    projectPartner.contact,                   
                    "Sales Partner",                    
                    "https://sales.reparv.in"                
                  );
                } catch (err) {
                  console.error("Email sending failed:", err);
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

