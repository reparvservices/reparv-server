import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { verifyRazorpayPayment } from "../paymentController.js";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getAll = (req, res) => {
  const partnerAdderId = req.promoterUser?.id;
  if (!partnerAdderId) {
    return res.status(400).json({ message: "Invalid Id!" });
  }

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
        WHERE onboardingpartner.paymentstatus = 'Success' AND onboardingpartner.partneradder = ${partnerAdderId} 
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    case "Follow Up":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus = 'Follow Up' AND onboardingpartner.loginstatus = 'Inactive'  AND onboardingpartner.partneradder = ${partnerAdderId} 
        ORDER BY onboardingpartner.updated_at DESC`;
      break;

    case "Pending":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus = 'Pending' AND onboardingpartner.partneradder = ${partnerAdderId}
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    case "Free":
      sql = `
        SELECT onboardingpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM onboardingpartner
        ${followUpJoin}
        WHERE onboardingpartner.paymentstatus != 'Success'
          AND onboardingpartner.loginstatus = 'Active' AND onboardingpartner.partneradder = ${partnerAdderId}
        ORDER BY onboardingpartner.created_at DESC`;
      break;

    default:
      sql = `SELECT * FROM onboardingpartner WHERE partneradder = ${partnerAdderId} ORDER BY partnerid DESC`;
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
      WHERE paymentstatus = 'Success' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Pending', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus = 'Pending' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Follow Up', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus = 'Follow Up' AND loginstatus = 'Inactive' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Free', COUNT(*)
      FROM onboardingpartner
      WHERE paymentstatus != 'Success' AND loginstatus = 'Active' AND partneradder = ${partnerAdderId} 
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

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const partnerAdderId = req.promoterUser?.id;
  if (!partnerAdderId) {
    return res.status(400).json({ message: "Invalid Partner Adder ID" });
  }

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

  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const createReferralCode = (length = 6) => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let code = "";
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "REF-" + code;
  };

  const generateUniqueReferralCode = (callback) => {
    const code = createReferralCode();
    db.query(
      "SELECT referral FROM onboardingpartner WHERE referral = ?",
      [code],
      (err, results) => {
        if (err) return callback(err, null);
        if (results.length > 0) return generateUniqueReferralCode(callback);
        return callback(null, code);
      }
    );
  };

  try {
    // Upload images to S3
    let adharImageUrl = null;
    let panImageUrl = null;
    if (req.files?.["adharImage"]?.[0]) {
      adharImageUrl = await uploadToS3(req.files["adharImage"][0]);
    }
    if (req.files?.["panImage"]?.[0]) {
      panImageUrl = await uploadToS3(req.files["panImage"][0]);
    }

    // Check if contact/email already exists
    const checkResult = await new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM onboardingpartner WHERE contact = ? OR email = ?`,
        [contact, email],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "OnBoarding Partner already exists with this contact or email",
      });
    }

    // Generate referral code
    const referralCode = await new Promise((resolve, reject) => {
      generateUniqueReferralCode((err, code) => {
        if (err) return reject(err);
        resolve(code);
      });
    });

    // Insert partner
    const insertResult = await new Promise((resolve, reject) => {
      const sql = `INSERT INTO onboardingpartner 
      (fullname, contact, email, intrest, partneradder, refrence, referral, address, state, city, pincode, experience, adharno, panno, bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, updated_at, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      db.query(
        sql,
        [
          fullname,
          contact,
          email,
          intrest,
          partnerAdderId,
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
        ],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    // Insert default follow-up
    await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO partnerFollowup (partnerId, role, followUp, followUpText, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          insertResult.insertId,
          "Onboarding Partner",
          "New",
          "Newly Added Onboarding Partner",
          currentdate,
          currentdate,
        ],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    return res.status(201).json({
      message: "OnBoarding Partner added successfully",
      Id: insertResult.insertId,
    });
  } catch (error) {
    console.error("Error adding partner:", error);
    return res.status(500).json({ message: "Server error", error });
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
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Fetch existing partner to get old image URLs
    const existingPartner = await new Promise((resolve, reject) => {
      db.query(
        "SELECT adharimage, panimage FROM onboardingpartner WHERE partnerid = ?",
        [partnerid],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (existingPartner.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    let adharImageUrl = existingPartner[0].adharimage;
    let panImageUrl = existingPartner[0].panimage;

    // Upload new files to S3 and delete old ones if replaced
    if (req.files?.["adharImage"]?.[0]) {
      const newAdharUrl = await uploadToS3(req.files["adharImage"][0]);
      if (adharImageUrl) await deleteFromS3(adharImageUrl);
      adharImageUrl = newAdharUrl;
    }

    if (req.files?.["panImage"]?.[0]) {
      const newPanUrl = await uploadToS3(req.files["panImage"][0]);
      if (panImageUrl) await deleteFromS3(panImageUrl);
      panImageUrl = newPanUrl;
    }

    // Build update query
    let updateSql = `UPDATE onboardingpartner SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, pincode = ?, experience = ?, adharno = ?, panno = ?, bankname = ?, accountholdername = ?, accountnumber = ?, ifsc = ?, adharimage = ?, panimage = ?, updated_at = ? WHERE partnerid = ?`;
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
      adharImageUrl,
      panImageUrl,
      currentdate,
      partnerid,
    ];

    await new Promise((resolve, reject) => {
      db.query(updateSql, updateValues, (err, result) =>
        err ? reject(err) : resolve(result)
      );
    });

    return res.status(200).json({ message: "Partner updated successfully" });
  } catch (error) {
    console.error("Error updating partner:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};
