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
        WHERE role = 'Project Partner'
        GROUP BY partnerId
      ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
      WHERE p1.role = 'Project Partner'
    ) pf ON projectpartner.id = pf.partnerId
  `;

  switch (paymentStatus) {
    case "Success":
      sql = `
        SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM projectpartner
        ${followUpJoin}
        WHERE projectpartner.paymentstatus = 'Success' AND projectpartner.partneradder = ${partnerAdderId}
        ORDER BY projectpartner.created_at DESC`;
      break;

    case "Follow Up":
      sql = `
        SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM projectpartner
        ${followUpJoin}
        WHERE projectpartner.paymentstatus = 'Follow Up' AND projectpartner.loginstatus = 'Inactive' AND projectpartner.partneradder = ${partnerAdderId} 
        ORDER BY projectpartner.updated_at DESC`;
      break;

    case "Pending":
      sql = `
        SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM projectpartner
        ${followUpJoin}
        WHERE projectpartner.paymentstatus = 'Pending' AND projectpartner.partneradder = ${partnerAdderId} 
        ORDER BY projectpartner.created_at DESC`;
      break;

    case "Free":
      sql = `
        SELECT projectpartner.*, pf.followUp, pf.created_at AS followUpDate
        FROM projectpartner
        ${followUpJoin}
        WHERE projectpartner.paymentstatus != 'Success' 
          AND projectpartner.loginstatus = 'Active' AND projectpartner.partneradder = ${partnerAdderId} 
        ORDER BY projectpartner.created_at DESC`;
      break;

    default:
      sql = `SELECT * FROM projectpartner WHERE partneradder = ${partnerAdderId} ORDER BY id DESC`;
  }

  db.query(sql, (err, partners) => {
    if (err) {
      console.error("Error fetching project partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Accurate count logic including "Free"
    const countQuery = `
      SELECT 'Success' AS status, COUNT(*) AS count
      FROM projectpartner
      WHERE paymentstatus = 'Success' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Pending', COUNT(*)
      FROM projectpartner
      WHERE paymentstatus = 'Pending' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Follow Up', COUNT(*)
      FROM projectpartner
      WHERE paymentstatus = 'Follow Up' AND loginstatus = 'Inactive' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Free', COUNT(*)
      FROM projectpartner
      WHERE paymentstatus != 'Success' AND loginstatus = 'Active' AND partneradder = ${partnerAdderId} 
    `;

    db.query(countQuery, (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching projectpartner status counts:", countErr);
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

      res.json({
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
      return res.status(400).json({ message: "All fields are required!" });
    }

    /* ---------- CHECK EXISTING ---------- */
    const checkSql =
      "SELECT id FROM projectpartner WHERE contact = ? OR email = ?";

    db.query(checkSql, [contact, email], async (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length > 0) {
        return res.status(409).json({
          message: "Project Partner already exists with this Contact or Email",
        });
      }

      /* ---------- REFERRAL ---------- */
      const referral = `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      /* ---------- UPLOAD TO S3 ---------- */
      const adharImage =
        req.files?.["adharImage"]?.[0] &&
        (await uploadToS3(req.files["adharImage"][0]));

      const panImage =
        req.files?.["panImage"]?.[0] &&
        (await uploadToS3(req.files["panImage"][0]));

      const reraImage =
        req.files?.["reraImage"]?.[0] &&
        (await uploadToS3(req.files["reraImage"][0]));

      const insertSql = `
        INSERT INTO projectpartner
        (fullname, contact, email, intrest, partneradder, refrence, referral,
         address, state, city, pincode, experience, adharno, panno, rerano,
         bankname, accountholdername, accountnumber, ifsc,
         adharimage, panimage, reraimage, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          referral,
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
          adharImage || null,
          panImage || null,
          reraImage || null,
          currentdate,
          currentdate,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            return res.status(500).json({
              message: "Database error during insert",
              error: insertErr,
            });
          }

          res.status(201).json({
            message: "Project Partner added successfully",
            id: insertResult.insertId,
          });
        },
      );
    });
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
    const [old] = await new Promise((resolve, reject) => {
      db.query(
        "SELECT adharimage, panimage, reraimage FROM projectpartner WHERE id = ?",
        [partnerid],
        (err, result) => {
          if (err) reject(err);
          resolve(result);
        },
      );
    });

    let adharImage = old?.adharimage;
    let panImage = old?.panimage;
    let reraImage = old?.reraimage;

    /* ---------- REPLACE IMAGES ---------- */
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

    const updateSql = `
      UPDATE projectpartner SET
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
          message: "Project Partner updated successfully",
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
