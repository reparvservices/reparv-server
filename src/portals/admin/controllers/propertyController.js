import db from "#db";
import moment from "moment-timezone";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { convertImagesToWebp } from "#utils/convertImagesToWebp.js";
import { sanitize } from "#utils/sanitize.js";
import { deleteFromS3, multipartUploadToS3, uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";

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

export const getAll = (req, res) => {
  const propertyLister = req.params.lister;

  if (!propertyLister) {
    return res.status(401).json({ message: "Select Lister Not Selected" });
  }

  let sql;

  if (propertyLister === "Reparv Employee") {
    sql = `
      SELECT 
        properties.*,
        builders.company_name, 
        employees.name AS fullname, 
        employees.contact,

        /* Likes */
        COUNT(DISTINCT w.guest_user_id) AS likes,

        /* Views */
        MAX(COALESCE(pa.views, 0)) AS views,

        /* Share */
        MAX(COALESCE(pa.share, 0)) AS shares,

        /* Calls */
        MAX(COALESCE(pa.calls, 0)) AS calls,

        /* WhatsApp */
        MAX(COALESCE(pa.whatsapp_enquiry, 0)) AS whatsapp

      FROM properties 

      LEFT JOIN builders 
        ON properties.builderid = builders.builderid 

      INNER JOIN employees 
        ON properties.employeeid = employees.id 

      LEFT JOIN user_property_wishlist w
        ON w.property_id = properties.propertyid

      LEFT JOIN property_analytics pa
        ON pa.property_id = properties.propertyid

      GROUP BY properties.propertyid
      ORDER BY properties.created_at DESC
    `;
  } else if (propertyLister === "Project Partner") {
    sql = `
      SELECT 
        properties.*,
        builders.company_name, 
        projectpartner.fullname, 
        projectpartner.contact,
        projectpartner.city AS partnerCity,

        COUNT(DISTINCT w.guest_user_id) AS likes,
        MAX(COALESCE(pa.views, 0)) AS views,
        MAX(COALESCE(pa.calls, 0)) AS calls,
        MAX(COALESCE(pa.share, 0)) AS shares,
        MAX(COALESCE(pa.whatsapp_enquiry, 0)) AS whatsapp

      FROM properties 

      LEFT JOIN builders 
        ON properties.builderid = builders.builderid 

      INNER JOIN projectpartner 
        ON properties.projectpartnerid = projectpartner.id 

      LEFT JOIN user_property_wishlist w
        ON w.property_id = properties.propertyid

      LEFT JOIN property_analytics pa
        ON pa.property_id = properties.propertyid

      GROUP BY properties.propertyid
      ORDER BY properties.created_at DESC
    `;
  } else if (propertyLister === "Guest User") {
    sql = `
      SELECT 
        properties.*,
        builders.company_name, 
        guestUsers.fullname, 
        guestUsers.contact,
        guestUsers.city AS partnerCity,

        COUNT(DISTINCT w.guest_user_id) AS likes,
        MAX(COALESCE(pa.views, 0)) AS views,
        MAX(COALESCE(pa.calls, 0)) AS calls,
        MAX(COALESCE(pa.share, 0)) AS shares,
        MAX(COALESCE(pa.whatsapp_enquiry, 0)) AS whatsapp

      FROM properties 

      LEFT JOIN builders 
        ON properties.builderid = builders.builderid 

      INNER JOIN guestUsers 
        ON properties.guestUserId = guestUsers.id 

      LEFT JOIN user_property_wishlist w
        ON w.property_id = properties.propertyid

      LEFT JOIN property_analytics pa
        ON pa.property_id = properties.propertyid

      GROUP BY properties.propertyid
      ORDER BY properties.created_at DESC
    `;
  } else if (propertyLister === "Onboarding Partner") {
    sql = `
      SELECT 
        properties.*,
        builders.company_name, 
        onboardingpartner.fullname, 
        onboardingpartner.contact,
        onboardingpartner.city AS partnerCity,

        COUNT(DISTINCT w.guest_user_id) AS likes,
        MAX(COALESCE(pa.views, 0)) AS views,
        MAX(COALESCE(pa.calls, 0)) AS calls,
        MAX(COALESCE(pa.share, 0)) AS shares,
        MAX(COALESCE(pa.whatsapp_enquiry, 0)) AS whatsapp

      FROM properties 

      INNER JOIN builders 
        ON properties.builderid = builders.builderid 

      INNER JOIN onboardingpartner 
        ON properties.partnerid = onboardingpartner.partnerid 

      LEFT JOIN user_property_wishlist w
        ON w.property_id = properties.propertyid

      LEFT JOIN property_analytics pa
        ON pa.property_id = properties.propertyid

      GROUP BY properties.propertyid
      ORDER BY properties.created_at DESC
    `;
  } else {
    sql = `
      SELECT 
        properties.*,
        builders.company_name,

        COUNT(DISTINCT w.guest_user_id) AS likes,
        MAX(COALESCE(pa.views, 0)) AS views,
        MAX(COALESCE(pa.calls, 0)) AS calls,
        MAX(COALESCE(pa.share, 0)) AS shares,
        MAX(COALESCE(pa.whatsapp_enquiry, 0)) AS whatsapp

      FROM properties 

      LEFT JOIN builders 
        ON properties.builderid = builders.builderid 

      LEFT JOIN user_property_wishlist w
        ON w.property_id = properties.propertyid

      LEFT JOIN property_analytics pa
        ON pa.property_id = properties.propertyid

      GROUP BY properties.propertyid
      ORDER BY properties.created_at DESC
    `;
  }

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      calls: Number(row.calls) || 0,
      shares: Number(row.shares) || 0,
      whatsapp: Number(row.whatsapp) || 0,
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

// **Fetch All Properties**
export const getAllOld = (req, res) => {
  const propertyLister = req.params.lister;
  if (!propertyLister) {
    return res.status(401).json({ message: "Select Listerr Not Selected" });
  }
  let sql;

  if (propertyLister === "Reparv Employee") {
    sql = `SELECT properties.*,
                      builders.company_name, 
                      employees.name AS fullname, 
                      employees.contact
               FROM properties 
               LEFT JOIN builders ON properties.builderid = builders.builderid 
               INNER JOIN employees ON properties.employeeid = employees.id 
               ORDER BY properties.created_at DESC;`;
  } else if (propertyLister === "Project Partner") {
    sql = `SELECT properties.*,
           builders.company_name, 
           projectpartner.fullname, 
           projectpartner.contact,
           projectpartner.city AS partnerCity
        FROM properties 
        LEFT JOIN builders ON properties.builderid = builders.builderid 
        INNER JOIN projectpartner ON properties.projectpartnerid = projectpartner.id 
        ORDER BY properties.created_at DESC;`;
  } else if (propertyLister === "Guest User") {
    sql = `SELECT properties.*,
           builders.company_name, 
           guestUsers.fullname, 
           guestUsers.contact,
           guestUsers.city AS partnerCity
        FROM properties 
        LEFT JOIN builders ON properties.builderid = builders.builderid 
        INNER JOIN guestUsers ON properties.guestUserId = guestUsers.id 
        ORDER BY properties.created_at DESC;`;
  } else if (propertyLister === "Onboarding Partner") {
    sql = `SELECT properties.*,
           builders.company_name, 
           onboardingpartner.fullname, 
           onboardingpartner.contact,
           onboardingpartner.city AS partnerCity
        FROM properties 
        INNER JOIN builders ON properties.builderid = builders.builderid 
        INNER JOIN onboardingpartner ON properties.partnerid = onboardingpartner.partnerid 
        ORDER BY properties.created_at DESC;`;
  } else {
    sql = `SELECT properties.*,
                      builders.company_name 
               FROM properties 
               LEFT JOIN builders ON properties.builderid = builders.builderid 
               ORDER BY properties.created_at DESC;`;
  }

  db.query(sql, (err, result) => {
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

// **Fetch Single Property by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT 
      properties.*,
      builders.company_name, 
      onboardingpartner.fullname, 
      onboardingpartner.contact, 
      onboardingpartner.email,
      onboardingpartner.city AS partnerCity
    FROM properties
    LEFT JOIN builders ON builders.builderid = properties.builderid
    LEFT JOIN onboardingpartner ON properties.partnerid = onboardingpartner.partnerid
    WHERE properties.propertyid = ?
    ORDER BY properties.propertyid DESC;
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    // safely parse JSON fields
    const formatted = result.map((row) => {
      let parsedType = null;
      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
        parsedType = [];
      }

      return {
        ...row,
        propertyType: parsedType,
      };
    });

    res.json(formatted[0]);
  });
};

export const checkPropertyName = (req, res) => {
  try {
    let { propertyName } = req.body;

    if (!propertyName || propertyName.trim() === "") {
      return res.status(400).json({
        success: false,
        unique: null,
        message: "Property Name",
      });
    }

    propertyName = propertyName.trim();
    // Case-insensitive check
    const sql =
      "SELECT propertyid FROM properties WHERE LOWER(propertyName) = LOWER(?) LIMIT 1";

    db.query(sql, [propertyName], (err, rows) => {
      if (err) {
        console.error("Error checking property name:", err);
        return res.status(500).json({
          success: false,
          unique: null,
          message: "Server error while checking property name",
        });
      }

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          unique: false,
          message: "Property Name already exists",
        });
      }

      return res.status(200).json({
        success: true,
        unique: true,
        message: "Property Name is available",
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      success: false,
      unique: null,
      message: "Unexpected server error",
    });
  }
};

