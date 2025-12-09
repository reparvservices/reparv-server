import db from "../../config/dbconnect.js";
import moment from "moment";

export const getAll = (req, res) => {
  // STEP 1: Fetch properties + projectpartner
  const propertySql = `
    SELECT 
      pr.*,
      pr.propertycityid AS propertyCityId,
      pp.fullname AS projectPartnerName,
      pp.contact AS projectPartnerContact,
      pp.city AS projectPartnerCity,
      pp.id AS projectPartnerId,
      pp.created_at AS partnerCreatedAt,
      pp.updated_at AS partnerUpdatedAt
    FROM properties pr
    LEFT JOIN projectpartner pp
      ON pr.projectpartnerid = pp.id
    ORDER BY pr.propertyid DESC
  `;

  db.query(propertySql, async (err, propertyRows) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (propertyRows.length === 0) {
      return res.json([]); // Return empty array
    }

    // Process each property
    const finalData = await Promise.all(
      propertyRows.map((property) => {
        return new Promise((resolve) => {
          // If no project partner → send property only
          if (!property.projectPartnerId) {
            return resolve({
              ...property,
              projectPartnerName: null,
              projectPartnerContact: null,
              projectPartnerCity: null,
              planName: null,
              planId: null,
              startDate: null,
              endDate: null,
              subscriptionCreatedAt: null,
              created_at: moment(property.created_at).format(
                "DD MMM YYYY | hh:mm A"
              ),
              updated_at: moment(property.updated_at).format(
                "DD MMM YYYY | hh:mm A"
              ),
            });
          }

          // STEP 2: Fetch subscription
          const subSql = `
            SELECT 
              s.plan,
              s.planId,
              s.start_date AS startDate,
              s.end_date AS endDate,
              s.created_at AS subscriptionCreatedAt
            FROM subscriptions s
            WHERE s.projectpartnerid = ?
            ORDER BY s.created_at DESC
            LIMIT 1
          `;

          db.query(subSql, [property.projectPartnerId], (err2, subResult) => {
            if (err2 || subResult.length === 0) {
              // No subscription → return property + partner only
              return resolve({
                ...property,
                planName: null,
                planId: null,
                startDate: null,
                endDate: null,
                subscriptionCreatedAt: null,
                created_at: moment(property.created_at).format(
                  "DD MMM YYYY | hh:mm A"
                ),
                updated_at: moment(property.updated_at).format(
                  "DD MMM YYYY | hh:mm A"
                ),
                partnerCreatedAt: property.partnerCreatedAt
                  ? moment(property.partnerCreatedAt).format(
                      "DD MMM YYYY | hh:mm A"
                    )
                  : null,
                partnerUpdatedAt: property.partnerUpdatedAt
                  ? moment(property.partnerUpdatedAt).format(
                      "DD MMM YYYY | hh:mm A"
                    )
                  : null,
              });
            }

            const subscription = subResult[0];

            // STEP 3: Fetch planName
            db.query(
              `SELECT planName FROM subscriptionPricing WHERE id = ? LIMIT 1`,
              [subscription.planId],
              (err3, planResult) => {
                const planName =
                  !err3 && planResult.length > 0
                    ? planResult[0].planName
                    : null;

                resolve({
                  ...property,
                  ...subscription,
                  planName,
                  startDate: subscription.startDate
                    ? moment(subscription.startDate).format(
                        "DD MMM YYYY | hh:mm A"
                      )
                    : null,
                  endDate: subscription.endDate
                    ? moment(subscription.endDate).format(
                        "DD MMM YYYY | hh:mm A"
                      )
                    : null,
                  subscriptionCreatedAt: subscription.subscriptionCreatedAt
                    ? moment(subscription.subscriptionCreatedAt).format(
                        "DD MMM YYYY | hh:mm A"
                      )
                    : null,
                  created_at: moment(property.created_at).format(
                    "DD MMM YYYY | hh:mm A"
                  ),
                  updated_at: moment(property.updated_at).format(
                    "DD MMM YYYY | hh:mm A"
                  ),
                  partnerCreatedAt: property.partnerCreatedAt
                    ? moment(property.partnerCreatedAt).format(
                        "DD MMM YYYY | hh:mm A"
                      )
                    : null,
                  partnerUpdatedAt: property.partnerUpdatedAt
                    ? moment(property.partnerUpdatedAt).format(
                        "DD MMM YYYY | hh:mm A"
                      )
                    : null,
                });
              }
            );
          });
        });
      })
    );

    res.json(finalData);
  });
};

