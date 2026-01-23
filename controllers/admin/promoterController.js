import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getAll = (req, res) => {
  const sql = `
      SELECT promoter.*, pf.followUp, pf.created_at AS followUpDate
      FROM promoter
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Promoter'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Promoter'
      ) pf ON promoter.id = pf.partnerId
      ORDER BY promoter.created_at DESC;
    `;

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
  const sql = "SELECT * FROM promoter WHERE status = 'Active' ORDER BY id DESC";
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
  const sql = "SELECT * FROM promoter WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Promoter not found" });
    }
    res.json(result[0]);
  });
};

// **Add New Promoter **
export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  let {
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

  email = email.toLowerCase();

  // Generate referral code
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
      "SELECT referral FROM promoter WHERE referral = ?",
      [code],
      (err, results) => {
        if (err) return callback(err, null);
        if (results.length > 0) return generateUniqueReferralCode(callback);
        return callback(null, code);
      }
    );
  };

  try {
    // 1️⃣ Check duplicate contact/email
    const checkResult = await new Promise((resolve, reject) =>
      db.query(
        "SELECT * FROM promoter WHERE contact = ? OR email = ?",
        [contact, email],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "Promoter already exists with this Contact or Email",
      });
    }

    // 2️⃣ Generate unique referral code
    generateUniqueReferralCode(async (referralErr, referralCode) => {
      if (referralErr) {
        console.error("Referral code generation failed:", referralErr);
        return res.status(500).json({
          message: "Error generating unique referral code",
          error: referralErr,
        });
      }

      // 3️⃣ Upload files to S3
      let adharImageUrl = null;
      let panImageUrl = null;
      let reraImageUrl = null;

      if (req.files?.["adharImage"]?.[0]) {
        adharImageUrl = await uploadToS3(req.files["adharImage"][0], "documents/adhar");
      }

      if (req.files?.["panImage"]?.[0]) {
        panImageUrl = await uploadToS3(req.files["panImage"][0], "documents/pan");
      }

      if (req.files?.["reraImage"]?.[0]) {
        reraImageUrl = await uploadToS3(req.files["reraImage"][0], "documents/rera");
      }

      // 4️⃣ Insert into DB
      const insertSql = `
        INSERT INTO promoter 
        (fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience,
         adharno, panno, rerano, bankname, accountholdername, accountnumber, ifsc,
         adharimage, panimage, reraimage, updated_at, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertValues = [
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
        currentdate,
        currentdate,
      ];

      const insertResult = await new Promise((resolve, reject) =>
        db.query(insertSql, insertValues, (err, result) => (err ? reject(err) : resolve(result)))
      );

      // 5️⃣ Add follow-up
      const followupSql = `
        INSERT INTO partnerFollowup 
        (partnerId, role, followUp, followUpText, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await new Promise((resolve, reject) =>
        db.query(
          followupSql,
          [
            insertResult.insertId,
            "Promoter",
            "New",
            "Newly Added Promoter",
            currentdate,
            currentdate,
          ],
          (err) => (err ? reject(err) : resolve())
        )
      );

      return res.status(201).json({
        message: "Promoter added successfully",
        Id: insertResult.insertId,
      });
    });
  } catch (err) {
    console.error("Error adding Promoter:", err);
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
    // 1️⃣ Fetch existing promoter
    const [rows] = await new Promise((resolve, reject) =>
      db.query(
        "SELECT adharimage, panimage, reraimage FROM promoter WHERE id = ?",
        [partnerid],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Promoter not found" });
    }

    const oldData = rows[0];

    // 2️⃣ Upload new files to S3 if provided
    const adharFile = req.files?.["adharImage"]?.[0];
    const panFile = req.files?.["panImage"]?.[0];
    const reraFile = req.files?.["reraImage"]?.[0];

    let newAdharUrl = oldData.adharimage || null;
    let newPanUrl = oldData.panimage || null;
    let newReraUrl = oldData.reraimage || null;

    // Upload to S3 and replace old URLs
    if (adharFile) {
      newAdharUrl = await uploadToS3(adharFile, "documents/adhar");
    }

    if (panFile) {
      newPanUrl = await uploadToS3(panFile, "documents/pan");
    }

    if (reraFile) {
      newReraUrl = await uploadToS3(reraFile, "documents/rera");
    }

    // 3️⃣ Build update query
    let updateSql = `
      UPDATE promoter
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

    if (newAdharUrl) {
      updateSql += `, adharimage = ?`;
      updateValues.push(newAdharUrl);
    }

    if (newPanUrl) {
      updateSql += `, panimage = ?`;
      updateValues.push(newPanUrl);
    }

    if (newReraUrl) {
      updateSql += `, reraimage = ?`;
      updateValues.push(newReraUrl);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(partnerid);

    await new Promise((resolve, reject) =>
      db.query(updateSql, updateValues, (err) => (err ? reject(err) : resolve()))
    );

    res.status(200).json({ message: "Promoter updated successfully" });
  } catch (err) {
    console.error("Error updating Promoter:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};


// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query("SELECT * FROM promoter WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Promoter not found" });
    }

    db.query("DELETE FROM promoter WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Promoter deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query("SELECT * FROM promoter WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE promoter SET status = ? WHERE id = ?",
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
          .json({ message: "Promoter status change successfully" });
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
      "SELECT * FROM promoter WHERE id = ?",
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
          UPDATE promoter 
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
              "Promoter",
              "https://promoter.reparv.in"
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
  db.query(sql, [Id, "Promoter"], (err, result) => {
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
  db.query("SELECT * FROM promoter WHERE id = ?", [Id], (err, result) => {
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
        "Promoter",
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
          "UPDATE promoter SET paymentstatus = 'Follow Up', updated_at = ? WHERE id = ?",
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

    db.query("SELECT * FROM promoter WHERE id = ?", [Id], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Projet Partner not found" });
      }

      let loginstatus = "Active";
      const email = result[0].email;

      db.query(
        "UPDATE promoter SET loginstatus = ?, username = ?, password = ? WHERE id = ?",
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
            "Promoter",
            "https://promoter.reparv.in"
          )
            .then(() => {
              res.status(200).json({
                message: "Promoter login assigned successfully and email sent.",
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