export const addProperty = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    builderid,
    projectBy,
    possessionDate,
    propertyCategory,
    propertyApprovedBy,
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
    builtUpArea,
    carpetArea,
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
  } = req.body;

  if (!propertyCategory || !propertyName || !city) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  try {
    // 1. Duplicate check
    const [exists] = await db
      .promise()
      .query("SELECT propertyid FROM properties WHERE propertyName = ?", [
        propertyName,
      ]);

    if (exists.length > 0) {
      return res.status(409).json({ message: "Property name already exists" });
    }

    // 2. City lookup BEFORE insert (mandatory — propertyCityId cannot be generated without it)
    const [cityResult] = await db
      .promise()
      .query("SELECT cityNACL FROM cities WHERE city = ? LIMIT 1", [city]);

    if (!cityResult.length) {
      return res.status(404).json({ message: "City not found in database" });
    }

    const cityNACL = cityResult[0].cityNACL;

    // 3. Computed fields
    const registrationFees =
      totalOfferPrice > 3000000
        ? (30000 / totalOfferPrice) * 100
        : ["RentalFlat", "RentalShop", "RentalOffice"].includes(
              propertyCategory,
            )
          ? 0
          : 1;

    const calculateEMI = (price) => {
      const r = 0.08 / 12;
      const n = 240;
      return Math.round(
        (price * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1),
      );
    };
    const emi = calculateEMI(Number(totalOfferPrice));

    const formattedPossessionDate = possessionDate
      ? moment(possessionDate).format("YYYY-MM-DD")
      : null;

    const propertyTypeJson = JSON.stringify(
      Array.isArray(propertyType)
        ? propertyType
        : String(propertyType)
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
    );

    // 4. Convert uploaded images to WebP then upload to S3
    const files = await convertImagesToWebp(req.files);

    const uploadImagesToS3 = async (fieldFiles) => {
      if (!fieldFiles) return null;
      const urls = [];
      for (const file of fieldFiles) {
        urls.push(await uploadToS3(file));
      }
      return JSON.stringify(urls);
    };

    const [
      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
    ] = await Promise.all([
      uploadImagesToS3(files.frontView),
      uploadImagesToS3(files.sideView),
      uploadImagesToS3(files.kitchenView),
      uploadImagesToS3(files.hallView),
      uploadImagesToS3(files.bedroomView),
      uploadImagesToS3(files.bathroomView),
      uploadImagesToS3(files.balconyView),
      uploadImagesToS3(files.nearestLandmark),
      uploadImagesToS3(files.developedAmenities),
    ]);

    // 5. Insert + propertyCityId update inside a transaction
    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      const insertSQL = `
        INSERT INTO properties (
          builderid, projectBy, possessionDate, propertyCategory,
          propertyApprovedBy, propertyName, address, state, city, pincode,
          location, distanceFromCityCenter, latitude, longitude,
          totalSalesPrice, totalOfferPrice, emi, stampDuty, registrationFee,
          gst, advocateFee, msebWater, maintenance, other, tags,
          propertyType, builtYear, ownershipType, builtUpArea, carpetArea,
          parkingAvailability, totalFloors, floorNo, loanAvailability,
          propertyFacing, reraRegistered, furnishing, waterSupply, powerBackup,
          locationFeature, sizeAreaFeature, parkingFeature, terraceFeature,
          ageOfPropertyFeature, amenitiesFeature, propertyStatusFeature,
          smartHomeFeature, securityBenefit, primeLocationBenefit,
          rentalIncomeBenefit, qualityBenefit, capitalAppreciationBenefit,
          ecofriendlyBenefit,
          frontView, sideView, kitchenView, hallView, bedroomView,
          bathroomView, balconyView, nearestLandmark, developedAmenities,
          seoSlug, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `;

      const [result] = await conn.query(insertSQL, [
        builderid,
        projectBy,
        formattedPossessionDate,
        propertyCategory,
        propertyApprovedBy,
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
        emi,
        stampDuty,
        registrationFees,
        gst,
        advocateFee,
        msebWater,
        maintenance,
        other,
        tags,
        propertyTypeJson,
        builtYear,
        ownershipType,
        builtUpArea,
        carpetArea,
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
        frontView,
        sideView,
        kitchenView,
        hallView,
        bedroomView,
        bathroomView,
        balconyView,
        nearestLandmark,
        developedAmenities,
        toSlug(propertyName),
        currentdate,
        currentdate,
      ]);

      const newPropertyId = result.insertId;
      if (!newPropertyId)
        throw new Error("Insert did not return a valid insertId");

      const propertyCityId = `${cityNACL}-${newPropertyId}`;

      const [updateResult] = await conn.query(
        "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
        [propertyCityId, newPropertyId],
      );

      if (updateResult.affectedRows === 0) {
        throw new Error("Failed to store propertyCityId — no rows updated");
      }

      await conn.commit();
      conn.release();

      return res.status(201).json({
        message: "Property added successfully",
        id: newPropertyId,
        propertyCityId,
      });
    } catch (txError) {
      await conn.rollback();
      conn.release();
      console.error("addProperty transaction rolled back:", txError);
      return res.status(500).json({
        message: txError.message || "Failed to save property",
        error: txError.message,
      });
    }
  } catch (error) {
    console.error("addProperty error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

export const addPropertyOlder = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    // Convert uploaded images to WebP
    const files = await convertImagesToWebp(req.files);

    const {
      builderid,
      projectBy,
      possessionDate,
      propertyCategory,
      propertyApprovedBy,
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
      builtUpArea,
      carpetArea,
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
    } = req.body;

    /*  Required validation */
    if (!propertyCategory || !propertyName || !city) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    /* Duplicate check */
    const [exists] = await db
      .promise()
      .query("SELECT propertyid FROM properties WHERE propertyName = ?", [
        propertyName,
      ]);

    if (exists.length > 0) {
      return res.status(409).json({ message: "Property name already exists" });
    }

    /*  Registration fee */
    const registrationFees =
      totalOfferPrice > 3000000
        ? (30000 / totalOfferPrice) * 100
        : ["RentalFlat", "RentalShop", "RentalOffice"].includes(
              propertyCategory,
            )
          ? 0
          : 1;

    /* EMI */
    const calculateEMI = (price) => {
      const r = 0.08 / 12;
      const n = 240;
      return Math.round(
        (price * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1),
      );
    };
    const emi = calculateEMI(Number(totalOfferPrice));

    /* Possession date */
    const formattedPossessionDate = possessionDate
      ? moment(possessionDate).format("YYYY-MM-DD")
      : null;

    /* Property type array */
    const propertyTypeJson = JSON.stringify(
      Array.isArray(propertyType)
        ? propertyType
        : String(propertyType)
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
    );

    /* Upload images to S3 */
    const uploadImagesToS3 = async (fieldFiles) => {
      if (!fieldFiles) return null;
      const uploadedUrls = [];
      for (const file of fieldFiles) {
        const url = await uploadToS3(file);
        uploadedUrls.push(url);
      }
      return JSON.stringify(uploadedUrls);
    };

    const frontView = await uploadImagesToS3(files.frontView);
    const sideView = await uploadImagesToS3(files.sideView);
    const kitchenView = await uploadImagesToS3(files.kitchenView);
    const hallView = await uploadImagesToS3(files.hallView);
    const bedroomView = await uploadImagesToS3(files.bedroomView);
    const bathroomView = await uploadImagesToS3(files.bathroomView);
    const balconyView = await uploadImagesToS3(files.balconyView);
    const nearestLandmark = await uploadImagesToS3(files.nearestLandmark);
    const developedAmenities = await uploadImagesToS3(files.developedAmenities);

    /*  Insert property */
    const insertSQL = `
      INSERT INTO properties (
        builderid, projectBy, possessionDate, propertyCategory,
        propertyApprovedBy, propertyName, address, state, city, pincode,
        location, distanceFromCityCenter, latitude, longitude,
        totalSalesPrice, totalOfferPrice, emi, stampDuty, registrationFee,
        gst, advocateFee, msebWater, maintenance, other, tags,
        propertyType, builtYear, ownershipType, builtUpArea, carpetArea,
        parkingAvailability, totalFloors, floorNo, loanAvailability,
        propertyFacing, reraRegistered, furnishing, waterSupply, powerBackup,
        locationFeature, sizeAreaFeature, parkingFeature, terraceFeature,
        ageOfPropertyFeature, amenitiesFeature, propertyStatusFeature,
        smartHomeFeature, securityBenefit, primeLocationBenefit,
        rentalIncomeBenefit, qualityBenefit, capitalAppreciationBenefit,
        ecofriendlyBenefit,
        frontView, sideView, kitchenView, hallView, bedroomView,
        bathroomView, balconyView, nearestLandmark, developedAmenities,
        seoSlug, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const [result] = await db
      .promise()
      .query(insertSQL, [
        builderid,
        projectBy,
        formattedPossessionDate,
        propertyCategory,
        propertyApprovedBy,
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
        emi,
        stampDuty,
        registrationFees,
        gst,
        advocateFee,
        msebWater,
        maintenance,
        other,
        tags,
        propertyTypeJson,
        builtYear,
        ownershipType,
        builtUpArea,
        carpetArea,
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
        frontView,
        sideView,
        kitchenView,
        hallView,
        bedroomView,
        bathroomView,
        balconyView,
        nearestLandmark,
        developedAmenities,
        toSlug(propertyName),
        currentdate,
        currentdate,
      ]);

    return res.status(201).json({
      message: "Property added successfully",
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};

// Update property controller
export const update = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.params.id;

  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  const files = await convertImagesToWebp(req.files);

  const {
    builderid,
    projectBy,
    possessionDate,
    propertyCategory,
    propertyApprovedBy,
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
    builtUpArea,
    carpetArea,
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
  } = req.body;

  // Validation
  if (
    !propertyCategory ||
    !propertyName ||
    !address ||
    !state ||
    !city ||
    !pincode ||
    !location ||
    !distanceFromCityCenter ||
    !latitude ||
    !longitude ||
    !totalSalesPrice ||
    !totalOfferPrice ||
    !stampDuty ||
    !other ||
    !tags ||
    !ownershipType ||
    !carpetArea ||
    !loanAvailability ||
    !propertyFacing ||
    !waterSupply ||
    !powerBackup ||
    !securityBenefit ||
    !primeLocationBenefit ||
    !rentalIncomeBenefit ||
    !capitalAppreciationBenefit ||
    !ecofriendlyBenefit
  ) {
    return res.status(400).json({ message: "All Fields are required" });
  }

  // Property Registration Fee calculation
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

  // Format Possession Date
  let formattedPossessionDate = null;
  if (possessionDate && possessionDate.trim() !== "") {
    if (
      moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
    ) {
      formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
    }
  }

  // Convert propertyType to array
  const propertyTypeArray = Array.isArray(propertyType)
    ? propertyType
    : typeof propertyType === "string"
      ? propertyType
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const propertyTypeJson = JSON.stringify(propertyTypeArray);

  try {
    // Fetch existing property
    const [existingResult] = await db
      .promise()
      .query("SELECT * FROM properties WHERE propertyid = ?", [Id]);

    if (!existingResult.length)
      return res.status(404).json({ message: "Property not found" });

    const existing = existingResult[0];

    // Function to upload new images to S3 or keep existing
    const getImagePaths = async (field) => {
      if (files?.[field]?.length) {
        const uploadedUrls = [];
        for (const file of files[field]) {
          const url = await uploadToS3(file);
          uploadedUrls.push(url);
        }
        return JSON.stringify(uploadedUrls);
      } else {
        return existing[field]; // keep old images
      }
    };

    const frontView = await getImagePaths("frontView");
    const sideView = await getImagePaths("sideView");
    const kitchenView = await getImagePaths("kitchenView");
    const hallView = await getImagePaths("hallView");
    const bedroomView = await getImagePaths("bedroomView");
    const bathroomView = await getImagePaths("bathroomView");
    const balconyView = await getImagePaths("balconyView");
    const nearestLandmark = await getImagePaths("nearestLandmark");
    const developedAmenities = await getImagePaths("developedAmenities");

    // Update query
    const updateSQL = `
      UPDATE properties SET 
        builderid=?, projectBy=?, possessionDate=?, propertyCategory=?, propertyApprovedBy=?, propertyName=?, address=?, state=?, city=?, pincode=?, location=?,
        distanceFromCityCenter=?, latitude=?, longitude=?, totalSalesPrice=?, totalOfferPrice=?, emi=?, stampDuty=?, registrationFee=?, gst=?, advocateFee=?, 
        msebWater=?, maintenance=?, other=?, tags=?, propertyType=?, builtYear=?, ownershipType=?,
        builtUpArea=?, carpetArea=?, parkingAvailability=?, totalFloors=?, floorNo=?, loanAvailability=?,
        propertyFacing=?, reraRegistered=?, furnishing=?, waterSupply=?, powerBackup=?, locationFeature=?, sizeAreaFeature=?, parkingFeature=?, terraceFeature=?,
        ageOfPropertyFeature=?, amenitiesFeature=?, propertyStatusFeature=?, smartHomeFeature=?,
        securityBenefit=?, primeLocationBenefit=?, rentalIncomeBenefit=?, qualityBenefit=?, capitalAppreciationBenefit=?, ecofriendlyBenefit=?,
        frontView=?, sideView=?, kitchenView=?, hallView=?, bedroomView=?, bathroomView=?, balconyView=?,
        nearestLandmark=?, developedAmenities=?, updated_at=?
      WHERE propertyid = ?
    `;

    const values = [
      builderid,
      sanitize(projectBy),
      sanitize(formattedPossessionDate),
      propertyCategory,
      propertyApprovedBy,
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
      emi,
      stampDuty,
      registrationFees,
      gst,
      advocateFee,
      msebWater,
      maintenance,
      other,
      tags,
      propertyTypeJson,
      builtYear,
      ownershipType,
      builtUpArea,
      carpetArea,
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
      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
      currentdate,
      Id,
    ];

    await db.promise().query(updateSQL, values);

    return res.status(200).json({ message: "Property updated successfully" });
  } catch (err) {
    console.error("Error updating property:", err);
    return res.status(500).json({ message: "Update failed", error: err });
  }
};

// **Delete Property + S3 Images**
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

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

  // Step 1: Fetch all image URLs from DB
  db.query(
    `SELECT ${imageFields.join(", ")} FROM properties WHERE propertyid = ?`,
    [Id],
    async (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = result[0];

      try {
        // Step 2: Delete images from S3
        for (const field of imageFields) {
          if (!property[field]) continue;

          const urls = JSON.parse(property[field]);

          if (Array.isArray(urls)) {
            for (const url of urls) {
              await deleteFromS3(url);
            }
          }
        }

        // Step 3: Delete property from DB
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
      } catch (s3Error) {
        console.error("S3 delete error:", s3Error);
        return res.status(500).json({
          message: "Failed to delete images from S3",
          error: s3Error,
        });
      }
    },
  );
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

//**approve property */
export const approve = (req, res) => {
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

      let approve = "";
      if (result[0].approve === "Not Approved" || "Rejected") {
        approve = "Approved";
      } else {
        approve = "Not Approved";
      }

      db.query(
        "UPDATE properties SET rejectreason = NULL, approve = ? WHERE propertyid = ?",
        [approve, Id],
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

//**Change property into hot deal */
export const hotDeal = (req, res) => {
  const Id = parseInt(req.params.id);
  //console.log(Id);
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

      let hotDeal = "";
      if (result[0].hotDeal === "Active") {
        hotDeal = "Inactive";
      } else {
        hotDeal = "Active";
      }
      //console.log(status);
      db.query(
        "UPDATE properties SET hotDeal = ? WHERE propertyid = ?",
        [hotDeal, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property change into hot deal successfully" });
        },
      );
    },
  );
};

//**Change property Reparv Assured */
export const reparvAssured = (req, res) => {
  const Id = parseInt(req.params.id);
  //console.log(Id);
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

      let reparvAssured = "";
      if (result[0].reparvAssured === "Active") {
        reparvAssured = "Inactive";
      } else {
        reparvAssured = "Active";
      }
      //console.log(status);
      db.query(
        "UPDATE properties SET reparvAssured = ? WHERE propertyid = ?",
        [hotDeal, Id],
        (err, result) => {
          if (err) {
            console.error("Error changing reparv assured status :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message: "Property reparv assured status change successfully",
          });
        },
      );
    },
  );
};

export const setTopPicks = async (req, res) => {
  const propertyId = req.params.id;

  if (!propertyId) {
    return res.status(400).json({ message: "Property ID is required" });
  }

  try {
    /* ---------- FETCH EXISTING BANNER ---------- */
    const [rows] = await db
      .promise()
      .query("SELECT topPicksBanner FROM properties WHERE propertyid = ?", [
        propertyId,
      ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    let bannerUrl = rows[0].topPicksBanner;

    /* ---------- IMAGE UPLOAD (COMPRESS → S3) ---------- */
    if (req.file) {
      const compressedImage = await convertSingleImageToWebp(req.file);

      if (compressedImage) {
        bannerUrl = await uploadToS3(compressedImage);
      }
    }

    const { topPicksStatus } = req.body;

    /* ---------- UPDATE PROPERTY ---------- */
    await db.promise().query(
      `
        UPDATE properties
        SET
          topPicksStatus = ?,
          topPicksBanner = ?,
          updated_at = NOW()
        WHERE propertyid = ?
      `,
      [topPicksStatus, bannerUrl, propertyId],
    );

    return res.status(200).json({
      message: "Top Picks updated successfully",
      data: {
        topPicksStatus,
        topPicksBanner: bannerUrl,
      },
    });
  } catch (error) {
    console.error("setTopPicks error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// get Property Location Latitude and Longitude
export const getPropertyLocation = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT latitude, longitude FROM properties
    WHERE properties.propertyid = ?
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property location:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    res.json(result[0]);
  });
};

//* Change Proprty Location */
export const changePropertyLocation = (req, res) => {
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET latitude = ?, longitude = ? WHERE propertyid = ?",
        [latitude, longitude, Id],
        (err, result) => {
          if (err) {
            console.error("Error While changing property location:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property Location Change Successfully" });
        },
      );
    },
  );
};

// * UPLOAD Brochure, Video & Video Link *
export const uploadBrochureAndVideo = (req, res) => {
  const propertyId = req.params.id;

  if (!propertyId) {
    return res.status(400).json({ message: "Property Id is required" });
  }

  const brochureFile = req.files?.brochureFile?.[0] || null; // brochure (image/pdf)
  const videoFile = req.files?.videoFile?.[0] || null; // video
  const { videoLink } = req.body; // YouTube link

  if (!brochureFile && !videoFile && !videoLink) {
    return res
      .status(400)
      .json({ message: "No brochure, video, or video link provided" });
  }

  const brochurePath = brochureFile
    ? `/uploads/brochures/${brochureFile.filename}`
    : null;
  const videoPath = videoFile ? `/uploads/videos/${videoFile.filename}` : null;

  // Get old file paths
  db.query(
    "SELECT brochureFile, videoFile, videoLink FROM properties WHERE propertyid = ?",
    [propertyId],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const oldBrochure = result[0].brochureFile;
      const oldVideo = result[0].videoFile;
      const oldVideoLink = result[0].videoLink;

      // Delete old files if new ones uploaded
      if (brochureFile && oldBrochure) {
        const oldPath = path.join(process.cwd(), oldBrochure);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      if (videoFile && oldVideo) {
        const oldPath = path.join(process.cwd(), oldVideo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Update DB with new paths or link
      db.query(
        "UPDATE properties SET brochureFile = ?, videoFile = ?, videoLink = ? WHERE propertyid = ?",
        [
          brochurePath || oldBrochure,
          videoPath || oldVideo,
          videoLink || oldVideoLink,
          propertyId,
        ],
        (err) => {
          if (err) {
            console.error("Error while saving brochure/video:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(200).json({
            message: "Brochure, Video, or Link uploaded successfully",
            brochurePath: brochurePath || oldBrochure,
            videoPath: videoPath || oldVideo,
            videoLink: videoLink || oldVideoLink,
          });
        },
      );
    },
  );
};

export const uploadBrochureAndVideoLink = async (req, res) => {
  try {
    const propertyId = req.params.id;
    if (!propertyId) {
      return res.status(400).json({ message: "Property Id is required" });
    }

    const brochureFile = req.file || null; // image / pdf
    const { videoLink } = req.body;

    if (!brochureFile && !videoLink) {
      return res
        .status(400)
        .json({ message: "No brochure or video link provided" });
    }

    /* ---------- FETCH OLD DATA ---------- */
    const [rows] = await db
      .promise()
      .query(
        "SELECT brochureFile, videoLink FROM properties WHERE propertyid = ?",
        [propertyId],
      );

    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    let brochureUrl = rows[0].brochureFile;
    let finalVideoLink = videoLink || rows[0].videoLink;

    /* ---------- UPLOAD BROCHURE ---------- */
    if (brochureFile) {
      let uploadFile = brochureFile;

      // Compress ONLY if image
      if (brochureFile.mimetype.startsWith("image/")) {
        const compressed = await convertSingleImageToWebp(brochureFile);
        if (compressed) uploadFile = compressed;
      }

      brochureUrl = await multipartUploadToS3(uploadFile);
    }

    /* ---------- UPDATE DB ---------- */
    await db.promise().query(
      `
        UPDATE properties
        SET brochureFile = ?, videoLink = ?, updated_at = NOW()
        WHERE propertyid = ?
      `,
      [brochureUrl, finalVideoLink, propertyId],
    );

    return res.status(200).json({
      message: "Brochure & Video Link updated successfully",
      brochureFile: brochureUrl,
      videoLink: finalVideoLink,
    });
  } catch (error) {
    console.error("uploadBrochureAndVideoLink error:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const deleteBrochureFile = async (req, res) => {
  try {
    const propertyId = req.params.id;
    if (!propertyId) {
      return res.status(400).json({ message: "Property Id is required" });
    }

    /* ---------- FETCH EXISTING BROCHURE ---------- */
    const [rows] = await db
      .promise()
      .query("SELECT brochureFile FROM properties WHERE propertyid = ?", [
        propertyId,
      ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    const brochureUrl = rows[0].brochureFile;

    /* ---------- DELETE FROM S3 ---------- */
    if (brochureUrl) {
      try {
        await deleteFromS3(brochureUrl);
      } catch (err) {
        console.warn("Failed to delete brochure from S3:", err.message);
      }
    }

    /* ---------- UPDATE DB ---------- */
    await db
      .promise()
      .query("UPDATE properties SET brochureFile = NULL WHERE propertyid = ?", [
        propertyId,
      ]);

    return res.status(200).json({
      message: "Brochure deleted successfully",
    });
  } catch (error) {
    console.error("deleteBrochureFile error:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const { seoSlug, pageTitle, seoTittle, seoDescription, propertyDescription } =
    req.body;
  if (!seoSlug || !seoTittle || !seoDescription || !propertyDescription) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET seoSlug = ?, pageTitle = ?, seoTittle = ?, seoDescription = ?, propertyDescription = ? WHERE propertyid = ?",
        [
          seoSlug,
          pageTitle,
          seoTittle,
          seoDescription,
          propertyDescription,
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
    },
  );
};

// Change Project Partner
export const changeProjectPartner = async (req, res) => {
  const { projectPartnerId, projectPartner, projectPartnerContact } = req.body;
  const Id = parseInt(req.params.id);

  if (!projectPartnerId) {
    return res.status(400).json({ message: "All Fields Required" });
  }

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      db.query(
        "UPDATE properties SET partnerid = NULL, employeeid = NULL, guestUserId = NULL, projectpartnerid = ? WHERE propertyid = ?",
        [projectPartnerId, Id],
        async (err, result) => {
          if (err) {
            console.error("Error changing project partner:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          return res.status(200).json({
            message: `Property assigned successfully to ${projectPartner}`,
          });
        },
      );
    },
  );
};

export const addRejectReason = (req, res) => {
  const { rejectReason } = req.body;
  if (!rejectReason) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET approve = 'Rejected', rejectreason = ? WHERE propertyid = ?",
        [rejectReason, Id],
        (err, result) => {
          if (err) {
            console.error("Error While Add Reject Reason :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property Reject Reason Add successfully" });
        },
      );
    },
  );
};

export const setPropertyCommission = (req, res) => {
  const {
    commissionType,
    commissionAmount,
    commissionPercentage,
    commissionAmountPerSquareFeet,
  } = req.body;

  const Id = parseInt(req.params.id);

  if (!commissionType || isNaN(Id)) {
    return res
      .status(400)
      .json({ message: "Commission type and valid Property ID are required" });
  }

  // Step 1: Fetch property to get required data
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = results[0];
      let updateSQL = "";
      let updateParams = [];

      // Step 2: Handle different commission types
      if (commissionType === "Fixed") {
        if (!commissionAmount) {
          return res
            .status(400)
            .json({ message: "commissionAmount is required for Fixed type" });
        }

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionPercentage = NULL, commissionAmountPerSquareFeet = NULL 
                   WHERE propertyid = ?`;
        updateParams = [commissionType, commissionAmount, Id];
      } else if (commissionType === "Percentage") {
        if (!commissionPercentage) {
          return res.status(400).json({
            message: "commissionPercentage is required for Percentage type",
          });
        }

        const totalPrice = parseFloat(property.totalOfferPrice || 0);
        const calculatedAmount = (totalPrice * commissionPercentage) / 100;

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionPercentage = ?, commissionAmountPerSquareFeet = NULL 
                   WHERE propertyid = ?`;
        updateParams = [
          commissionType,
          calculatedAmount,
          commissionPercentage,
          Id,
        ];
      } else if (commissionType === "PerSquareFeet") {
        if (!commissionAmountPerSquareFeet) {
          return res.status(400).json({
            message:
              "commissionAmountPerSquareFeet is required for PerSquareFeet type",
          });
        }

        const carpetArea = parseFloat(property.carpetArea || 0);
        const calculatedAmount = carpetArea * commissionAmountPerSquareFeet;

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionAmountPerSquareFeet = ?, commissionPercentage = NULL 
                   WHERE propertyid = ?`;
        updateParams = [
          commissionType,
          calculatedAmount,
          commissionAmountPerSquareFeet,
          Id,
        ];
      } else {
        return res.status(400).json({ message: "Invalid commission type" });
      }

      // Step 3: Run the update
      db.query(updateSQL, updateParams, (err, result) => {
        if (err) {
          console.error("Error While Updating Commission:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: "Property commission saved successfully" });
      });
    },
  );
};

