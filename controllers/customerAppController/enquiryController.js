import moment from "moment";
import db from "../../config/dbconnect.js";

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const { user_id, propertyid, fullname, phone } = req.body;
  console.log(req.body);

  //  Required field validation (visitdate removed)
  if (!user_id || !propertyid || !fullname || !phone) {
    return res
      .status(400)
      .json({ message: "All fields except visitdate are required" });
  }

  //  Fetch property category
  const categorySQL = `SELECT propertyCategory FROM properties WHERE propertyid = ?`;

  db.query(categorySQL, [propertyid], (err, results) => {
    if (err) {
      console.error("Error fetching property category:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyCategory = results[0].propertyCategory;

    //  Insert enquiry
    const insertSQL = `
      INSERT INTO enquirers (
      customerid,
        propertyid,
        category,
        customer,
        contact,
        source,
        updated_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertSQL,
      [
        user_id,
        propertyid,
        propertyCategory,
        fullname,
        phone,
        "Onsite",
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting enquiry:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        //  Remove from wishlist if exists
        const deleteWishlistSql = `
          DELETE FROM user_property_wishlist 
          WHERE user_id = ? AND property_id = ?
        `;

        db.query(deleteWishlistSql, [user_id, propertyid], (delErr) => {
          if (delErr) {
            console.error("Error auto-removing from wishlist:", delErr);
            // Don't block success if wishlist delete fails
          }

          //  Final success response
          res.status(201).json({
            message: "Enquiry added successfully",
            Id: result.insertId,
            propertyCategory,
          });
        });
      }
    );
  });
};

export const getAll = (req, res) => {
  const user_id = req.params.id;
  console.log(user_id, "userid");
  // Validate contact
  if (!user_id || !user_id.trim()) {
    return res.status(400).json({
      message: "Please provide a valid user id",
    });
  }
  const sql = `
    SELECT enquirers.*,properties.propertyName,properties.seoSlug, properties.frontView, properties.totalOfferPrice,properties.totalSalesPrice,properties.emi,properties.propertyCategory,
    properties.city,properties.location,properties.propertyApprovedBy,properties.distanceFromCityCenter,
    territorypartner.fullname AS territoryName,
    territorypartner.contact AS territoryContact
    FROM enquirers 
    LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
    WHERE enquirers.customerid = ? 
    ORDER BY enquirers.enquirersid DESC`;

  db.query(sql, [user_id.trim()], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.status(200).json({
      message: "Fetched successfully",
      data: formatted,
    });
  });
};

//Fetch only Visit Enquiry
export const getVisitsOnly = (req, res) => {
  const { contact, fullname, userid } = req.query;

  //Validate required query parameters
  if (!contact) {
    return res.status(400).json({
      message: "Please provide contact !",
    });
  }

  //  Get visit records with visitdate and status
  const sql = `
    SELECT 
      enquirers.*, 
     properties.propertyName,properties.seoSlug, properties.frontView, properties.totalOfferPrice,properties.totalSalesPrice,properties.emi,properties.propertyCategory,
    properties.city,properties.location,properties.propertyApprovedBy,properties.distanceFromCityCenter
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    WHERE enquirers.customerid = ? 
      AND enquirers.visitdate IS NOT NULL 
      AND enquirers.status = 'Visit Scheduled'
    ORDER BY enquirers.enquirersid DESC
  `;

  db.query(sql, [userid], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    //Format created_at and updated_at
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    return res.json({
      message: "Visits fetched successfully",
      data: formatted,
    });
  });
};

export const getBookingOnly = (req, res) => {
  const { contact, userid } = req.query;
  console.log(contact);
  if (!userid) {
    console.log("Invalid User Id: ");
    return res.status(400).json({ message: "Invalid User Id" });
  }
  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView,
      properties.seoSlug,
      properties.commissionType,
      properties.commissionAmount,
      properties.commissionPercentage,
      territorypartner.fullname AS territoryName, 
      territorypartner.contact AS territoryContact,
      propertyfollowup.*
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON enquirers.territorypartnerid = territorypartner.id
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token' AND enquirers.customerid = ?
    ORDER BY propertyfollowup.created_at DESC
  `;

  db.query(sql, [userid], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    return res.json(formatted);
  });
};

// export const addLeadNotification = (req, res) => {
//   try {
//     const { fullname, contact, message } = req.body;
//     const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

//     // Validation
//     if (!fullname || !contact || !message) {
//       return res.status(400).json({
//         message: "Full name, contact and message are required.",
//         status: false,
//       });
//     }

//     // Insert Query
//     const query = `
//       INSERT INTO userenquiry
//       (fullname, contact, message)
//       VALUES (?, ?, ?)
//     `;

//     db.query(
//       query,
//       [fullname, contact, message],
//       (err, result) => {
//         if (err) {
//           console.log("Lead Notify Insert Error:", err);
//           return res.status(500).json({
//             message: "Database Error",
//             status: false,
//             error: err,
//           });
//         }

//         return res.status(200).json({
//           message: "Notification request saved successfully!",
//           status: true,
//         });
//       }
//     );
//   } catch (error) {
//     console.log("Lead Notify Error:", error);
//     return res.status(500).json({
//       message: "Internal Server Error",
//       status: false,
//       error,
//     });
//   }
// };

export const addLeadNotification = (req, res) => {
  try {
    const { fullname, contact, message } = req.body;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    // Validation
    if (!fullname || !contact || !message) {
      return res.status(400).json({
        message: "Full name, contact and message are required.",
        status: false,
      });
    }

    // Insert Query
    const query = `
      INSERT INTO userenquiry
      (fullname, contact, message, created_at,updated_at)
      VALUES (?, ?, ?, ?,?)
    `;

    db.query(
      query,
      [fullname, contact, message, currentdate, currentdate],
      (err, result) => {
        if (err) {
          console.log("Lead Notify Insert Error:", err);
          return res.status(500).json({
            message: "Database Error",
            status: false,
            error: err,
          });
        }

        return res.status(200).json({
          message: "Notification request saved successfully!",
          status: true,
        });
      }
    );
  } catch (error) {
    console.log("Lead Notify Error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error,
    });
  }
};

export const getTotalEnquiries = (req, res) => {
  const { propertyid } = req.query;

  if (!propertyid) {
    return res.status(400).json({
      message: "Property ID is required",
    });
  }

  const sqlCount = `SELECT COUNT(*) AS totalEnquiries FROM enquirers WHERE propertyid = ?`;
  const sqlList = `SELECT * FROM enquirers WHERE propertyid = ? ORDER BY enquirersid DESC`;

  db.query(sqlCount, [propertyid], (err, countResult) => {
    if (err) {
      console.error("Database Count Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    db.query(sqlList, [propertyid], (err2, listResult) => {
      if (err2) {
        console.error("Database List Error:", err2);
        return res.status(500).json({ message: "Database error" });
      }

      res.status(200).json({
        message: "Fetched successfully",
        totalEnquiries: countResult[0].totalEnquiries,
        enquiries: listResult, // returning full enquiry list
      });
    });
  });
};

export const addVisitor = (req, res) => {
  const { propertyid, source } = req.body;

  if (!propertyid) {
    return res.status(400).json({ message: "propertyid is required" });
  }

  // Step 1: Check property exists
  const checkPropertySql = `
    SELECT propertyid FROM properties WHERE propertyid = ?
  `;

  db.query(checkPropertySql, [propertyid], (err, propertyResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (propertyResult.length === 0) {
      return res.status(404).json({ message: "Property does not exist" });
    }

    // Step 2: Check analytics record
    const checkAnalyticsSql = `
      SELECT id FROM property_analytics WHERE property_id = ?
    `;

    db.query(checkAnalyticsSql, [propertyid], (err2, results) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: "DB error" });
      }

      const isWhatsapp = source === "whatsapp" ? 1 : 0;
      const isCall = source === "call" ? 1 : 0;
      const isShare = source === "share" ? 1 : 0;

      if (results.length > 0) {
        //  UPDATE ONLY (row already exists)
        const updateSql = `
          UPDATE property_analytics
          SET
            views = views + 1,
            whatsapp_enquiry = whatsapp_enquiry + ?,
            calls = calls + ? ,
            share = share + ?
          WHERE property_id = ?
        `;

        db.query(
          updateSql,
          [isWhatsapp, isCall, isShare, propertyid],
          (err3) => {
            if (err3) {
              console.error(err3);
              return res.status(500).json({ message: "DB error" });
            }

            res.json({
              message: "Analytics updated",
              source: source || "direct",
            });
          }
        );
      } else {
        //  INSERT ONLY ONCE (first visit)
        const insertSql = `
          INSERT INTO property_analytics
            (property_id, views, whatsapp_enquiry, calls,share)
          VALUES (?, 1, ?, ?,?)
        `;

        db.query(
          insertSql,
          [propertyid, isWhatsapp, isCall, isShare],
          (err4) => {
            if (err4) {
              console.error(err4);
              return res.status(500).json({ message: "DB error" });
            }

            res.json({
              message: "Analytics created",
              source: source || "direct",
            });
          }
        );
      }
    });
  });
};

