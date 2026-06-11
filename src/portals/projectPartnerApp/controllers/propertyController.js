import moment from "moment-timezone";
import db from "#db";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";
import { convertImagesToWebp } from "#utils/convertImagesToWebp.js";
import { uploadVideoToS3 } from "#utils/videoUpload.js";
import { sanitize } from "#utils/sanitize.js";
function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

const calculateEMI = (principal, rate = 9, years = 20) => {
  const monthlyRate = rate / 12 / 100;
  const months = years * 12;

  if (monthlyRate === 0) return principal / months;

  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return Math.round(emi);
};

// **Fetch All Properties**
export const getAll = (req, res) => {
  const partnerId = req.params.id;

  if (!partnerId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }
  const sql = `SELECT * from properties WHERE properties.projectpartnerid = ? 
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [partnerId], (err, result) => {
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

export const addProperty = async (req, res) => {
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      projectpartnerid,
      propertyVideo,
    } = req.body;

    /* ---------------- CHECK DUPLICATE NAME ---------------- */
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      async (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }

        if (result.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        /* ---------------- PARSE AREAS ---------------- */
        let parsedAreas = [];

        try {
          if (typeof areas === "string") {
            parsedAreas = JSON.parse(areas);
          } else if (Array.isArray(areas)) {
            parsedAreas = areas;
          }
        } catch (e) {
          parsedAreas = [];
        }

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built-up"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        /* ---------------- IMAGE UPLOAD ---------------- */
        const uploadField = async (field) => {
          if (!req.files || !req.files[field]) return [];

          const converted = await convertImagesToWebp({
            [field]: req.files[field],
          });

          const urls = [];
          for (const file of converted[field]) {
            const url = await uploadToS3(file);
            urls.push(url);
          }

          return urls;
        };

        /* ---------------- PROCESS IMAGES ---------------- */
        const frontView = await uploadField("frontView");
        const sideView = await uploadField("sideView");
        const kitchenView = await uploadField("kitchenView");
        const hallView = await uploadField("hallView");
        const bedroomView = await uploadField("bedroomView");
        const bathroomView = await uploadField("bathroomView");
        const balconyView = await uploadField("balconyView");
        const nearestLandmark = await uploadField("nearestLandmark");
        const developedAmenities = await uploadField("developedAmenities");

        /* ---------------- INSERT QUERY ---------------- */
        const seoSlug = toSlug(property_name);

        const insertSQL = `
  INSERT INTO properties (
    projectpartnerid, propertyType, propertyCategory, propertyName,
    totalSalesPrice, totalOfferPrice, contact, projectBy,
    state, city, address, builtUpArea, carpetArea,
    frontView, sideView, kitchenView, hallView,
    bedroomView, bathroomView, balconyView,
    nearestLandmark, developedAmenities,
    propertyVideo,
    seoSlug, created_at, updated_at
  )
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
`;

        const values = [
          projectpartnerid,
          property_type,
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
          JSON.stringify(frontView),
          JSON.stringify(sideView),
          JSON.stringify(kitchenView),
          JSON.stringify(hallView),
          JSON.stringify(bedroomView),
          JSON.stringify(bathroomView),
          JSON.stringify(balconyView),
          JSON.stringify(nearestLandmark),
          JSON.stringify(developedAmenities),
          propertyVideo,
          seoSlug,
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.error("INSERT ERROR:", err);
            return res
              .status(500)
              .json({ success: false, message: "Insert failed" });
          }

          return res.status(201).json({
            success: true,
            message: "Property added successfully",
            id: result.insertId,
          });
        });
      },
    );
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update property controller
// ─────────────────────────────────────────────────────────────────────────────
// All image section keys — must match frontend PROPERTY_TYPE_SECTIONS exactly
// ─────────────────────────────────────────────────────────────────────────────
const ALL_IMAGE_FIELDS = [
  // Residential
  "frontView",
  "sideView",
  "hallView",
  "kitchenView",
  "bedroomView",
  "bathroomView",
  "balconyView",
  // Plot
  "nearestLandmark",
  "developedAmenities",
  // Farmhouse
  "terraceSitout",
  "farmGardenArea",
  // Commercial - Shop
  "interiorView",
  "entranceView",
  "roadView",
  "parkingView",
  // Office
  "officeArea",
  "cabinView",
  "washroomView",
  // Warehouse
  "warehouseArea",
  "loadingArea",
  // Showroom
  "showroomInterior",
  "displayArea",
  // Universal
  "extraImages",
];

/**
 * Resolve image field value for UPDATE:
 *
 * Priority order:
 *   1. req.body[field] — JSON string of pre-uploaded S3 URLs sent by RN frontend
 *   2. req.files[field] — multipart file upload (web/admin panel)
 *   3. existing[field]  — keep old value untouched
 */
const resolveImageField = async (field, req, existing) => {
  // ── Case 1: Frontend sent pre-uploaded S3 URL array as JSON string ──────
  const bodyVal = req.body[field];
  if (bodyVal !== undefined && bodyVal !== null && bodyVal !== "") {
    // It might already be a JSON string like '["https://...","https://..."]'
    // or a plain string URL — normalise to JSON string array either way
    if (typeof bodyVal === "string") {
      const trimmed = bodyVal.trim();
      if (trimmed.startsWith("[")) {
        // Already a JSON array string — validate and pass through
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return JSON.stringify(parsed);
        } catch {
          // fall through
        }
      }
      // Plain single URL
      if (trimmed.startsWith("http")) return JSON.stringify([trimmed]);
    }
    if (Array.isArray(bodyVal)) {
      return JSON.stringify(bodyVal.filter(Boolean));
    }
  }

  // ── Case 2: Multipart file upload (web/admin) ────────────────────────────
  if (req.files && req.files[field]) {
    const uploadedUrls = [];
    for (const file of req.files[field]) {
      const url = await uploadToS3(file);
      uploadedUrls.push(url);
    }
    return JSON.stringify(uploadedUrls);
  }

  // ── Case 3: No new data — keep existing DB value ─────────────────────────
  return existing[field] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// All image section keys — must match frontend PROPERTY_TYPE_SECTIONS exactly
// ─────────────────────────────────────────────────────────────────────────────
const ALL_IMAGE_KEYS = [
  // Residential / common
  "frontView",
  "sideView",
  "hallView",
  "kitchenView",
  "bedroomView",
  "bathroomView",
  "balconyView",
  "nearestLandmark",
  "developedAmenities",
  // Shop / Office / Warehouse / Showroom
  "interiorView",
  "entranceView",
  "roadView",
  "parkingView",
  "officeArea",
  "cabinView",
  "washroomView",
  "warehouseArea",
  "loadingArea",
  "showroomInterior",
  "displayArea",
  // Farm House
  "terraceSitout",
  "farmGardenArea",
  // Extra / Other (always JSON array)
  "extraImages",
];

/**
 * Normalise any image value from req.body into a valid JSON string for MySQL.
 *
 * Handles:
 *   '["https://..."]'  → same (already serialised by frontend)
 *   'https://...'      → '["https://..."]'
 *   '[]'               → '[]'
 *   ''  / null         → '[]'
 *   string[]           → JSON.stringify(arr)
 */
const imgJson = (key, val) => {
  if (val === undefined || val === null || val === "") return "[]";

  if (typeof val === "string") {
    const t = val.trim();
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch {
        // fall through
      }
    }
    if (t.startsWith("http")) return JSON.stringify([t]);
    return "[]";
  }

  if (Array.isArray(val)) return JSON.stringify(val.filter(Boolean));

  return "[]";
};

// ─────────────────────────────────────────────────────────────────────────────
export const update = async (req, res) => {
  try {
    const Id = req.params.id;

    console.log("========== UPDATE PROPERTY ==========");
    console.log("Property ID:", Id);
    console.log("Request Body:", req.body);

    if (!Id) {
      return res.status(400).json({ message: "Invalid property ID" });
    }

    const {
      builderid,
      projectBy,
      possessionDate,
      propertyCategory,
      propertyName,
      address,
      state,
      city,
      pincode,
      location,
      distanceFromCityCenter,
      latitude,
      longitude,
      totalSalesPrice,
      totalOfferPrice,
      stampDuty,
      gst,
      advocateFee,
      msebWater,
      maintenance,
      other,
      tags,
      propertyType,
      builtYear,
      ownershipType,
      areas, // ← areas array (farm or non-farm)
      parkingAvailability,
      totalFloors,
      floorNo,
      loanAvailability,
      propertyFacing,
      reraRegistered,
      furnishing,
      waterSupply,
      powerBackup,
      locationFeature,
      sizeAreaFeature,
      parkingFeature,
      terraceFeature,
      ageOfPropertyFeature,
      amenitiesFeature,
      propertyStatusFeature,
      smartHomeFeature,
      securityBenefit,
      primeLocationBenefit,
      rentalIncomeBenefit,
      qualityBenefit,
      capitalAppreciationBenefit,
      ecofriendlyBenefit,
      propertyVideo,
      approvedBy,
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!propertyCategory)
      return res.status(400).json({ message: "Property Category is required" });
    if (!propertyName)
      return res.status(400).json({ message: "Property Name is required" });
    if (!address)
      return res.status(400).json({ message: "Address is required" });
    if (!state) return res.status(400).json({ message: "State is required" });
    if (!city) return res.status(400).json({ message: "City is required" });
    if (!pincode)
      return res.status(400).json({ message: "Pincode is required" });
    if (!location)
      return res.status(400).json({ message: "Location is required" });
    if (!totalSalesPrice)
      return res.status(400).json({ message: "Total Sales Price is required" });
    if (!totalOfferPrice)
      return res.status(400).json({ message: "Total Offer Price is required" });

    // ── Derived fields ────────────────────────────────────────────────────────
    let registrationFees;
    if (totalOfferPrice > 3000000) {
      registrationFees = (30000 / totalOfferPrice) * 100;
    } else {
      registrationFees = ["RentalFlat", "RentalShop", "RentalOffice"].includes(
        propertyCategory,
      )
        ? 0
        : 1;
    }

    const emi = calculateEMI(Number(totalOfferPrice));

    let formattedPossessionDate = null;
    if (possessionDate && possessionDate.trim() !== "") {
      if (
        moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
      ) {
        formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
      }
    }

    const propertyTypeArray = Array.isArray(propertyType)
      ? propertyType
      : typeof propertyType === "string"
        ? propertyType
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const propertyTypeJson = JSON.stringify(propertyTypeArray);

    // ── Area parse (same logic as addPropertyNew & updateProperty) ────────────
    let parsedAreas = [];
    try {
      parsedAreas = typeof areas === "string" ? JSON.parse(areas) : areas || [];
    } catch {
      parsedAreas = [];
    }

    const FARM_TYPES = [
      "FarmLand",
      "ResaleFarmLand",
      "FarmHouse",
      "ResaleFarmHouse",
    ];
    const isFarm = FARM_TYPES.includes(propertyCategory);

    let builtUpArea = null;
    let carpetArea = null;

    if (isFarm) {
      const landArea = parsedAreas.find(
        (a) =>
          a?.label?.toLowerCase().includes("land") ||
          a?.label?.toLowerCase().includes("farm"),
      );

      console.log("Farm Land Area:", landArea);

      if (landArea) {
        const value = landArea?.value?.toString()?.trim();
        const unit = landArea?.unit?.toString()?.trim();

        if (
          value &&
          unit &&
          !value.toLowerCase().includes(unit.toLowerCase())
        ) {
          builtUpArea = `${value} ${unit}`;
        } else {
          builtUpArea = value || null;
        }
      }
    } else {
      builtUpArea =
        parsedAreas.find((a) => a?.label?.toLowerCase() === "built-up area")
          ?.value || null;
      carpetArea =
        parsedAreas.find((a) => a?.label?.toLowerCase() === "carpet area")
          ?.value || null;

      console.log("Parsed builtUpArea:", builtUpArea);
      console.log("Parsed carpetArea:", carpetArea);
    }

    // ── Collect only image keys present in this request ───────────────────────
    const sentImageClauses = [];
    const sentImageValues = [];

    ALL_IMAGE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        sentImageClauses.push(`${key} = ?`);
        sentImageValues.push(imgJson(key, req.body[key]));
      }
    });

    console.log("Image columns being updated:", sentImageClauses);

    // ── Core SET clauses ──────────────────────────────────────────────────────
    const coreFields = [
      "builderid = ?",
      "projectBy = ?",
      "possessionDate = ?",
      "propertyCategory = ?",
      "propertyApprovedBy = ?",
      "propertyName = ?",
      "address = ?",
      "state = ?",
      "city = ?",
      "pincode = ?",
      "location = ?",
      "distanceFromCityCenter = ?",
      "latitude = ?",
      "longitude = ?",
      "totalSalesPrice = ?",
      "totalOfferPrice = ?",
      "emi = ?",
      "stampDuty = ?",
      "registrationFee = ?",
      "gst = ?",
      "advocateFee = ?",
      "msebWater = ?",
      "maintenance = ?",
      "other = ?",
      "tags = ?",
      "propertyType = ?",
      "builtYear = ?",
      "ownershipType = ?",
      "builtUpArea = ?", // "1.5 Acre" for farm, number for others
      "carpetArea = ?", // null for farm types
      "parkingAvailability = ?",
      "totalFloors = ?",
      "floorNo = ?",
      "loanAvailability = ?",
      "propertyFacing = ?",
      "reraRegistered = ?",
      "furnishing = ?",
      "waterSupply = ?",
      "powerBackup = ?",
      "locationFeature = ?",
      "sizeAreaFeature = ?",
      "parkingFeature = ?",
      "terraceFeature = ?",
      "ageOfPropertyFeature = ?",
      "amenitiesFeature = ?",
      "propertyStatusFeature = ?",
      "smartHomeFeature = ?",
      "securityBenefit = ?",
      "primeLocationBenefit = ?",
      "rentalIncomeBenefit = ?",
      "qualityBenefit = ?",
      "capitalAppreciationBenefit = ?",
      "ecofriendlyBenefit = ?",
      "propertyVideo = ?",
      "updated_at = NOW()",
    ];

    const coreValues = [
      builderid ?? null,
      sanitize(projectBy) ?? null,
      sanitize(formattedPossessionDate) ?? null,
      propertyCategory,
      approvedBy ?? null,
      propertyName,
      address,
      state,
      city,
      pincode,
      location,
      distanceFromCityCenter ?? null,
      latitude ?? null,
      longitude ?? null,
      totalSalesPrice,
      totalOfferPrice,
      emi,
      stampDuty ?? null,
      registrationFees,
      gst ?? null,
      advocateFee ?? null,
      msebWater ?? null,
      maintenance ?? null,
      other ?? null,
      tags ?? null,
      propertyTypeJson,
      builtYear ?? null,
      ownershipType ?? null,
      builtUpArea, // parsed above — "1.5 Acre" or numeric string
      carpetArea, // null for farm types
      parkingAvailability ?? null,
      totalFloors ?? null,
      floorNo ?? null,
      loanAvailability ?? null,
      propertyFacing ?? null,
      reraRegistered ?? null,
      furnishing ?? null,
      waterSupply ?? null,
      powerBackup ?? null,
      locationFeature ?? null,
      sizeAreaFeature ?? null,
      parkingFeature ?? null,
      terraceFeature ?? null,
      ageOfPropertyFeature ?? null,
      amenitiesFeature ?? null,
      propertyStatusFeature ?? null,
      smartHomeFeature ?? null,
      securityBenefit ?? null,
      primeLocationBenefit ?? null,
      rentalIncomeBenefit ?? null,
      qualityBenefit ?? null,
      capitalAppreciationBenefit ?? null,
      ecofriendlyBenefit ?? null,
      propertyVideo ?? null,
    ];

    const updateSQL = `
      UPDATE properties SET
        ${[...coreFields, ...sentImageClauses].join(",\n        ")}
      WHERE propertyid = ?
    `;

    const values = [...coreValues, ...sentImageValues, Id];

    db.query(updateSQL, values, (err, result) => {
      if (err) {
        console.error("Error updating property:", err);
        return res.status(500).json({ message: "Update failed", error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      console.log("Property updated successfully:", Id);
      return res.status(200).json({
        success: true,
        message: "Property updated successfully",
        propertyid: Id,
      });
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      stack: error.stack,
    });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// All possible image column keys across every property type.
// Each is stored as a JSON array in the DB.
// Add any new keys here and create the matching column in MySQL.
// ─────────────────────────────────────────────────────────────────────────────

export const addPropertyNew = async (req, res) => {
  try {
    const {
      property_type,
      property_name,
      bhk_type,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      category,
      state,
      city,
      address,
      pincode,
      latitude,
      longitude,
      projectpartnerid,
      propertyVideo,
    } = req.body;

    console.log(req.body);

    // ── Auth guard ───────────────────────────────────────────────────────────
    if (!projectpartnerid) {
      return res
        .status(401)
        .json({ success: false, message: "Login required" });
    }

    // ── Required field check ─────────────────────────────────────────────────
    const missing = [];
    if (!property_name) missing.push("Property Name");
    if (!property_type) missing.push("Property Type");
    if (!price) missing.push("Price");
    if (!state) missing.push("State");
    if (!city) missing.push("City");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    // ── Duplicate check ──────────────────────────────────────────────────────
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }
        if (result.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        // ── Area parse ───────────────────────────────────────────────────────
        let parsedAreas = [];
        try {
          parsedAreas =
            typeof areas === "string" ? JSON.parse(areas) : areas || [];
        } catch {
          parsedAreas = [];
        }

        const FARM_TYPES = [
          "FarmLand",
          "ResaleFarmLand",
          "FarmHouse",
          "ResaleFarmHouse",
        ];
        const isFarm = FARM_TYPES.includes(property_type);

        let builtUpArea = null;
        let carpetArea = null;

        if (isFarm) {
          // Farm types: areas array has { label: 'Farm Land Area', value: '1.5', unit: 'Acre' }
          const landArea = parsedAreas.find(
            (a) =>
              a?.label?.toLowerCase().includes("land") ||
              a?.label?.toLowerCase().includes("farm"),
          );

          console.log("Farm Land Area:", landArea);

          if (landArea) {
            const value = landArea?.value?.toString()?.trim();
            const unit = landArea?.unit?.toString()?.trim();

            if (
              value &&
              unit &&
              !value.toLowerCase().includes(unit.toLowerCase())
            ) {
              builtUpArea = `${value} ${unit}`;
            } else {
              builtUpArea = value || null;
            }
          }
        } else {
          // All other types: areas array has { label: 'Built-Up Area', value: '1200' }
          builtUpArea =
            parsedAreas.find((a) => a?.label?.toLowerCase() === "built-up area")
              ?.value || null;
          carpetArea =
            parsedAreas.find((a) => a?.label?.toLowerCase() === "carpet area")
              ?.value || null;

          console.log("Parsed builtUpArea:", builtUpArea);
          console.log("Parsed carpetArea:", carpetArea);
        }

        const seoSlug = toSlug(property_name);

        // ── Build dynamic image columns ──────────────────────────────────────
        // Normalizes every image field into a JSON array string for DB storage.
        // Handles all shapes the React Native app may send:
        //   string[]          → JSON.stringify as-is           e.g. ["url1","url2"]
        //   single string     → wrap in array                  e.g. "url1" → ["url1"]
        //   JSON array string → parse then re-stringify        e.g. '["url1"]' → ["url1"]
        //   empty string / undefined / null → store as []
        const normalizeImageVal = (val) => {
          if (!val) return "[]";
          if (Array.isArray(val)) {
            const clean = val.filter((v) => typeof v === "string" && v.trim());
            return JSON.stringify(clean);
          }
          if (typeof val === "string") {
            const trimmed = val.trim();
            if (!trimmed) return "[]";
            if (trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  return JSON.stringify(
                    parsed.filter((v) => typeof v === "string" && v.trim()),
                  );
                }
              } catch {}
            }
            return JSON.stringify([trimmed]);
          }
          return "[]";
        };

        const imageColumns = ALL_IMAGE_KEYS.map((key) =>
          normalizeImageVal(req.body[key]),
        );

        // ── INSERT ───────────────────────────────────────────────────────────
        const imageColumnNames = ALL_IMAGE_KEYS.join(",\n          ");
        const imagePlaceholders = ALL_IMAGE_KEYS.map(() => "?").join(
          ",\n          ",
        );

        const insertSQL = `
          INSERT INTO properties (
            projectpartnerid,
            propertyType,
            propertyCategory,
            propertyName,
            totalSalesPrice,
            totalOfferPrice,
            contact,
            projectBy,
            state,
            city,
            address,
            pincode,
            latitude,
            longitude,
            builtUpArea,
            carpetArea,
            ${imageColumnNames},
            propertyVideo,
            seoSlug,
            created_at,
            updated_at
          )
          VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
            ${imagePlaceholders},
            ?,?,NOW(),NOW()
          )
        `;

        const values = [
          projectpartnerid,
          bhk_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          pincode,
          latitude,
          longitude,
          builtUpArea, // "1.5 Acre" for farm, "1200" for others
          carpetArea, // null for farm/plot types
          ...imageColumns,
          propertyVideo,
          seoSlug,
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.error("Insert error:", err);
            return res.status(500).json({
              success: false,
              message: "Insert failed",
              error: err.message,
            });
          }

          const newPropertyId = result.insertId;

          // ── Generate propertyCityId ──────────────────────────────────────
          db.query(
            "SELECT cityNACL FROM cities WHERE city = ? LIMIT 1",
            [city],
            (err2, cityResult) => {
              if (err2) {
                return res.status(500).json({
                  success: false,
                  message: "City lookup failed",
                  error: err2,
                });
              }
              if (cityResult.length === 0) {
                return res.status(404).json({
                  success: false,
                  message: "City not found in database",
                });
              }

              const cityNACL = cityResult[0].cityNACL;
              const propertyCityId = `${cityNACL}-${newPropertyId}`;

              db.query(
                "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
                [propertyCityId, newPropertyId],
                (err3) => {
                  if (err3) {
                    return res.status(500).json({
                      success: false,
                      message: "Failed to update propertyCityId",
                      error: err3,
                    });
                  }

                  return res.status(201).json({
                    success: true,
                    message: "Property created successfully",
                    id: newPropertyId,
                    propertyCityId,
                  });
                },
              );
            },
          );
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateProperty = async (req, res) => {
  const { propertyid } = req.params;
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      pincode,
      latitude,
      longitude,
      projectpartnerid,
      propertyVideo,

      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
      extraImages,
    } = req.body;

    console.log(req.body);

    /* ---------- AUTH CHECK ---------- */

    if (!projectpartnerid) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    /* ---------- REQUIRED FIELD CHECK ---------- */

    if (!propertyid) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required",
      });
    }

    const missing = [];

    if (!property_name) missing.push("Property Name");
    if (!property_type) missing.push("Property Type");
    if (!price) missing.push("Price");
    if (!state) missing.push("State");
    if (!city) missing.push("City");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    /* ---------- OWNERSHIP CHECK ---------- */

    db.query(
      "SELECT propertyid, projectpartnerid, propertyName FROM properties WHERE propertyid = ?",
      [propertyid],
      (err, result) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (result.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Property not found",
          });
        }

        const existing = result[0];

        if (String(existing.projectpartnerid) !== String(projectpartnerid)) {
          return res.status(403).json({
            success: false,
            message: "Unauthorized to update this property",
          });
        }

        /* ---------- AREA PARSE ---------- */

        let parsedAreas = [];

        try {
          parsedAreas =
            typeof areas === "string" ? JSON.parse(areas) : areas || [];
        } catch {
          parsedAreas = [];
        }

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        /* ---------- SEO SLUG ---------- */

        // Only regenerate slug if name changed
        const seoSlug =
          existing.propertyName !== property_name
            ? toSlug(property_name)
            : undefined;

        /* ---------- BUILD UPDATE QUERY ---------- */

        const updateSQL = `
          UPDATE properties SET
            propertyType        = ?,
            propertyCategory    = ?,
            propertyName        = ?,
            totalSalesPrice     = ?,
            totalOfferPrice     = ?,
            contact             = ?,
            projectBy           = ?,
            state               = ?,
            city                = ?,
            address             = ?,
            pincode             = ?,
            latitude            = ?,
            longitude           = ?,
            builtUpArea         = ?,
            carpetArea          = ?,
            frontView           = ?,
            sideView            = ?,
            kitchenView         = ?,
            hallView            = ?,
            bedroomView         = ?,
            bathroomView        = ?,
            balconyView         = ?,
            nearestLandmark     = ?,
            developedAmenities  = ?,
            extraImages         = ?,
            propertyVideo       = ?
            ${seoSlug ? ", seoSlug = ?" : ""}
            , updated_at        = NOW()
          WHERE propertyid = ?
            AND projectpartnerid = ?
        `;

        const values = [
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          pincode,
          latitude,
          longitude,
          builtUpArea,
          carpetArea,
          JSON.stringify(frontView || []),
          JSON.stringify(sideView || []),
          JSON.stringify(kitchenView || []),
          JSON.stringify(hallView || []),
          JSON.stringify(bedroomView || []),
          JSON.stringify(bathroomView || []),
          JSON.stringify(balconyView || []),
          JSON.stringify(nearestLandmark || []),
          JSON.stringify(developedAmenities || []),
          JSON.stringify(extraImages || []),
          propertyVideo,
          ...(seoSlug ? [seoSlug] : []),
          propertyid,
          projectpartnerid,
        ];

        db.query(updateSQL, values, (err, result) => {
          if (err) {
            console.error("Update error:", err);
            return res.status(500).json({
              success: false,
              message: "Update failed",
            });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({
              success: false,
              message: "Property not found or no changes made",
            });
          }

          res.status(200).json({
            success: true,
            message: "Property updated successfully",
            id: propertyid,
            ...(seoSlug ? { seoSlug } : {}),
          });
        });
      },
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
export const uploadBrochureAndVideoLink = async (req, res) => {
  try {
    const propertyId = req.params.id;
    if (!propertyId) {
      return res.status(400).json({ message: "Property Id is required" });
    }

    const { brochureFile, videoLink } = req.body; // both come as JSON now

    if (!brochureFile && !videoLink) {
      return res
        .status(400)
        .json({ message: "No brochure or video link provided" });
    }

    // Fetch old data from DB
    const [oldData] = await new Promise((resolve, reject) => {
      db.query(
        "SELECT brochureFile, videoLink FROM properties WHERE propertyid = ?",
        [propertyId],
        (err, result) => {
          if (err) return reject(err);
          if (!result.length)
            return reject({ status: 404, message: "Property not found" });
          resolve(result);
        },
      );
    });

    // Delete old brochure from S3 if a new one is being set
    if (brochureFile && oldData.brochureFile) {
      await deleteFromS3(oldData.brochureFile);
    }

    // Update DB
    db.query(
      "UPDATE properties SET brochureFile = ?, videoLink = ? WHERE propertyid = ?",
      [
        brochureFile || oldData.brochureFile, // keep old if not updated
        videoLink || oldData.videoLink, // keep old if not updated
        propertyId,
      ],
      (err) => {
        if (err) {
          console.error("Error updating brochure/video link:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: "Brochure & Video Link updated successfully",
          brochureUrl: brochureFile || oldData.brochureFile,
          videoLink: videoLink || oldData.videoLink,
        });
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};