// **Fetch All Active**
export const getAllActive = (req, res) => {
  const sql = `
    SELECT 
      a.*, 
      p.fullname AS projectPartnerName,
      p.contact AS projectPartnerContact
    FROM adsmanager a
    LEFT JOIN projectpartner p 
      ON a.projectPartnerId = p.id
    WHERE a.status = 'Active'
    ORDER BY a.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      startDate: moment(row.startDate).format("DD MMM YYYY | hh:mm A"),
      endDate: moment(row.endDate).format("DD MMM YYYY | hh:mm A"),
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);

  const sql = `
    SELECT 
      a.*, 
      p.fullname AS projectPartnerName,
      p.contact AS projectPartnerContact
    FROM adsmanager a
    LEFT JOIN projectpartner p 
      ON a.projectPartnerId = p.id
    WHERE a.id = ?
    LIMIT 1
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Ads Manager not found" });
    }

    const row = result[0];

    const formatted = {
      ...row,
      startDate: moment(row.startDate).format("DD MMM YYYY | hh:mm A"),
      endDate: moment(row.endDate).format("DD MMM YYYY | hh:mm A"),
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    };

    res.json(formatted);
  });
};

export const fetchProjectPartnerData = (req, res) => {
  const id = req.params.id;

  if (!id) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  const sql = `
    SELECT 
      p.*, 
      s.plan,
      s.planId,
      s.start_date AS startDate,
      s.end_date AS endDate,
      s.created_at AS subscriptionCreatedAt
    FROM projectpartner p
    LEFT JOIN subscriptions s
      ON p.id = s.projectpartnerid
    WHERE p.id = ? AND p.status = 'Active'
    ORDER BY s.created_at DESC
    LIMIT 1;
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error fetching partner data:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "No project partner found" });
    }

    const row = result[0];

    // If no subscription found, return partner data directly
    if (!row.planId) {
      const formatted = {
        ...row,
        planName: null,
        startDate: null,
        endDate: null,
        subscriptionCreatedAt: null,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
      };
      return res.json(formatted);
    }

    // Fetch planName from subscriptionPricing
    const planQuery = `SELECT planName FROM subscriptionPricing WHERE id = ? LIMIT 1`;

    db.query(planQuery, [row.planId], (err2, planResult) => {
      if (err2) {
        console.error("Error fetching planName:", err2);
        return res.status(500).json({ message: "Database error", error: err2 });
      }

      const planName = planResult.length > 0 ? planResult[0].planName : null;

      const formatted = {
        ...row,
        planName,
        startDate: row.startDate
          ? moment(row.startDate).format("DD MMM YYYY | hh:mm A")
          : null,
        endDate: row.endDate
          ? moment(row.endDate).format("DD MMM YYYY | hh:mm A")
          : null,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
        subscriptionCreatedAt: row.subscriptionCreatedAt
          ? moment(row.subscriptionCreatedAt).format("DD MMM YYYY | hh:mm A")
          : null,
      };

      res.json(formatted);
    });
  });
};

// **Fetch Unique Plan Names**
export const getUniqueSubscriptionPlans = (req, res) => {
  const sql = `
    SELECT DISTINCT planName
    FROM subscriptionPricing
    WHERE planName IS NOT NULL AND planName != ''
    ORDER BY planName ASC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching plan names:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const plans = result.map((row) => row.planName);

    res.json(plans);
  });
};

