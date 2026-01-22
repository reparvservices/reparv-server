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

  let sql;

  const followUpJoin = `
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
    ) pf ON tp.id = pf.partnerId
  `;

  switch (paymentStatus) {
    case "Success":
      sql = `
        SELECT tp.*, pf.followUp, pf.created_at AS followUpDate
        FROM territorypartner tp
        ${followUpJoin}
        WHERE tp.paymentstatus = 'Success' AND tp.partneradder = ${partnerAdderId} 
        ORDER BY tp.created_at DESC`;
      break;

    case "Follow Up":
      sql = `
        SELECT tp.*, pf.followUp, pf.created_at AS followUpDate
        FROM territorypartner tp
        ${followUpJoin}
        WHERE tp.paymentstatus = 'Follow Up' AND tp.loginstatus = 'Inactive' AND tp.partneradder = ${partnerAdderId} 
        ORDER BY tp.updated_at DESC`;
      break;

    case "Pending":
      sql = `
        SELECT tp.*, pf.followUp, pf.created_at AS followUpDate
        FROM territorypartner tp
        ${followUpJoin}
        WHERE tp.paymentstatus = 'Pending' AND tp.partneradder = ${partnerAdderId} 
        ORDER BY tp.created_at DESC`;
      break;

    case "Free":
      sql = `
        SELECT tp.*, pf.followUp, pf.created_at AS followUpDate
        FROM territorypartner tp
        ${followUpJoin}
        WHERE tp.paymentstatus != 'Success' AND tp.loginstatus = 'Active' AND tp.partneradder = ${partnerAdderId} 
        ORDER BY tp.created_at DESC`;
      break;

    default:
      sql = `SELECT * FROM territorypartner WHERE partneradder = ${partnerAdderId} ORDER BY id DESC`;
  }

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching Territory Partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Count query with "Free" added
    const countQuery = `
      SELECT 'Success' AS status, COUNT(*) AS count
      FROM territorypartner
      WHERE paymentstatus = 'Success' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Pending', COUNT(*)
      FROM territorypartner
      WHERE paymentstatus = 'Pending' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Follow Up', COUNT(*)
      FROM territorypartner
      WHERE paymentstatus = 'Follow Up' AND loginstatus = 'Inactive' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Free', COUNT(*)
      FROM territorypartner
      WHERE paymentstatus != 'Success' AND loginstatus = 'Active' AND partneradder = ${partnerAdderId} 
    `;

    db.query(countQuery, (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching status counts:", countErr);
        return res
          .status(500)
          .json({ message: "Database error", error: countErr });
      }

      // Format counts into object
      const paymentStatusCounts = {};
      counts.forEach((item) => {
        paymentStatusCounts[item.status] = item.count;
      });

      // Format results
      const formatted = result.map((row) => ({
        ...row,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
        followUp: row.followUp || null,
        followUpDate: row.followUpDate
          ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      return res.json({
        data: formatted,
        paymentStatusCounts,
      });
    });
  });
};

export const add = async (req, res) => {
  try {
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
      rerano,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    if (!fullname || !contact || !email || !intrest) {
      return res.status(400).json({ message: "All Fields required!" });
    }

    /* ---------- DUPLICATE CHECK ---------- */
    const exists = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id FROM territorypartner WHERE contact=? OR email=?",
        [contact, email],
        (err, result) => {
          if (err) reject(err);
          resolve(result.length > 0);
        },
      );
    });

    if (exists) {
      return res.status(409).json({
        message: "Territory Partner already exists with this Contact or Email.",
      });
    }

    /* ---------- REFERRAL CODE ---------- */
    const createReferralCode = () =>
      "REF-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const referralCode = await new Promise((resolve, reject) => {
      const generate = () => {
        const code = createReferralCode();
        db.query(
          "SELECT referral FROM territorypartner WHERE referral=?",
          [code],
          (err, r) => {
            if (err) return reject(err);
            if (r.length > 0) return generate();
            resolve(code);
          },
        );
      };
      generate();
    });

    /* ---------- S3 UPLOAD ---------- */
    const adharImage = req.files?.["adharImage"]?.[0]
      ? await uploadToS3(req.files["adharImage"][0])
      : null;

    const panImage = req.files?.["panImage"]?.[0]
      ? await uploadToS3(req.files["panImage"][0])
      : null;

    const reraImage = req.files?.["reraImage"]?.[0]
      ? await uploadToS3(req.files["reraImage"][0])
      : null;

    /* ---------- INSERT ---------- */
    const insertSql = `
      INSERT INTO territorypartner
      (fullname, contact, email, intrest, partneradder, refrence, referral,
       address, state, city, pincode, experience, adharno, panno, rerano,
       bankname, accountholdername, accountnumber, ifsc,
       adharimage, panimage, reraimage, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    db.query(
      insertSql,
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
        rerano,
        bankname,
        accountholdername,
        accountnumber,
        ifsc,
        adharImage,
        panImage,
        reraImage,
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        db.query(
          `INSERT INTO partnerFollowup
           (partnerId, role, followUp, followUpText, created_at, updated_at)
           VALUES (?,?,?,?,?,?)`,
          [
            result.insertId,
            "Territory Partner",
            "New",
            "Newly Added Territory Partner",
            currentdate,
            currentdate,
          ],
        );

        res.status(201).json({
          message: "Territory Partner added successfully",
          Id: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};

export const edit = async (req, res) => {
  try {
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

    /* ---------- FETCH OLD IMAGES ---------- */
    const old = await new Promise((resolve, reject) => {
      db.query(
        "SELECT adharimage, panimage, reraimage FROM territorypartner WHERE id=?",
        [partnerid],
        (err, result) => {
          if (err) reject(err);
          resolve(result[0]);
        },
      );
    });

    let adharImage = old?.adharimage;
    let panImage = old?.panimage;
    let reraImage = old?.reraimage;

    /* ---------- S3 UPDATE ---------- */
    if (req.files?.["adharImage"]?.[0]) {
      if (adharImage) await deleteFromS3(adharImage);
      adharImage = await uploadToS3(req.files["adharImage"][0]);
    }

    if (req.files?.["panImage"]?.[0]) {
      if (panImage) await deleteFromS3(panImage);
      panImage = await uploadToS3(req.files["panImage"][0]);
    }

    if (req.files?.["reraImage"]?.[0]) {
      if (reraImage) await deleteFromS3(reraImage);
      reraImage = await uploadToS3(req.files["reraImage"][0]);
    }

    /* ---------- UPDATE ---------- */
    const updateSql = `
      UPDATE territorypartner SET
      fullname=?, contact=?, email=?, intrest=?, address=?, state=?, city=?,
      pincode=?, experience=?, adharno=?, panno=?, rerano=?,
      bankname=?, accountholdername=?, accountnumber=?, ifsc=?,
      adharimage=?, panimage=?, reraimage=?, updated_at=?
      WHERE id=?
    `;

    db.query(
      updateSql,
      [
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
        adharImage,
        panImage,
        reraImage,
        currentdate,
        partnerid,
      ],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: "Territory Partner updated successfully",
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
