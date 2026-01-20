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

  if (partnerLister === "Promoter") {
    sql = `
      SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM onboardingpartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Onboarding Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Onboarding Partner'
      ) pf ON onboardingpartner.partnerid = pf.partnerId
      WHERE onboardingpartner.partneradder IS NOT NULL 
        AND onboardingpartner.partneradder != ''
      ORDER BY onboardingpartner.created_at DESC;
    `;
  } else if (partnerLister === "Reparv") {
    sql = `
      SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM onboardingpartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Onboarding Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Onboarding Partner'
      ) pf ON onboardingpartner.partnerid = pf.partnerId
      WHERE onboardingpartner.partneradder IS NULL 
        OR onboardingpartner.partneradder = ''
      ORDER BY onboardingpartner.created_at DESC;
    `;
  } else {
    sql = `
      SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM onboardingpartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Onboarding Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Onboarding Partner'
      ) pf ON onboardingpartner.partnerid = pf.partnerId
      ORDER BY onboardingpartner.created_at DESC;
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

export const getAllOld = (req, res) => {
  const paymentStatus = req.params.paymentStatus;

  if (!paymentStatus) {
    return res.status(401).json({ message: "Payment Status Not Selected" });
  }

  let sql = "";

  const followUpJoin = `
    LEFT JOIN (
      SELECT p1.*
      FROM partnerFollowup p1
      INNER JOIN (
        SELECT partnerId, MAX(created_at) AS latest
        FROM partnerFollowup
        WHERE role = 'Onboarding Partner'
        GROUP BY partnerId
      ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
      WHERE p1.role = 'Onboarding Partner'
    ) pf ON onboardingpartner.partnerid = pf.partnerId
  `;

  switch (paymentStatus) {
    case "Success":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus = 'Success' 
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    case "Follow Up":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus = 'Follow Up' AND onboardingpartner.loginstatus = 'Inactive'
        ORDER BY onboardingpartner.updated_at DESC`;
      break;

    case "Pending":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus = 'Pending' 
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    case "Free":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus != 'Success'
          AND onboardingpartner.loginstatus = 'Active'
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    default:
      sql = `SELECT * FROM onboardingpartner ORDER BY partnerid DESC`;
  }

  db.query(sql, (err, partners) => {
    if (err) {
      console.error("Error fetching partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Updated count query for accurate grouping including "Free"
    const countQuery = `
      SELECT 'Success' AS status, COUNT(*) AS count
      FROM onboardingpartner
      WHERE paymentstatus = 'Success'
      UNION ALL
      SELECT 'Pending', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus = 'Pending'
      UNION ALL
      SELECT 'Follow Up', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus = 'Follow Up' AND loginstatus = 'Inactive'
      UNION ALL
      SELECT 'Free', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus != 'Success' AND loginstatus = 'Active'
    `;

    db.query(countQuery, (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching counts:", countErr);
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

      const paymentStatusCounts = {};
      counts.forEach((item) => {
        paymentStatusCounts[item.status] = item.count;
      });

      return res.json({
        data: formatted,
        paymentStatusCounts,
      });
    });
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql =
    "SELECT * FROM onboardingpartner WHERE status = 'Active' ORDER BY partnerid DESC";
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
  const sql = "SELECT * FROM onboardingpartner WHERE partnerid = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }
    res.json(result[0]);
    console.log(result[0]);
  });
};

// **Add New **
export const add = async (req, res) => {
  try {
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
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    /*  Required validation */
    if (!fullname || !contact || !email || !intrest) {
      return res.status(400).json({ message: "All fields are required" });
    }

    /* 🔁 Duplicate check */
    const [existing] = await db
      .promise()
      .query("SELECT * FROM onboardingpartner WHERE contact = ? OR email = ?", [
        contact,
        email,
      ]);

    if (existing.length > 0) {
      return res.status(409).json({
        message: "OnBoarding Partner already exists with this contact or email",
      });
    }

    /* 🎯 Generate unique referral */
    const createReferralCode = (length = 6) => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
      let code = "";
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return "REF-" + code;
    };

    const generateUniqueReferralCode = async () => {
      while (true) {
        const code = createReferralCode();
        const [rows] = await db
          .promise()
          .query("SELECT referral FROM onboardingpartner WHERE referral = ?", [
            code,
          ]);
        if (rows.length === 0) return code;
      }
    };

    const referralCode = await generateUniqueReferralCode();

    /*  Upload images to S3 */
    const uploadSingle = async (field) => {
      if (!req.files?.[field]?.[0]) return null;
      return await uploadToS3(req.files[field][0], "onboarding");
    };

    const adharImageUrl = await uploadSingle("adharImage");
    const panImageUrl = await uploadSingle("panImage");

    /*  Insert partner */
    const insertSQL = `
      INSERT INTO onboardingpartner (
        fullname, contact, email, intrest, refrence, referral,
        address, state, city, pincode, experience,
        adharno, panno, bankname, accountholdername,
        accountnumber, ifsc, adharimage, panimage,
        updated_at, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const [result] = await db
      .promise()
      .query(insertSQL, [
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
        bankname,
        accountholdername,
        accountnumber,
        ifsc,
        adharImageUrl,
        panImageUrl,
        currentdate,
        currentdate,
      ]);

    /* 📝 Default follow-up */
    await db.promise().query(
      `INSERT INTO partnerFollowup 
       (partnerId, role, followUp, followUpText, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
      [
        result.insertId,
        "Onboarding Partner",
        "New",
        "Newly Added Onboarding Partner",
        currentdate,
        currentdate,
      ],
    );

    return res.status(201).json({
      message: "OnBoarding Partner added successfully",
      Id: result.insertId,
      referral: referralCode,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error,
    });
  }
};

// **Edit **
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
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    //  Fetch old images safely
    const rows = await new Promise((resolve, reject) =>
      db.query(
        "SELECT adharimage, panimage FROM onboardingpartner WHERE partnerid = ?",
        [partnerid],
        (err, results) => (err ? reject(err) : resolve(results)),
      ),
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    // Handle old adhar images
    let oldAdharImages = [];
    if (rows[0].adharimage) {
      try {
        oldAdharImages = JSON.parse(rows[0].adharimage);
        if (!Array.isArray(oldAdharImages)) oldAdharImages = [oldAdharImages];
      } catch {
        oldAdharImages = [rows[0].adharimage]; // single string fallback
      }
    }

    // Handle old pan images
    let oldPanImages = [];
    if (rows[0].panimage) {
      try {
        oldPanImages = JSON.parse(rows[0].panimage);
        if (!Array.isArray(oldPanImages)) oldPanImages = [oldPanImages];
      } catch {
        oldPanImages = [rows[0].panimage]; // single string fallback
      }
    }

    //  Upload new files to S3
    const adharImageFiles = req.files?.["adharImage"] || [];
    const panImageFiles = req.files?.["panImage"] || [];

    const newAdharImageUrls = [];
    for (const file of adharImageFiles) {
      const url = await uploadToS3(file, "documents/adhar");
      newAdharImageUrls.push(url);
    }

    const newPanImageUrls = [];
    for (const file of panImageFiles) {
      const url = await uploadToS3(file, "documents/pan");
      newPanImageUrls.push(url);
    }

    //  Delete old files from S3 if replaced
    if (newAdharImageUrls.length > 0) {
      for (const oldUrl of oldAdharImages) {
        await deleteFromS3(oldUrl);
      }
    }

    if (newPanImageUrls.length > 0) {
      for (const oldUrl of oldPanImages) {
        await deleteFromS3(oldUrl);
      }
    }

    // Prepare final JSON arrays for DB (store null if no new files)
    const adharImagesJson =
      newAdharImageUrls.length > 0
        ? JSON.stringify(newAdharImageUrls)
        : rows[0].adharimage;
    const panImagesJson =
      newPanImageUrls.length > 0
        ? JSON.stringify(newPanImageUrls)
        : rows[0].panimage;

    //  Build update query
    let updateSql = `
      UPDATE onboardingpartner 
      SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, 
          pincode = ?, experience = ?, adharno = ?, panno = ?, bankname = ?, accountholdername = ?, 
          accountnumber = ?, ifsc = ?, updated_at = ?, adharimage = ?, panimage = ?
      WHERE partnerid = ?
    `;

    const updateValues = [
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
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
      currentdate,
      adharImagesJson,
      panImagesJson,
      partnerid,
    ];

    await new Promise((resolve, reject) =>
      db.query(updateSql, updateValues, (err) =>
        err ? reject(err) : resolve(),
      ),
    );

    res.status(200).json({ message: "Partner updated successfully" });
  } catch (err) {
    console.error("Error updating partner:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};
// **Edit Old **
export const editOld = async (req, res) => {
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
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    //  Fetch old images safely
    const rows = await new Promise((resolve, reject) =>
      db.query(
        "SELECT adharimage, panimage FROM onboardingpartner WHERE partnerid = ?",
        [partnerid],
        (err, results) => (err ? reject(err) : resolve(results)),
      ),
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    let oldAdharImages = [];
    if (rows[0].adharimage) {
      try {
        oldAdharImages = JSON.parse(rows[0].adharimage);
        if (!Array.isArray(oldAdharImages)) oldAdharImages = [oldAdharImages];
      } catch {
        oldAdharImages = [rows[0].adharimage]; // fallback for plain string
      }
    }

    let oldPanImages = [];
    if (rows[0].panimage) {
      try {
        oldPanImages = JSON.parse(rows[0].panimage);
        if (!Array.isArray(oldPanImages)) oldPanImages = [oldPanImages];
      } catch {
        oldPanImages = [rows[0].panimage]; // fallback for plain string
      }
    }

    //  Upload new files to S3
    const adharImageFiles = req.files?.["adharImage"] || [];
    const panImageFiles = req.files?.["panImage"] || [];

    const newAdharImageUrls = [];
    for (const file of adharImageFiles) {
      const url = await uploadToS3(file, "documents/adhar");
      newAdharImageUrls.push(url);
    }

    const newPanImageUrls = [];
    for (const file of panImageFiles) {
      const url = await uploadToS3(file, "documents/pan");
      newPanImageUrls.push(url);
    }

    //  Delete old files from S3 if replaced
    if (newAdharImageUrls.length > 0) {
      for (const oldUrl of oldAdharImages) {
        await deleteFromS3(oldUrl);
      }
    }

    if (newPanImageUrls.length > 0) {
      for (const oldUrl of oldPanImages) {
        await deleteFromS3(oldUrl);
      }
    }

    // Prepare final JSON for DB
    const adharImagesJson =
      newAdharImageUrls.length > 0
        ? JSON.stringify(newAdharImageUrls)
        : rows[0].adharimage;
    const panImagesJson =
      newPanImageUrls.length > 0
        ? JSON.stringify(newPanImageUrls)
        : rows[0].panimage;

    //  Build update query
    const updateSql = `
      UPDATE onboardingpartner
      SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, 
          pincode = ?, experience = ?, adharno = ?, panno = ?, bankname = ?, accountholdername = ?, 
          accountnumber = ?, ifsc = ?, updated_at = ?, adharimage = ?, panimage = ?
      WHERE partnerid = ?
    `;

    const updateValues = [
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
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
      currentdate,
      adharImagesJson,
      panImagesJson,
      partnerid,
    ];

    await new Promise((resolve, reject) =>
      db.query(updateSql, updateValues, (err) =>
        err ? reject(err) : resolve(),
      ),
    );

    res.status(200).json({ message: "Partner updated successfully" });
  } catch (err) {
    console.error("Error updating Partner:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query(
    "SELECT * FROM onboardingpartner WHERE partnerid = ?",
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
        "DELETE FROM onboardingpartner WHERE partnerid = ?",
        [Id],
        (err) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({ message: "Partner deleted successfully" });
        },
      );
    },
  );
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  db.query(
    "SELECT * FROM onboardingpartner WHERE partnerid = ?",
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
        "UPDATE onboardingpartner SET status = ? WHERE partnerid = ?",
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
            .json({ message: "Partner status change successfully" });
        },
      );
    },
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
      "SELECT * FROM onboardingpartner WHERE partnerid = ?",
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
          UPDATE onboardingpartner 
          SET amount = ?, paymentid = ?, username = ?, password = ?, paymentstatus = "Success", loginstatus = "Active" 
          WHERE partnerid = ?
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
              "Onboarding Partner",
              "https://onboarding.reparv.in",
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
      },
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
  db.query(sql, [Id, "Onboarding Partner"], (err, result) => {
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
    return res.status(400).json({ message: "Empty Follow Up or Text" });
  }

  // Check if onboarding partner exists
  db.query(
    "SELECT * FROM onboardingpartner WHERE partnerid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res
          .status(404)
          .json({ message: "Onboarding partner not found." });
      }

      // Insert follow-up entry
      db.query(
        "INSERT INTO partnerFollowup (partnerId, role, followUp, followUpText, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          Id,
          "Onboarding Partner",
          followUp.trim(),
          followUpText.trim(),
          currentdate,
          currentdate,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error Adding Follow Up:", insertErr);
            return res
              .status(500)
              .json({ message: "Database error", error: insertErr });
          }

          // Update partnerLister in onboardingpartner
          db.query(
            "UPDATE onboardingpartner SET paymentstatus = 'Follow Up', updated_at = ? WHERE partnerid = ?",
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
                  "Partner Follow Up added and payment status updated to 'Follow Up'.",
              });
            },
          );
        },
      );
    },
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
      "SELECT * FROM onboardingpartner WHERE partnerid = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        if (result.length === 0) {
          return res.status(404).json({ message: "Partner not found" });
        }

        let loginstatus = "Active";
        const email = result[0].email;

        db.query(
          "UPDATE onboardingpartner SET loginstatus = ?, username = ?, password = ? WHERE partnerid = ?",
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
              "Onboarding Partner",
              "https://onboarding.reparv.in",
            )
              .then(() => {
                res.status(200).json({
                  message:
                    "Partner login assigned successfully and email sent.",
                });
              })
              .catch((emailError) => {
                console.error("Error sending email:", emailError);
                res
                  .status(500)
                  .json({ message: "Login updated but email failed to send." });
              });
          },
        );
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
