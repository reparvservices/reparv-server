import db from "#db";
import moment from "moment-timezone";
import { sanitize } from "#utils/sanitize.js";

// Fetch All Enquiries
export const getAll = (req, res) => {
  const userId = req.territoryUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const enquirySource = req.params.source;
  if (!enquirySource) {
    return res.status(401).json({ message: "Enquiry Source Not Selected" });
  }

  let sql;
  let params = [userId, userId]; // for default query

  if (enquirySource === "Enquiry") {
    sql = `SELECT enquirers.*, 
    properties.frontView, properties.seoSlug, properties.commissionAmount
    FROM enquirers 
    LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid 
    WHERE enquirers.status != 'Token' AND enquirers.territorypartnerid = ?
    ORDER BY enquirersid DESC
    `;
    params = [userId];
  } else if (enquirySource === "Digital Broker") {
    sql = `SELECT enquirers.*, 
    properties.frontView, properties.seoSlug, properties.commissionAmount
    FROM enquirers 
    LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid 
    WHERE enquirers.status != 'Token' AND enquirers.territorypartnerid = ?
      AND (enquirers.salesbroker IS NOT NULL OR enquirers.territorybroker IS NOT NULL OR enquirers.projectbroker IS NOT NULL)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } else {
    sql = `SELECT enquirers.*, 
    properties.frontView, properties.seoSlug, properties.commissionAmount
    FROM enquirers 
    LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid 
    WHERE enquirers.status != 'Token' AND enquirers.territorypartnerid = ? OR enquirers.territorybroker = ?
    ORDER BY enquirersid DESC
    `;
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching Enquirers:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};


// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = `SELECT enquirers.*, territoryenquiry.visitdate AS visitDate,
               territoryenquiry.teid, territoryenquiry.followup, territoryenquiry.status AS territoryStatus 
               FROM enquirers LEFT JOIN territoryenquiry 
               ON territoryenquiry.enquirerid = enquirers.enquirersid 
               WHERE enquirersid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }
    res.json(result[0]);
  });
};

export const getProperties = (req, res) => {
  const territoryUserId = req.territoryUser?.id; // make sure this comes from auth middleware

  if (!territoryUserId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please Login Again." });
  }

  const { minbudget, maxbudget, state, city, category } = req.body;

  // Basic validation
  if (!state || !city || !category) {
    return res.status(400).json({
      success: false,
      message: "State, City, and Category are required.",
    });
  }

  // Parse budgets safely
  const minBudgetValue = parseFloat(minbudget) || 0;
  const maxBudgetValue = parseFloat(maxbudget) || Number.MAX_SAFE_INTEGER;

  // Step 1: Fetch projectpartnerid of the logged-in Territory Partner
  const fetchTerritoryQuery =
    "SELECT projectpartnerid FROM territorypartner WHERE id = ?";

  db.query(fetchTerritoryQuery, [territoryUserId], (err, territoryResult) => {
    if (err) {
      console.error("Error fetching Territory:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (salesResult.length === 0) {
      return res.status(404).json({ message: "Territory Partner not found" });
    }

    const projectpartnerid = territoryResult[0].projectpartnerid;

    // Step 2: Build properties query
    let sql = `
      SELECT * FROM properties
      WHERE CAST(totalOfferPrice AS DECIMAL(15,2)) BETWEEN ? AND ?
        AND propertyCategory = ?
        AND state = ?
        AND city = ?
    `;
    const params = [minBudgetValue, maxBudgetValue, category, state, city];

    // If Territory is linked to a projectpartner, filter properties by that partner
    if (projectpartnerid) {
      sql += " AND projectpartnerid = ?";
      params.push(projectpartnerid);
    }

    sql += " ORDER BY created_at DESC";

    // Step 3: Execute final query
    db.query(sql, params, (err, propertyResults) => {
      if (err) {
        console.error("Error fetching properties:", err);
        return res.status(500).json({
          success: false,
          message: "Database error while fetching properties.",
          error: err,
        });
      }

      if (!propertyResults || propertyResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No properties found based on your filters.",
        });
      }

      res.json({
        success: true,
        message: "Properties fetched successfully.",
        data: propertyResults,
      });
    });
  });
};