export const getTotalVisitors = (req, res) => {
  const { propertyid } = req.query;

  if (!propertyid) {
    return res.status(400).json({ message: "propertyid is required" });
  }

  const sql = `
    SELECT 
      p.propertyid,

      COALESCE(pa.views, 0) AS views,
      COALESCE(pa.calls, 0) AS calls,
      COALESCE(pa.share, 0) AS share,
      COALESCE(pa.whatsapp_enquiry, 0) AS whatsapp_enquiry

    FROM properties p
    LEFT JOIN property_analytics pa 
      ON pa.property_id = p.propertyid
    WHERE p.propertyid = ?
  `;

  db.query(sql, [propertyid], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property does not exist" });
    }

    res.json({
      propertyid: result[0].propertyid,
      totalVisitors: result[0].views,
      calls: result[0].calls,
      share: result[0].share,
      whatsapp_enquiry: result[0].whatsapp_enquiry,
    });
  });
};

export const getOwnerEnquiries = (req, res) => {
  const id = req.params.id;

  const sql = `
    SELECT 
      e.enquirersid,
      e.customer,
      e.contact,
      e.message,
      e.created_at,
      p.propertyid,
      p.propertyName,
      p.city
    FROM enquirers e
    JOIN properties p ON e.propertyid = p.propertyid
    WHERE p.customerid = ?
    ORDER BY e.created_at DESC
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "DB error", err });
    }

    res.status(200).json(result);
  });
};
