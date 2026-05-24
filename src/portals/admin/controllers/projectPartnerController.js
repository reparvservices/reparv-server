import db from "#db";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import sendEmail from "#utils/nodeMailer.js";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import { attachSubscriptionsToPartners } from "../../subscription/utils/partnerSubscriptionAttach.js";
import { enrichPartnerWithSubscription } from "../../subscription/utils/subscriptionBucket.js";
import { buildPartnerListQueries } from "../../subscription/utils/partnerListQuery.js";
import dbPromise from "#db/promise";

const saltRounds = 10;

const formatPartnerListRow = (row) => {
  const sub = row.subscription_id
    ? {
        id: row.subscription_id,
        status: row.subscription_status,
        plan_name: row.subscription_plan_name,
        billing_cycle: row.subscription_billing_cycle,
        plan_type: row.subscription_plan_type,
        plan_duration: row.subscription_plan_duration,
        end_date: row.subscription_end_date,
        start_date: row.subscription_start_date,
        final_amount: row.subscription_final_amount,
      }
    : null;

  const {
    subscription_id: _sid,
    subscription_status: _ss,
    subscription_plan_name: _spn,
    subscription_billing_cycle: _sbc,
    subscription_plan_type: _spt,
    subscription_plan_duration: _spd,
    subscription_end_date: _sed,
    subscription_start_date: _ssd,
    subscription_final_amount: _sfa,
    ...partner
  } = row;

  const enriched = enrichPartnerWithSubscription(partner, sub);

  return {
    ...enriched,
    created_at: moment
      .utc(enriched.created_at)
      .tz("Asia/Kolkata")
      .format("DD MMM YYYY | hh:mm A"),
    updated_at: enriched.updated_at
      ? moment.utc(enriched.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
      : null,
    followUp: enriched.followUp || null,
    followUpDate: enriched.followUpDate
      ? moment(enriched.followUpDate).format("DD MMM YYYY | hh:mm A")
      : null,
    subscription_start_date: sub?.start_date || null,
    subscription_end_date: sub?.end_date || null,
  };
};

/**
 * GET /admin/projectpartner/list
 * Query: limit, offset, search, filter, date_from, date_to
 */
export const listProjectPartners = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const search = String(req.query.search || "").trim();
    const filter = String(req.query.filter || "").trim();

    let dateFrom = null;
    let dateTo = null;
    if (req.query.date_from) {
      const d = new Date(req.query.date_from);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        dateFrom = d;
      }
    }
    if (req.query.date_to) {
      const d = new Date(req.query.date_to);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        dateTo = d;
      }
    }

    const { listSql, countSql, summarySql, listParams, countParams, summaryParams } =
      buildPartnerListQueries({ search, filter, dateFrom, dateTo, limit, offset });

    const [[countRows], [summaryRows], [listRows]] = await Promise.all([
      dbPromise.query(countSql, countParams),
      dbPromise.query(summarySql, summaryParams),
      dbPromise.query(listSql, listParams),
    ]);

    const total = Number(countRows[0]?.total) || 0;
    const sum = summaryRows[0] || {};
    const data = listRows.map(formatPartnerListRow);

    return res.status(200).json({
      success: true,
      total,
      limit,
      offset,
      summary: {
        total: Number(sum.total) || 0,
        trial: Number(sum.trial) || 0,
        paid: Number(sum.paid) || 0,
        enterprise: Number(sum.enterprise) || 0,
        pending: Number(sum.pending) || 0,
        unpaid: Number(sum.unpaid) || 0,
        follow_up: Number(sum.follow_up) || 0,
      },
      data,
    });
  } catch (err) {
    console.error("listProjectPartners:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project partners",
    });
  }
};

