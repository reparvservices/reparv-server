import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { convertImagesToWebp } from "../../utils/convertImagesToWebp.js";
import { sanitize } from "../../utils/sanitize.js";

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
  const sql = `SELECT properties.*, builders.company_name FROM properties 
               INNER JOIN builders ON properties.builderid = builders.builderid 
               WHERE properties.guestUserId = ? 
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [req.guestUser?.id], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single Property by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const sql = `SELECT properties.*, builders.company_name FROM properties 
  INNER JOIN builders on builders.builderid = properties.builderid
  WHERE properties.propertyid = ?`;

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

// get all images
export const getImages = (req, res) => {
  const partnerId = req.user.id;
  if (!partnerId) {
    return res.status(400).json({ message: "Unauthorized Access" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = "SELECT * FROM propertiesimages WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property images:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }
    res.json(result);
  });
};

export const addProperty = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const files = await convertImagesToWebp(req.files);
  const partnerId = req.guestUser?.id;

  if (!partnerId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  // Convert property type to array
  let propertyTypeArray =
    typeof req.body.propertyType === "string"
      ? req.body.propertyType.split(",").map((i) => i.trim())
      : Array.isArray(req.body.propertyType)
      ? req.body.propertyType
      : [];

  const propertyTypeJson = JSON.stringify(propertyTypeArray);

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

  // Required field validation omitted for brevity...

  // Registration fee
  let registrationFees;
  if (totalOfferPrice > 3000000) {
    registrationFees = (30000 / totalOfferPrice) * 100;
  } else {
    registrationFees = ["RentalFlat", "RentalShop", "RentalOffice"].includes(
      propertyCategory
    )
      ? 0
      : 1;
  }

  const emi = calculateEMI(Number(totalOfferPrice));

  let formattedPossessionDate = null;
  if (
    possessionDate &&
    moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
  ) {
    formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
  }

  const getImagePaths = (field) =>
    files[field]
      ? JSON.stringify(files[field].map((f) => `/uploads/${f.filename}`))
      : null;

  const frontView = getImagePaths("frontView");
  const sideView = getImagePaths("sideView");
  const kitchenView = getImagePaths("kitchenView");
  const hallView = getImagePaths("hallView");
  const bedroomView = getImagePaths("bedroomView");
  const bathroomView = getImagePaths("bathroomView");
  const balconyView = getImagePaths("balconyView");
  const nearestLandmark = getImagePaths("nearestLandmark");
  const developedAmenities = getImagePaths("developedAmenities");

  // Check propertyName duplicate
  db.query(
    "SELECT propertyid FROM properties WHERE propertyName = ?",
    [propertyName],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });
      if (result.length > 0)
        return res
          .status(409)
          .json({ message: "Property name already exists!" });

      // Insert property (only ONCE)
      const insertSQL = `
        INSERT INTO properties (
          guestUserId, builderid, projectBy, possessionDate, propertyCategory,
          propertyApprovedBy, propertyName, address, state, city, pincode,
          location, distanceFromCityCenter, latitude, longitude, totalSalesPrice,
          totalOfferPrice, emi, stampDuty, registrationFee, gst, advocateFee,
          msebWater, maintenance, other, tags, propertyType, builtYear,
          ownershipType, builtUpArea, carpetArea, parkingAvailability,
          totalFloors, floorNo, loanAvailability, propertyFacing, reraRegistered,
          furnishing, waterSupply, powerBackup, locationFeature, sizeAreaFeature,
          parkingFeature, terraceFeature, ageOfPropertyFeature, amenitiesFeature,
          propertyStatusFeature, smartHomeFeature, securityBenefit,
          primeLocationBenefit, rentalIncomeBenefit, qualityBenefit,
          capitalAppreciationBenefit, ecofriendlyBenefit,
          frontView, sideView, kitchenView, hallView, bedroomView,
          bathroomView, balconyView, nearestLandmark, developedAmenities,
          updated_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,)
      `;

      const values = [
        partnerId,
        builderid,
        sanitize(projectBy),
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
        currentdate,
        currentdate,
      ];

      db.query(insertSQL, values, (err, result) => {
        if (err)
          return res.status(500).json({ message: "Insert failed", error: err });

        const newPropertyId = result.insertId;

        // Get cityNACL
        db.query(
          "SELECT cityNACL FROM cities WHERE city = ? LIMIT 1",
          [city],
          (err2, cityResult) => {
            if (err2)
              return res
                .status(500)
                .json({ message: "City lookup failed", error: err2 });

            if (cityResult.length === 0)
              return res
                .status(404)
                .json({ message: "City not found in database" });

            const cityNACL = cityResult[0].cityNACL;
            const propertyCityId = `${cityNACL}-${newPropertyId}`;

            // Update propertyCityId
            db.query(
              "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
              [propertyCityId, newPropertyId],
              (err3) => {
                if (err3)
                  return res.status(500).json({
                    message: "Failed to update propertyCityId",
                    error: err3,
                  });

                return res.status(201).json({
                  message: "Property added successfully",
                  id: newPropertyId,
                  propertyCityId,
                });
              }
            );
          }
        );
      });
    }
  );
};

export const update = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const files = await convertImagesToWebp(req.files);
  const partnerId = req.guestUser?.id;
  if (!partnerId) {
    return res.status(400).json({ message: "Unauthorized Access" });
  }
  const Id = req.params.id ? parseInt(req.params.id) : null;

  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

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
    registrationFee,
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

  if (
    !builderid ||
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
    !builtYear ||
    !ownershipType ||
    !carpetArea ||
    !parkingAvailability ||
    !loanAvailability ||
    !propertyFacing ||
    !waterSupply ||
    !powerBackup ||
    !locationFeature ||
    !sizeAreaFeature ||
    !parkingFeature ||
    !ageOfPropertyFeature ||
    !amenitiesFeature ||
    !propertyStatusFeature ||
    !securityBenefit ||
    !primeLocationBenefit ||
    !rentalIncomeBenefit ||
    !capitalAppreciationBenefit ||
    !ecofriendlyBenefit
  ) {
    return res.status(400).json({ message: "All Fields are required" });
  }

  // Property Registration Fee is 1% or Maximum 30,000 Rs
  let registrationFees;
  if (totalOfferPrice > 3000000) {
    registrationFees = (30000 / totalOfferPrice) * 100;
  } else {
    if (
      ["RentalFlat", "RentalShop", "RentalOffice"].includes(propertyCategory)
    ) {
      registrationFees = 0;
    } else {
      registrationFees = 1;
    }
  }

  // calculate EMI On OFFER PRICE
  const emi = calculateEMI(Number(totalOfferPrice));

  // Format dates to remove time portion
  let formattedPossessionDate = null;

  if (possessionDate && possessionDate.trim() !== "") {
    // Check if it's a valid date
    if (
      moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
    ) {
      formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
    } else {
      formattedPossessionDate = null; // fallback instead of "Invalid date"
    }
  }
  // Convert Property Type Into Array
  let propertyTypeArray;

  if (Array.isArray(propertyType)) {
    // already an array
    propertyTypeArray = propertyType;
  } else if (typeof propertyType === "string") {
    // convert comma-separated string into array
    propertyTypeArray = propertyType
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""); // remove empty values
  } else {
    propertyTypeArray = [];
  }

  const propertyTypeJson = JSON.stringify(propertyTypeArray);

  // Prepare image URLs
  const getImagePaths = (field, existing) =>
    files && files[field]
      ? JSON.stringify(files[field].map((f) => `/uploads/${f.filename}`))
      : existing;

  // Fetch existing property to preserve images if not reuploaded
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      let approve;
      if (
        result[0].approve === "Rejected" ||
        result[0].approve === "Not Approved"
      ) {
        approve = "Not Approved";
      } else {
        approve = "Approved";
      }

      const existing = result[0];

      const updateSQL = `
      UPDATE properties SET rejectreason=NULL, approve=?,
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
        approve,
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
        getImagePaths("frontView", existing.frontView),
        getImagePaths("sideView", existing.sideView),
        getImagePaths("kitchenView", existing.kitchenView),
        getImagePaths("hallView", existing.hallView),
        getImagePaths("bedroomView", existing.bedroomView),
        getImagePaths("bathroomView", existing.bathroomView),
        getImagePaths("balconyView", existing.balconyView),
        getImagePaths("nearestLandmark", existing.nearestLandmark),
        getImagePaths("developedAmenities", existing.developedAmenities),
        currentdate,
        Id,
      ];

      db.query(updateSQL, values, (err) => {
        if (err) {
          console.error("Error updating property:", err);
          return res.status(500).json({ message: "Update failed", error: err });
        }

        res.status(200).json({ message: "Property updated successfully" });
      });
    }
  );
};