// **Fetch Unique Cities**
export const getCities = (req, res) => {
  const sql = `
    SELECT DISTINCT city
    FROM properties
    WHERE city IS NOT NULL AND city != ''
    ORDER BY city ASC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching cities:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const cities = result.map((row) => row.city);

    res.json(cities);
  });
};

// **Fetch Project Partner Based on City**
export const getProjectPartnerByCity = (req, res) => {
  const { city } = req.params;

  let sql = `
    SELECT DISTINCT 
      pp.id,
      pp.fullname,
      pp.contact
    FROM projectpartner pp
    LEFT JOIN properties p 
      ON pp.id = p.projectpartnerid
  `;

  const params = [];

  if (city && city !== "All") {
    sql += ` WHERE p.city = ? `;
    params.push(city);
  }

  sql += ` ORDER BY pp.fullname ASC `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching project partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.json(result);
  });
};

// **Fetch Properties Based on City + Project Partner (POST)**
export const getPropertiesByProject = (req, res) => {
  const { projectPartnerId, city } = req.body;

  let sql = `
    SELECT 
      p.*,
      pp.fullname,
      pp.contact
    FROM properties p
    LEFT JOIN projectpartner pp 
      ON p.projectpartnerid = pp.id
    WHERE 1=1
  `;

  const params = [];

  // Filter by city (if selected)
  if (city && city !== "All") {
    sql += ` AND p.city = ? `;
    params.push(city);
  }

  // Filter by project partner (if selected)
  if (projectPartnerId && projectPartnerId !== "All") {
    sql += ` AND p.projectpartnerid = ? `;
    params.push(projectPartnerId);
  }

  sql += ` ORDER BY p.created_at DESC `;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
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

export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyCityId,
    projectPartnerId,
    planId,
    planName,
    startDate,
    endDate,
    state,
    city,
  } = req.body;

  if (
    !projectPartnerId ||
    !planId ||
    !planName ||
    !startDate ||
    !endDate ||
    !state ||
    !city
  ) {
    return res.status(400).json({ message: "All Fields are Required" });
  }

  // Convert from "12 Jan 2025 | 07:59 PM" → "2025-01-12 19:59:00"
  const formattedStartDate = moment(startDate, "DD MMM YYYY | hh:mm A").format(
    "YYYY-MM-DD HH:mm:ss"
  );
  const formattedEndDate = moment(endDate, "DD MMM YYYY | hh:mm A").format(
    "YYYY-MM-DD HH:mm:ss"
  );

  if (!formattedStartDate || !formattedEndDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  const sql = `
      INSERT INTO adsmanager 
      (propertyCityId, projectPartnerId, planId, planName, startDate, endDate, state, city, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      propertyCityId || null,
      projectPartnerId,
      planId,
      planName,
      formattedStartDate,
      formattedEndDate,
      state,
      city,
      currentdate,
      currentdate,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting Ads Manager:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Ads Manager added successfully",
        id: result.insertId,
      });
    }
  );
};

export const edit = (req, res) => {
  const Id = req.params.id;
  if (!Id) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyCityId,
    projectPartnerId,
    planId,
    planName,
    startDate,
    endDate,
    state,
    city,
  } = req.body;

  if (
    !projectPartnerId ||
    !planId ||
    !planName ||
    !startDate ||
    !endDate ||
    !state ||
    !city
  ) {
    return res.status(400).json({ message: "All Fields are Required" });
  }

  // Convert date string "12 Jan 2025 | 07:59 PM" → MySQL format
  const formattedStartDate = moment(startDate, "DD MMM YYYY | hh:mm A").format(
    "YYYY-MM-DD HH:mm:ss"
  );
  const formattedEndDate = moment(endDate, "DD MMM YYYY | hh:mm A").format(
    "YYYY-MM-DD HH:mm:ss"
  );

  if (!formattedStartDate || !formattedEndDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  // Build update SQL
  const updateSql = `
    UPDATE adsmanager 
    SET 
      propertyCityId = ?, 
      projectPartnerId = ?, 
      planId = ?, 
      planName = ?, 
      startDate = ?, 
      endDate = ?, 
      state = ?, 
      city = ?, 
      updated_at = ?
    WHERE id = ?
  `;

  const updateValues = [
    propertyCityId || null,
    projectPartnerId,
    planId,
    planName,
    formattedStartDate,
    formattedEndDate,
    state,
    city,
    currentdate,
    Id,
  ];

  db.query(updateSql, updateValues, (err, result) => {
    if (err) {
      console.error("Error updating Ads Manager:", err);
      return res
        .status(500)
        .json({ message: "Database error during update", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Ads Manager not found" });
    }

    return res.status(200).json({
      message: "Ads Manager updated successfully",
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM adsmanager WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE adsmanager SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "status change successfully" });
      }
    );
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM adsmanager WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Ads Manager not found" });
    }

    db.query("DELETE FROM adsmanager WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Ads Manager deleted successfully" });
    });
  });
};