export const getAll = async (req, res) => {
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

  try {
    const [result] = await db.promise().query(sql);

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      followUp: row.followUp || null,
      followUpDate: row.followUpDate
        ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    const withSubs = await attachSubscriptionsToPartners(
      formatted,
      "project",
      (row) => row.id,
    );

    res.json(withSubs);
  } catch (err) {
    console.error("Error fetching partners:", err);
    return res.status(500).json({ message: "Database error", error: err });
  }
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

// **Fetch Single Partner with Active Subscription**

export const getById = async (req, res) => {
  try {
    const Id = parseInt(req.params.id);

    if (isNaN(Id)) {
      return res.status(400).json({ message: "Invalid Partner ID" });
    }

    const [partnerResult] = await db.promise().query(
      `SELECT * FROM projectpartner WHERE id = ?`,
      [Id],
    );

    if (partnerResult.length === 0) {
      return res.status(404).json({ message: "Project Partner not found" });
    }

    const partner = partnerResult[0];

    const [latestSub] = await db.promise().query(
      `SELECT us.start_date, us.end_date, us.payment_type, sp.duration AS plan
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = ? AND us.role = 'project'
       ORDER BY COALESCE(us.updated_at, us.created_at) DESC, us.id DESC
       LIMIT 1`,
      [Id],
    );

    if (latestSub.length > 0) {
      const s = latestSub[0];
      partner.start_date = s.start_date;
      partner.end_date = s.end_date;
      partner.plan = s.plan;
      partner.mode = null;
      partner.payment_type = s.payment_type;
      partner.screenshot = null;
    } else {
      partner.start_date = null;
      partner.end_date = null;
      partner.plan = null;
      partner.mode = null;
      partner.payment_type = null;
      partner.screenshot = null;
    }

    /* Fetch Subscription History */

    const [history] = await db.promise().query(
      `SELECT 
        us.id,
        sp.duration AS plan,
        us.final_amount AS amount,
        us.start_date,
        us.end_date,
        us.payment_type,
        us.razorpay_subscription_id AS payment_id,
        NULL AS screenshot,
        us.status
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = ? AND us.role = 'project'
      ORDER BY us.start_date DESC`,
      [Id],
    );

    /* Attach history to partner */

    partner.subscriptionHistory = history;

    res.json(partner);
  } catch (error) {
    console.error("Error fetching partner:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
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
      },
    );
  };

  try {
    //  Upload files to S3 if provided
    const adharImageFiles = req.files?.["adharImage"] || [];
    const panImageFiles = req.files?.["panImage"] || [];
    const reraImageFiles = req.files?.["reraImage"] || [];

    let adharImageUrl = null;
    if (adharImageFiles.length > 0) {
      adharImageUrl = await uploadToS3(adharImageFiles[0]);
    }

    let panImageUrl = null;
    if (panImageFiles.length > 0) {
      panImageUrl = await uploadToS3(panImageFiles[0]);
    }

    let reraImageUrl = null;
    if (reraImageFiles.length > 0) {
      reraImageUrl = await uploadToS3(reraImageFiles[0]);
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
        if (dup.contact === contact)
          duplicateField = "Contact number already exists";
        else if (dup.email === email) duplicateField = "Email already exists";
        else if (dup.username === username)
          duplicateField = "Username already exists";

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
                if (updateErr)
                  console.error("Error updating status:", updateErr);
              },
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

                // 7 Send email only if password exists
                if (password) {
                  try {
                    await sendEmail(
                      email,
                      username,
                      password,
                      "Project Partner",
                      "https://projectpartner.reparv.in",
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
              },
            );
          },
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
    // 1 Fetch old images from DB
    const rows = await new Promise((resolve, reject) =>
      db.query(
        "SELECT adharimage, panimage, reraimage FROM projectpartner WHERE id = ?",
        [partnerid],
        (err, results) => (err ? reject(err) : resolve(results)),
      ),
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

    // 2 Upload new files to S3 if provided
    const adharFile = req.files?.["adharImage"]?.[0];
    const panFile = req.files?.["panImage"]?.[0];
    const reraFile = req.files?.["reraImage"]?.[0];

    let newAdharUrls = [...oldAdhar];
    let newPanUrls = [...oldPan];
    let newReraUrls = [...oldRera];

    if (adharFile) {
      const url = await uploadToS3(adharFile);
      for (const oldUrl of oldAdhar) await deleteFromS3(oldUrl);
      newAdharUrls = [url];
    }

    if (panFile) {
      const url = await uploadToS3(panFile);
      for (const oldUrl of oldPan) await deleteFromS3(oldUrl);
      newPanUrls = [url];
    }

    if (reraFile) {
      const url = await uploadToS3(reraFile);
      for (const oldUrl of oldRera) await deleteFromS3(oldUrl);
      newReraUrls = [url];
    }

    // 3 Build update query
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
      db.query(updateSql, updateValues, (err) =>
        err ? reject(err) : resolve(),
      ),
    );

    res.status(200).json({ message: "Project Partner updated successfully" });
  } catch (err) {
    console.error("Error updating Project Partner:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const updateBusinessDetails = async (req, res) => {
  try {
    const partnerid = Number(req.params.id);
    if (!Number.isInteger(partnerid) || partnerid <= 0) {
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
      !whatsappNumber?.toString().trim() ||
      !businessAddress?.trim() ||
      !businessState?.trim() ||
      !businessCity?.trim() ||
      !businessPincode?.toString().trim()
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Fetch existing business logo
    const [rows] = await db
      .promise()
      .query("SELECT businessLogo FROM projectpartner WHERE id = ?", [
        partnerid,
      ]);

    if (!rows?.length) {
      return res.status(404).json({ message: "Project Partner not found" });
    }

    const oldLogoUrl = rows[0]?.businessLogo || null;
    let newLogoUrl = oldLogoUrl;

    // Upload new logo if provided
    if (req.file) {
      let uploadFile = req.file;

      try {
        if (req.file.mimetype?.startsWith("image/")) {
          try {
            const compressedImage = await convertSingleImageToWebp(req.file);
            if (compressedImage) uploadFile = compressedImage;
          } catch (err) {
            console.error("Image compression failed, uploading original:", err);
          }
        }

        const uploadedUrl = await uploadToS3(uploadFile);

        if (oldLogoUrl) {
          deleteFromS3(oldLogoUrl).catch(() => {});
        }

        newLogoUrl = uploadedUrl;
      } catch (err) {
        console.error("S3 upload failed:", err);
        return res.status(500).json({
          message: "Business logo upload failed",
          error: err.message || err,
        });
      }
    }

    // Update DB
    const updateSql = `
      UPDATE projectpartner
      SET whatsappNumber = ?, businessAddress = ?, businessState = ?,
          businessCity = ?, businessPincode = ?, businessLogo = ?, updated_at = ?
      WHERE id = ?
    `;

    await db
      .promise()
      .query(updateSql, [
        whatsappNumber,
        businessAddress,
        businessState,
        businessCity,
        businessPincode,
        newLogoUrl,
        currentdate,
        partnerid,
      ]);

    return res.status(200).json({
      success: true,
      message: "Business details updated successfully",
      businessLogo: newLogoUrl,
    });
  } catch (error) {
    console.error("Error updating business details:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const {
    seoSlug,
    seoTitle,
    seoDescription,
    seoKeywords,
    twitterSite,
    twitterDescription,
  } = req.body;
  if (!seoTitle || !seoDescription || !seoKeywords) {
    return res.status(401).json({
      message: "Seo Title and Seo Description and Seo Keywords Are Required",
    });
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
      [
        seoSlug,
        seoTitle,
        seoDescription,
        seoKeywords,
        twitterSite,
        twitterDescription,
        Id,
      ],
      (err, result) => {
        if (err) {
          console.error("Error While Add Seo Details:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Seo Details Add successfully" });
      },
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
      },
    );
  });
};

//** Set free Partner */
export const setFreePartner = (req, res) => {
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
    if (result[0].freeProjectPartner === "Active") {
      status = "Inactive";
    } else {
      status = "Active";
    }
    //console.log(status);
    db.query(
      "UPDATE projectpartner SET freeProjectPartner = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Set Subscription Free Successfully" });
      },
    );
  });
};

export const updatePaymentId = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "Admin-recorded subscriptions are disabled. Project partners subscribe via the app: POST /api/subscription/payment/create-subscription (Razorpay Subscriptions checkout).",
  });
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
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
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
          },
        );
      },
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
              "https://projectpartner.reparv.in",
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
          },
        );
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