export const addImages = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.body.propertyid ? parseInt(req.body.propertyid) : null;

  try {
    const files = req.files; // Array of uploaded files
    const imagePaths = files.map((file) => file.filename); // Get filenames

    // Insert each image as a separate row
    const insertSQL = `INSERT INTO propertiesimages (propertyid, image, updated_at, created_at) 
                       VALUES ?`;

    const values = imagePaths.map((filename) => [
      Id,
      filename,
      currentdate,
      currentdate,
    ]);

    db.query(insertSQL, [values], (err, result) => {
      if (err) {
        console.error("Error inserting Images:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Images uploaded", images: imagePaths });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
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
    }
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
    ", "
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

export const deleteImages = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  // First, fetch the image path from the database
  db.query(
    "SELECT image FROM propertiesimages WHERE imageid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Error fetching image:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const imagePath = result[0].image; // Get the image path
      if (imagePath) {
        const filePath = path.join(process.cwd(), imagePath); // Full path to the file

        // Delete the image file from the uploads folder
        fs.unlink(filePath, (err) => {
          if (err && err.code !== "ENOENT") {
            console.error("Error deleting image:", err);
          }

          // Now delete the record from the database
          db.query(
            "DELETE FROM propertiesimages WHERE imageid = ?",
            [Id],
            (err) => {
              if (err) {
                console.error("Error deleting Image:", err);
                return res
                  .status(500)
                  .json({ message: "Database error", error: err });
              }
              res.status(200).json({ message: "Image deleted successfully" });
            }
          );
        });
      } else {
        res.status(404).json({ message: "Image path not found" });
      }
    }
  );
};

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