export const acceptEnquiry = (req, res) => {
  const partnerId = req.territoryUser?.id;

  if (!partnerId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please login again." });
  }

  const enquiryId = parseInt(req.params.id);
  if (isNaN(enquiryId)) {
    return res.status(400).json({ message: "Invalid Enquiry ID." });
  }

  // Check if enquiry exists
  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [enquiryId],
    (err, results) => {
      if (err) {
        console.error("Database error while checking enquiry:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Enquiry not found." });
      }

      // Update enquiry status
      db.query(
        `UPDATE enquirers 
         SET status = 'Visit Scheduled', territorystatus = 'Accepted', territorypartnerid = ? 
         WHERE enquirersid = ?`,
        [partnerId, enquiryId],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Error updating enquiry:", updateErr);
            return res
              .status(500)
              .json({ message: "Failed to accept enquiry", error: updateErr });
          }

          return res.status(200).json({
            message: "Enquiry accepted successfully.",
            enquiryId,
            territoryPartnerId: partnerId,
            territorystatus: "Accepted",
            status: "Visit Scheduled",
          });
        }
      );
    }
  );
};

export const rejectEnquiry = (req, res) => {
  const enquiryId = parseInt(req.params.id);

  if (isNaN(enquiryId)) {
    return res.status(400).json({ message: "Invalid Enquiry ID." });
  }

  // Check if enquiry exists
  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [enquiryId],
    (err, results) => {
      if (err) {
        console.error("Database error while checking enquiry:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Enquiry not found." });
      }

      // Update to rejected
      db.query(
        `UPDATE enquirers 
         SET territorystatus = 'Rejected', territorypartnerid = NULL 
         WHERE enquirersid = ?`,
        [enquiryId],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Error updating enquiry:", updateErr);
            return res.status(500).json({
              message: "Failed to reject enquiry",
              error: updateErr,
            });
          }

          return res.status(200).json({
            message: "Enquiry rejected successfully.",
            enquiryId,
            territorystatus: "Rejected",
          });
        }
      );
    }
  );
};

/* Change status */
export const status = (req, res) => {
  const { enquiryStatus } = req.body;
  if (enquiryStatus === "") {
    return res.status(400).json({ message: "Please Select Status!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      db.query(
        "UPDATE enquirers SET status = ? WHERE enquirersid = ?",
        [enquiryStatus, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property status change successfully" });
        }
      );
    }
  );
};

export const followUpOld = (req, res) => {
  const { followUpRemark, territoryId } = req.body;
  if (!followUpRemark || !territoryId) {
    return res.status(400).json({ message: "All Fields are Required!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      const updateSQL = `UPDATE territoryenquiry SET followup = ? WHERE teid = ?`;

      db.query(
        updateSQL,
        [followUpRemark, territoryId],
        (err, insertResult) => {
          if (err) {
            console.error("Error inserting visit:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(201).json({
            message: "Follow Up remark added successfully",
            Id: insertResult.insertId,
          });
        }
      );
    }
  );
};

export const followUp = (req, res) => {
  const { followUpRemark, territoryId, visitDate } = req.body;

  // Validate required fields (visitDate is optional)
  if (!followUpRemark || !territoryId) {
    return res
      .status(400)
      .json({ message: "followUpRemark and territoryId are required!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      // Format dates to remove time portion
      let formattedVisitDate = null;

      if (visitDate && visitDate.trim() !== "") {
        // Check if it's a valid date
        if (
          moment(visitDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
        ) {
          formattedVisitDate = moment(visitDate).format("YYYY-MM-DD");
        } else {
          formattedVisitDate = null; // fallback instead of "Invalid date"
        }
      }

      // Build SQL dynamically depending on whether visitDate is provided
      let updateSQL;
      let values;

      if (visitDate) {
        updateSQL =
          "UPDATE territoryenquiry SET followup = ?, visitdate = ? WHERE teid = ?";
        values = [followUpRemark, sanitize(formattedVisitDate), territoryId];
      } else {
        updateSQL = "UPDATE territoryenquiry SET followup = ? WHERE teid = ?";
        values = [followUpRemark, territoryId];
      }

      db.query(updateSQL, values, (err, updateResult) => {
        if (err) {
          console.error("Error updating follow-up:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: visitDate
            ? "Follow Up remark and visit date updated successfully"
            : "Follow Up remark updated successfully",
          affectedRows: updateResult.affectedRows,
        });
      });
    }
  );
};