// Get all images for a specific property
export const getImages = (req, res) => {
  const propertyId = parseInt(req.params.id);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  const sql = `
    SELECT frontView, sideView, hallView, kitchenView,
           bedroomView, balconyView, nearestLandmark,
           bathroomView, developedAmenities
    FROM properties
    WHERE propertyid = ?
  `;

  db.query(sql, [propertyId], (err, results) => {
    if (err) {
      console.error("Error fetching property images:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    return res.status(200).json(results[0]);
  });
};

// ** Add Property **
// ** Update Property Images (S3) **
export const updateImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (!Id || isNaN(Id)) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  try {
    const files = req.files || {};

    /* ---------- FETCH EXISTING PROPERTY ---------- */
    const [rows] = await db
      .promise()
      .query("SELECT * FROM properties WHERE propertyid = ?", [Id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    const existing = rows[0];

    /* ---------- COMPRESS IMAGES (WEBP) ---------- */
    const compressedFiles = await convertImagesToWebp(files);

    /* ---------- UPLOAD TO S3 ---------- */
    const uploadImagesToS3 = async (field) => {
      if (!compressedFiles[field]?.length) return null;

      const urls = await Promise.all(
        compressedFiles[field].map((file) => uploadToS3(file)),
      );

      return JSON.stringify(urls);
    };

    const frontView = await uploadImagesToS3("frontView");
    const sideView = await uploadImagesToS3("sideView");
    const kitchenView = await uploadImagesToS3("kitchenView");
    const hallView = await uploadImagesToS3("hallView");
    const bedroomView = await uploadImagesToS3("bedroomView");
    const bathroomView = await uploadImagesToS3("bathroomView");
    const balconyView = await uploadImagesToS3("balconyView");
    const nearestLandmark = await uploadImagesToS3("nearestLandmark");
    const developedAmenities = await uploadImagesToS3("developedAmenities");

    /* ---------- UPDATE DB ---------- */
    const updateSQL = `
      UPDATE properties SET 
        frontView = ?, 
        sideView = ?, 
        kitchenView = ?, 
        hallView = ?, 
        bedroomView = ?, 
        bathroomView = ?, 
        balconyView = ?, 
        nearestLandmark = ?, 
        developedAmenities = ?, 
        updated_at = ?
      WHERE propertyid = ?
    `;

    const values = [
      frontView || existing.frontView,
      sideView || existing.sideView,
      kitchenView || existing.kitchenView,
      hallView || existing.hallView,
      bedroomView || existing.bedroomView,
      bathroomView || existing.bathroomView,
      balconyView || existing.balconyView,
      nearestLandmark || existing.nearestLandmark,
      developedAmenities || existing.developedAmenities,
      currentdate,
      Id,
    ];

    await db.promise().query(updateSQL, values);

    return res.status(200).json({
      message: "Property images updated successfully",
    });
  } catch (err) {
    console.error("updateImages error:", err);
    return res.status(500).json({
      message: "Image upload failed",
      error: err.message,
    });
  }
};

// 🗑 Delete Images (S3)
export const deleteImages = async (req, res) => {
  const Id = parseInt(req.params.id);
  const imageType = req.query.type; // frontView, hallView, etc.

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  if (!imageType) {
    return res.status(400).json({ message: "Missing image type" });
  }

  try {
    // Fetch image URLs from DB
    db.query(
      `SELECT ?? FROM properties WHERE propertyid = ?`,
      [imageType, Id],
      async (err, result) => {
        if (err) {
          console.error("DB fetch error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        const images = JSON.parse(result[0][imageType] || "[]");

        if (!images.length) {
          return res.status(404).json({ message: "No images to delete" });
        }

        /* ☁ Delete all images from S3 */
        await Promise.all(images.map((url) => deleteFromS3(url)));

        // Clear DB field
        db.query(
          `UPDATE properties SET ?? = ? WHERE propertyid = ?`,
          [imageType, JSON.stringify([]), Id],
          (err) => {
            if (err) {
              console.error("DB update error:", err);
              return res.status(500).json({
                message: "Failed to update database",
                error: err,
              });
            }

            res.status(200).json({
              message: "Images deleted successfully from S3",
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("S3 delete error:", error);
    res.status(500).json({
      message: "Failed to delete images from S3",
      error: error.message,
    });
  }
};

// ** New Additional Info Add API **
export const additionalInfoAdd = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyid,
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  const insertSQL = `
    INSERT INTO propertiesinfo 
    (propertyid, wing, floor, flatno, direction, ageofconstruction, carpetarea, superbuiltup, salesprice, description, ownercontact,
      owneradhar, ownerpan, schedule, signed, satbara, ebill, updated_at, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSQL,
    [
      propertyid,
      wing,
      floor,
      flatno,
      direction,
      ageofconstruction,
      carpetarea,
      superbuiltup,
      salesprice,
      description,
      ownercontact,
      owneradhar,
      ownerpan,
      schedule,
      signed,
      satbara,
      ebill,
      currentdate,
      currentdate,
    ],
    (insertErr, insertResult) => {
      if (insertErr) {
        console.error("Error inserting:", insertErr);
        return res
          .status(500)
          .json({ message: "Database error", error: insertErr });
      }

      res.status(201).json({
        message: "Additional Info added successfully",
        Id: insertResult.insertId,
      });
    },
  );
};

// ** Additional Info Edit API **
export const editAdditionalInfo = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property Info ID" });
  }

  const {
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  // Start fields and values
  let updateFields = [
    "wing = ?",
    "floor = ?",
    "flatno = ?",
    "direction = ?",
    "ageofconstruction = ?",
    "carpetarea = ?",
    "superbuiltup = ?",
    "salesprice = ?",
    "description = ?",
    "ownercontact = ?",
    "updated_at = ?",
  ];

  const updateValues = [
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
    currentdate,
  ];

  // Dynamically add files if uploaded
  if (owneradhar) {
    updateFields.push("owneradhar = ?");
    updateValues.push(owneradhar);
  }
  if (ownerpan) {
    updateFields.push("ownerpan = ?");
    updateValues.push(ownerpan);
  }
  if (schedule) {
    updateFields.push("schedule = ?");
    updateValues.push(schedule);
  }
  if (signed) {
    updateFields.push("signed = ?");
    updateValues.push(signed);
  }
  if (satbara) {
    updateFields.push("satbara = ?");
    updateValues.push(satbara);
  }
  if (ebill) {
    updateFields.push("ebill = ?");
    updateValues.push(ebill);
  }

  const updateSQL = `UPDATE propertiesinfo SET ${updateFields.join(
    ", ",
  )} WHERE propertyinfoid = ?`;

  updateValues.push(Id);

  db.query(updateSQL, updateValues, (err, result) => {
    if (err) {
      console.error("Error updating:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.status(200).json({
      message: "Additional Info updated successfully",
      affectedRows: result.affectedRows,
    });
  });
};

// Get Property Info
export const propertyInfo = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const sql = "SELECT * FROM propertiesinfo WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(201).json({ propertyid: Id });
    }
    res.json(result[0]);
  });
};

// Add Additional Info Using CSV
export const addCsvFileForFlat = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const propertyId = parseInt(req.params?.propertyid);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const results = [];

  const filePath = req.file.path;

  const stream = fs.createReadStream(filePath).pipe(csv());

  let responded = false; // Prevent multiple responses

  stream.on("data", (row) => {
    results.push(row);
  });

  stream.on("end", () => {
    const values = results.map((row) => [
      row.propertyid || propertyId,
      row.Mouza || null,
      row.Khasra_No || null,
      row.Wing || null,
      row.Wing_Facing || null,
      row.Floor_No || null,
      row.Flat_No || null,
      row.Flat_Facing || null,
      row.BHK_Type || null,
      row.Carpet_Area || null,
      row.Builtup_Area || null,
      row.Super_Builtup_Area || null,
      row.Additional_Area || null,
      row.Payable_Area || null,
      row.SQFT_Price || null,
      row.Basic_Cost || null,
      row.Stamp_Duty || null,
      row.Registration || null,
      row.Advocate_Fee || null,
      row.GOV_Water_Charge || null,
      row.Maintenance || null,
      row.GST || null,
      row.Other_Charges || null,
      row.Total_Cost || null,
      row.updated_at || new Date(),
      row.created_at || new Date(),
    ]);

    const query = `
      INSERT INTO propertiesinfo (
        propertyid, mouza, khasrano, wing, wingfacing, floorno, flatno, flatfacing, type,
        carpetarea, builtuparea, superbuiltuparea, additionalarea, payablearea, sqftprice, basiccost,
        stampduty, registration, advocatefee, watercharge, maintenance, gst, other, totalcost,
        updated_at, created_at
      ) VALUES ?
    `;

    db.query(query, [values], (err, result) => {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });

      if (responded) return; // Avoid duplicate response
      if (err) {
        console.error("Database error:", err);
        responded = true;
        return res.status(500).json({
          message: "Failed to insert CSV data into database.",
          error: err.sqlMessage || err.message,
        });
      }

      responded = true;
      return res.status(200).json({
        message: "CSV data inserted successfully.",
        insertedRows: result.affectedRows,
      });
    });
  });

  stream.on("error", (csvError) => {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file after CSV error:", unlinkErr);
      }
    });

    if (!responded) {
      responded = true;
      console.error("CSV parsing error:", csvError);
      return res.status(500).json({
        message: "Error reading CSV file.",
        error: csvError.message,
      });
    }
  });
};

// Add Additional Info Using CSV
export const addCsvFileForPlot = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const propertyId = parseInt(req.params?.propertyid);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const results = [];

  const filePath = req.file.path;

  const stream = fs.createReadStream(filePath).pipe(csv());

  let responded = false; // Prevent multiple responses

  stream.on("data", (row) => {
    results.push(row);
  });

  stream.on("end", () => {
    const values = results.map((row) => [
      row.propertyid || propertyId,
      row.Mouza || null,
      row.Khasra_No || null,
      row.Plot_No || null,
      row.Facing || null,
      row.Plot_Size || null,
      row.Plot_Area || null,
      row.SQFT_Price || null,
      row.Basic_Cost || null,
      row.Stamp_Duty || null,
      row.Registration || null,
      row.Advocate_Fee || null,
      row.Maintenance || null,
      row.GST || null,
      row.Other_Charges || null,
      row.Total_Cost || null,
      row.updated_at || new Date(),
      row.created_at || new Date(),
    ]);

    const query = `
      INSERT INTO propertiesinfo (
        propertyid, mouza, khasrano, plotno, plotfacing, plotsize,
        payablearea, sqftprice, basiccost,
        stampduty, registration, advocatefee, maintenance, gst, other, totalcost,
        updated_at, created_at
      ) VALUES ?
    `;

    db.query(query, [values], (err, result) => {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });

      if (responded) return; // Avoid duplicate response
      if (err) {
        console.error("Database error:", err);
        responded = true;
        return res.status(500).json({
          message: "Failed to insert CSV data into database.",
          error: err.sqlMessage || err.message,
        });
      }

      responded = true;
      return res.status(200).json({
        message: "CSV data inserted successfully.",
        insertedRows: result.affectedRows,
      });
    });
  });

  stream.on("error", (csvError) => {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file after CSV error:", unlinkErr);
      }
    });

    if (!responded) {
      responded = true;
      console.error("CSV parsing error:", csvError);
      return res.status(500).json({
        message: "Error reading CSV file.",
        error: csvError.message,
      });
    }
  });
};

// ** Fetch Property Information by ID **
export const fetchAdditionalInfo = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property Details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    res.json(result); // Return only the first property
  });
};
