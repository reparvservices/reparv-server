import moment from "moment-timezone";
import db from "#db";
import fs from "fs";
import path from "path";
import { uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";

function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}
export const addInWishList = (req, res) => {
  try {
    const { user_id, property_id } = req.body;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    // Input validation
    if (!user_id || !property_id) {
      return res.status(400).json({ message: "Login Please !" });
    }

    // Check if already exists
    const checkSql = `SELECT * FROM user_property_wishlist WHERE guest_user_id = ? AND property_id = ?`;
    db.query(checkSql, [user_id, property_id], (checkErr, checkResult) => {
      if (checkErr) {
        console.error("Error checking wishlist:", checkErr);
        return res
          .status(500)
          .json({ message: "Database error", error: checkErr });
      }

      if (checkResult.length > 0) {
        return res.status(409).json({ message: "Already added to wishlist!" });
      }

      // If not exists, then insert updated_at, created_at
      const insertSql = `INSERT INTO user_property_wishlist (guest_user_id, property_id,updated_at,created_at) VALUES (?, ?,?,?)`;
      db.query(
        insertSql,
        [user_id, property_id, currentdate, currentdate],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error adding to wishlist:", insertErr);
            return res
              .status(500)
              .json({ message: "Database error", error: insertErr });
          }

          res.status(201).json({ message: "Successfully Added!" });
        },
      );
    });
  } catch (error) {
    console.error("Unexpected error in addInWishList:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const getUserWishlist = (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ message: "User ID is required!" });
    }

    const sql = `
      SELECT p.*
      FROM user_property_wishlist uw
      INNER JOIN properties p ON uw.property_id = p.propertyid
      WHERE uw.guest_user_id = ?
    `;

    db.query(sql, [user_id], (err, result) => {
      if (err) {
        console.error("Error fetching wishlist:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({
        message: "Wishlist fetched successfully!",
        data: result,
      });
    });
  } catch (error) {
    console.error("Unexpected error in getUserWishlist:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const removeFromWishlist = (req, res) => {
  const { userId, propertyId } = req.params;
  console.log(userId, "", propertyId);
  if (!userId || !propertyId) {
    return res
      .status(400)
      .json({ success: false, message: "userId and propertyId are required" });
  }

  const query = `DELETE FROM user_property_wishlist WHERE guest_user_id = ? AND property_id = ?`;

  db.query(query, [userId, propertyId], (err, result) => {
    if (err) {
      console.error("removeFromWishlist DB error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Wishlist item not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Property removed from wishlist",
    });
  });
};

// **Fetch All Properties**
export const getAll = (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  const sql = `
    SELECT properties.* 
    FROM properties
    WHERE properties.customerid = ?
       OR properties.guestUserId = ?
    ORDER BY properties.propertyid DESC
  `;

  db.query(sql, [userId, userId], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
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

// **Fetch Single Property by ID (with Likes Count)**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT 
      properties.*,
      builders.company_name,
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN builders
      ON builders.builderid = properties.builderid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.propertyid = ?

    GROUP BY properties.propertyid
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    if (!result.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Safely parse JSON fields
    const row = result[0];
    let parsedType = [];

    try {
      parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
    } catch (e) {
      console.warn("Invalid JSON in propertyType:", row.propertyType);
    }

    res.json({
      ...row,
      propertyType: parsedType,
    });
  });
};

/* ---------- ADD PROPERTY ---------- */
export const addProperty = async (req, res) => {
  try {
    const {
      property_type,
      bhk_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      customerid,
      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
    } = req.body;

    console.log("[addProperty] body:", req.body);

    if (!property_name || !customerid) {
      return res
        .status(400)
        .json({ success: false, message: "Required fields missing" });
    }

    /* ---------- DUPLICATE CHECK ---------- */
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      (selectErr, selectResult) => {
        // ← removed async
        if (selectErr) {
          console.error("[addProperty] SELECT error:", selectErr); // ← log real error
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }

        if (selectResult.length > 0) {
          return res
            .status(409)
            .json({ success: false, message: "Property name already exists" });
        }

        /* ---------- PARSE AREAS ---------- */
        let parsedAreas = [];
        try {
          if (typeof areas === "string") parsedAreas = JSON.parse(areas);
          else if (Array.isArray(areas)) parsedAreas = areas;
        } catch (e) {
          console.warn("[addProperty] Invalid areas JSON:", areas);
        }

        console.log("[addProperty] parsedAreas:", parsedAreas); // ← debug

        const FARM_TYPES = ["FarmLand", "FarmHouse"];
        const isFarm = FARM_TYPES.includes(property_type);

        let builtUpArea = null;
        let carpetArea = null;

        if (isFarm) {
          const landEntry = parsedAreas.find((a) =>
            a?.label?.toLowerCase().includes("land"),
          );
          if (landEntry) {
            builtUpArea = `${landEntry.value} ${landEntry.unit || "Acre"}`;
          }
        } else {
          builtUpArea =
            parsedAreas.find((a) =>
              a?.label?.toLowerCase().includes("built-up"),
            )?.value || null;
          carpetArea =
            parsedAreas.find((a) => a?.label?.toLowerCase().includes("carpet"))
              ?.value || null;
        }

        console.log(
          "[addProperty] builtUpArea:",
          builtUpArea,
          "| carpetArea:",
          carpetArea,
        ); // ← debug

        /* ---------- IMAGE HELPER ---------- */
        const imgJson = (v) =>
          v ? JSON.stringify(Array.isArray(v) ? v : [v]) : null;

        /* ---------- INSERT ---------- */
        const insertSQL = `
          INSERT INTO properties (
            customerid, guestUserId, propertyType, propertyCategory, propertyName,
            totalSalesPrice, totalOfferPrice, contact, projectBy,
            state, city, address, builtUpArea, carpetArea,
            frontView, sideView, kitchenView, hallView,
            bedroomView, bathroomView, balconyView,
            nearestLandmark, developedAmenities,
            seoSlug, created_at, updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
        `;

        const values = [
          customerid,
          customerid,
          bhk_type || null,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          builtUpArea,
          carpetArea,
          imgJson(frontView),
          imgJson(sideView),
          imgJson(kitchenView),
          imgJson(hallView),
          imgJson(bedroomView),
          imgJson(bathroomView),
          imgJson(balconyView),
          imgJson(nearestLandmark),
          imgJson(developedAmenities),
          toSlug(property_name),
        ];

        console.log("[addProperty] INSERT values:", values); // ← debug
        console.log("[addProperty] value count:", values.length); // must be 24

        db.query(insertSQL, values, (insertErr, insertResult) => {
          if (insertErr) {
            console.error("[addProperty] INSERT error:", insertErr); // ← THE key log
            return res.status(500).json({
              success: false,
              message: "Insert failed",
              detail: insertErr.message,
            });
          }

          console.log(
            "[addProperty] Inserted propertyid:",
            insertResult.insertId,
          );
          return res.status(201).json({
            success: true,
            message: "Property added successfully",
            propertyid: insertResult.insertId,
          });
        });
      },
    );
  } catch (error) {
    console.error("[addProperty] Outer error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const { propertyid } = req.params;

    if (!propertyid) {
      return res.status(400).json({ message: "Property ID is required" });
    }

    const {
      property_type,
      bhk_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
    } = req.body;

    console.log("[updateProperty] body:", req.body);

    // ── Image fields — only pick ones actually sent ──
    const IMAGE_KEYS = [
      "frontView",
      "sideView",
      "kitchenView",
      "hallView",
      "bedroomView",
      "bathroomView",
      "balconyView",
      "nearestLandmark",
      "developedAmenities",
    ];

    const sentImages = {};
    IMAGE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const val = req.body[key];
        sentImages[key] = val
          ? JSON.stringify(Array.isArray(val) ? val : [val])
          : null;
      }
    });

    /* ── Duplicate name check ── */
    db.query(
      `SELECT propertyid FROM properties WHERE propertyName = ? AND propertyid != ?`,
      [property_name, propertyid],
      (err, exists) => {
        // ← removed async (not needed)
        if (err) {
          console.error("[updateProperty] SELECT error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (exists.length > 0) {
          return res
            .status(409)
            .json({ message: "Property name already exists!" });
        }

        /* ── Parse areas ── */
        let parsedAreas = [];
        try {
          if (typeof areas === "string") parsedAreas = JSON.parse(areas);
          else if (Array.isArray(areas)) parsedAreas = areas;
        } catch (e) {
          console.warn("[updateProperty] Invalid areas JSON:", areas);
        }

        console.log("[updateProperty] parsedAreas:", parsedAreas);

        // ── Farm type detection (mirrors addProperty + frontend)
        const FARM_TYPES = ["FarmLand", "FarmHouse"];
        const isFarm = FARM_TYPES.includes(property_type);

        let builtUpArea = null;
        let carpetArea = null;

        if (isFarm) {
          // Farm: [{label:'Total Land Area', value:'2000', unit:'Acre'}]
          // Store as "2000 Acre" — same format as addProperty
          const landEntry = parsedAreas.find((a) =>
            a?.label?.toLowerCase().includes("land"),
          );
          if (landEntry) {
            builtUpArea = `${landEntry.value} ${landEntry.unit || "Acre"}`;
          }
          // carpetArea stays null for farm
        } else {
          builtUpArea =
            parsedAreas.find((a) =>
              a?.label?.toLowerCase().includes("built-up"),
            )?.value || null;
          carpetArea =
            parsedAreas.find((a) => a?.label?.toLowerCase().includes("carpet"))
              ?.value || null;
        }

        console.log(
          "[updateProperty] builtUpArea:",
          builtUpArea,
          "| carpetArea:",
          carpetArea,
        );

        /* ── Build dynamic SET clause ── */
        const coreFields = [
          "propertyType = ?",
          "propertyCategory = ?",
          "propertyName = ?",
          "totalSalesPrice = ?",
          "totalOfferPrice = ?",
          "contact = ?",
          "projectBy = ?",
          "state = ?",
          "city = ?",
          "address = ?",
          "builtUpArea = ?",
          "carpetArea = ?",
          "seoSlug = ?",
          "updated_at = NOW()",
        ];

        const coreValues = [
          bhk_type || null,
          property_type || null,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          builtUpArea,
          carpetArea,
          toSlug(property_name),
        ];

        const imageSetClauses = Object.keys(sentImages).map((k) => `${k} = ?`);
        const imageValues = Object.values(sentImages);

        const updateSQL = `
          UPDATE properties SET
            ${[...coreFields, ...imageSetClauses].join(",\n            ")}
          WHERE propertyid = ?
        `;

        const values = [...coreValues, ...imageValues, propertyid];

        console.log("[updateProperty] values:", values);

        db.query(updateSQL, values, (updateErr, result) => {
          if (updateErr) {
            console.error("[updateProperty] UPDATE error:", updateErr);
            return res
              .status(500)
              .json({ message: "Update failed", detail: updateErr.message });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Property not found" });
          }

          return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            propertyid,
          });
        });
      },
    );
  } catch (error) {
    console.error("[updateProperty] Outer error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
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
        "UPDATE properties SET status = ? WHERE propertyid = ?",
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
            .json({ message: "Property status change successfully" });
        },
      );
    },
  );
};
//delete property
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }
  console.log("ddd");

  const imageFields = [
    "frontView",
    "sideView",
    "kitchenView",
    "hallView",
    "bedroomView",
    "bathroomView",
    "balconyView",
    "nearestLandmark",
    "developedAmenities",
  ];

  // Fetch all image paths from DB
  db.query(
    `SELECT ${imageFields.join(", ")} FROM properties WHERE propertyid = ?`,
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = result[0];

      // Loop through image fields and delete each image
      imageFields.forEach((field) => {
        if (property[field]) {
          try {
            const paths = JSON.parse(property[field]);
            if (Array.isArray(paths)) {
              paths.forEach((imgPath) => {
                const fullPath = path.join(process.cwd(), imgPath);
                fs.unlink(fullPath, (err) => {
                  if (err && err.code !== "ENOENT") {
                    console.error(`Error deleting ${imgPath}:`, err);
                  }
                });
              });
            }
          } catch (e) {
            console.error(`Failed to parse ${field}:`, e);
          }
        }
      });

      // Delete the property from DB
      db.query("DELETE FROM properties WHERE propertyid = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting property:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: "Property and associated images deleted successfully",
        });
      });
    },
  );
};

//get like count
export const getPropertyLikeCountOld = (req, res) => {
  try {
    const propertyId = req.params.id;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required",
      });
    }

    const sql = `
      SELECT COUNT(DISTINCT user_id) AS likeCount
      FROM user_property_wishlist
      WHERE property_id = ?
    `;

    db.query(sql, [propertyId], (err, result) => {
      if (err) {
        console.error("Get Property Like Count Error:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      return res.status(200).json({
        success: true,
        propertyId,
        likeCount: result[0]?.likeCount || 0,
      });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

//get like count
export const getPropertyLikeCount = (req, res) => {
  try {
    const propertyId = req.params.id;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required",
      });
    }
    const sql = `
      SELECT COUNT(DISTINCT guest_user_id) AS likeCount
      FROM user_property_wishlist
      WHERE property_id = ?
    `;
    db.query(sql, [propertyId], (err, result) => {
      if (err) {
        console.error("Get Property Like Count Error:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      return res.status(200).json({
        success: true,
        propertyId,
        likeCount: result[0]?.likeCount || 0,
      });
    });
  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
