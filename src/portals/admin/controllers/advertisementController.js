import dbPromise from "#db/promise";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";

// Real-estate related ad categories shown in the admin form and on the website.
export const AD_CATEGORIES = [
  "Furniture",
  "Interior Design",
  "Home Loans",
  "Packers & Movers",
  "Home Appliances",
  "Building Materials",
  "Modular Kitchen",
  "Home Decor",
  "Legal & Documentation",
  "Home Services",
  "Other",
];

const SELECT_FIELDS = `
  id, title, advertiserName, category, description, imageUrl, ctaLabel,
  targetUrl, contactPhone, city, displayOrder, status,
  DATE_FORMAT(startDate, '%Y-%m-%d') AS startDate,
  DATE_FORMAT(endDate, '%Y-%m-%d') AS endDate,
  clicks, created_at, updated_at`;

const clean = (v) => (typeof v === "string" ? v.trim() : v ?? "");
const orNull = (v) => {
  const s = clean(v);
  return s === "" ? null : s;
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// Validates the form body. Returns { error } or { values }.
export function readAdBody(body) {
  const values = {
    title: clean(body.title),
    advertiserName: clean(body.advertiserName),
    category: clean(body.category),
    description: orNull(body.description),
    ctaLabel: orNull(body.ctaLabel),
    targetUrl: orNull(body.targetUrl),
    contactPhone: orNull(body.contactPhone),
    city: orNull(body.city),
    displayOrder: Number.parseInt(body.displayOrder, 10) || 0,
    startDate: orNull(body.startDate),
    endDate: orNull(body.endDate),
  };

  if (!values.title) return { error: "Title is required." };
  if (values.title.length > 120) return { error: "Title must be 120 characters or less." };
  if (!values.advertiserName) return { error: "Advertiser name is required." };
  if (values.advertiserName.length > 120)
    return { error: "Advertiser name must be 120 characters or less." };
  if (!AD_CATEGORIES.includes(values.category)) return { error: "Choose a valid category." };
  if (values.description && values.description.length > 300)
    return { error: "Description must be 300 characters or less." };
  if (values.ctaLabel && values.ctaLabel.length > 40)
    return { error: "Button text must be 40 characters or less." };
  if (values.city && values.city.length > 80) return { error: "City name is too long." };

  if (values.targetUrl) {
    // Only real web links: blocks javascript: and other schemes on the website.
    let parsed;
    try {
      parsed = new URL(values.targetUrl);
    } catch {
      return { error: "Website link must be a full URL, e.g. https://example.com" };
    }
    if (!["http:", "https:"].includes(parsed.protocol))
      return { error: "Website link must start with http:// or https://" };
    if (values.targetUrl.length > 500) return { error: "Website link is too long." };
  }

  if (values.contactPhone) {
    values.contactPhone = values.contactPhone.replace(/[\s-]/g, "");
    if (!/^\+?\d{10,13}$/.test(values.contactPhone))
      return { error: "Contact number must be 10 to 13 digits." };
  }

  if (!values.targetUrl && !values.contactPhone)
    return { error: "Add a website link or a contact number so visitors can reach the advertiser." };

  if (values.startDate && !isDate(values.startDate)) return { error: "Start date is invalid." };
  if (values.endDate && !isDate(values.endDate)) return { error: "End date is invalid." };
  if (values.startDate && values.endDate && values.endDate < values.startDate)
    return { error: "End date cannot be before the start date." };

  return { values };
}

// S3 keys come from the file name; keep them URL-safe.
const uploadAdImage = (file) =>
  uploadToS3({
    ...file,
    originalname: `ad-${file.originalname}`.replace(/[^A-Za-z0-9._-]+/g, "-"),
  });

const safeDeleteFromS3 = async (url) => {
  try {
    await deleteFromS3(url);
  } catch (err) {
    console.error("Advertisement image delete failed:", err.message);
  }
};

export const getCategories = (req, res) => res.json(AD_CATEGORIES);

export const getAll = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT ${SELECT_FIELDS},
        CASE
          WHEN status <> 'Active' THEN 'Inactive'
          WHEN startDate IS NOT NULL AND startDate > CURDATE() THEN 'Scheduled'
          WHEN endDate IS NOT NULL AND endDate < CURDATE() THEN 'Expired'
          ELSE 'Live'
        END AS liveState
       FROM advertisements
       ORDER BY displayOrder ASC, id DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching advertisements:", err);
    res.status(500).json({ message: "Database error" });
  }
};

export const getById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT ${SELECT_FIELDS} FROM advertisements WHERE id = ?`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ message: "Advertisement not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching advertisement:", err);
    res.status(500).json({ message: "Database error" });
  }
};

export const add = async (req, res) => {
  const { error, values } = readAdBody(req.body);
  if (error) return res.status(400).json({ message: error });
  if (!req.file) return res.status(400).json({ message: "Advertisement image is required." });

  let imageUrl;
  try {
    imageUrl = await uploadAdImage(req.file);
  } catch (err) {
    console.error("Advertisement image upload failed:", err);
    return res.status(502).json({ message: "Image upload failed. Please try again." });
  }

  try {
    const [result] = await dbPromise.query(
      `INSERT INTO advertisements
        (title, advertiserName, category, description, imageUrl, ctaLabel, targetUrl,
         contactPhone, city, displayOrder, startDate, endDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values.title,
        values.advertiserName,
        values.category,
        values.description,
        imageUrl,
        values.ctaLabel,
        values.targetUrl,
        values.contactPhone,
        values.city,
        values.displayOrder,
        values.startDate,
        values.endDate,
      ],
    );
    res.status(201).json({ message: "Advertisement added successfully.", id: result.insertId });
  } catch (err) {
    console.error("Error adding advertisement:", err);
    await safeDeleteFromS3(imageUrl);
    res.status(500).json({ message: "Database error" });
  }
};

export const edit = async (req, res) => {
  const { error, values } = readAdBody(req.body);
  if (error) return res.status(400).json({ message: error });

  let existing;
  try {
    const [rows] = await dbPromise.query("SELECT imageUrl FROM advertisements WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: "Advertisement not found." });
    existing = rows[0];
  } catch (err) {
    console.error("Error loading advertisement:", err);
    return res.status(500).json({ message: "Database error" });
  }

  let imageUrl = existing.imageUrl;
  if (req.file) {
    try {
      imageUrl = await uploadAdImage(req.file);
    } catch (err) {
      console.error("Advertisement image upload failed:", err);
      return res.status(502).json({ message: "Image upload failed. Please try again." });
    }
  }

  try {
    await dbPromise.query(
      `UPDATE advertisements SET
        title = ?, advertiserName = ?, category = ?, description = ?, imageUrl = ?,
        ctaLabel = ?, targetUrl = ?, contactPhone = ?, city = ?, displayOrder = ?,
        startDate = ?, endDate = ?
       WHERE id = ?`,
      [
        values.title,
        values.advertiserName,
        values.category,
        values.description,
        imageUrl,
        values.ctaLabel,
        values.targetUrl,
        values.contactPhone,
        values.city,
        values.displayOrder,
        values.startDate,
        values.endDate,
        req.params.id,
      ],
    );
  } catch (err) {
    console.error("Error updating advertisement:", err);
    if (imageUrl !== existing.imageUrl) await safeDeleteFromS3(imageUrl);
    return res.status(500).json({ message: "Database error" });
  }

  // Old image is only removed once the row points at the new one.
  if (imageUrl !== existing.imageUrl) await safeDeleteFromS3(existing.imageUrl);
  res.json({ message: "Advertisement updated successfully." });
};

export const status = async (req, res) => {
  try {
    const [result] = await dbPromise.query(
      `UPDATE advertisements
       SET status = IF(status = 'Active', 'Inactive', 'Active')
       WHERE id = ?`,
      [req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Advertisement not found." });
    res.json({ message: "Advertisement status changed." });
  } catch (err) {
    console.error("Error changing advertisement status:", err);
    res.status(500).json({ message: "Database error" });
  }
};

export const del = async (req, res) => {
  try {
    const [rows] = await dbPromise.query("SELECT imageUrl FROM advertisements WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: "Advertisement not found." });
    await dbPromise.query("DELETE FROM advertisements WHERE id = ?", [req.params.id]);
    await safeDeleteFromS3(rows[0].imageUrl);
    res.json({ message: "Advertisement deleted successfully." });
  } catch (err) {
    console.error("Error deleting advertisement:", err);
    res.status(500).json({ message: "Database error" });
  }
};

// ---------- Website (public) ----------

// Live ads for a city: active, inside the date window, and for that city or all cities.
export const getLive = async (req, res) => {
  const city = clean(req.query.city).slice(0, 80);
  try {
    const [rows] = await dbPromise.query(
      `SELECT id, title, advertiserName, category, description, imageUrl, ctaLabel,
              targetUrl, contactPhone
       FROM advertisements
       WHERE status = 'Active'
         AND (startDate IS NULL OR startDate <= CURDATE())
         AND (endDate IS NULL OR endDate >= CURDATE())
         AND (city IS NULL OR city = ?)
       ORDER BY displayOrder ASC, id DESC
       LIMIT 12`,
      [city],
    );
    res.set("Cache-Control", "public, max-age=60");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching live advertisements:", err);
    res.status(500).json({ message: "Database error" });
  }
};

export const trackClick = async (req, res) => {
  try {
    await dbPromise.query(
      "UPDATE advertisements SET clicks = clicks + 1 WHERE id = ? AND status = 'Active'",
      [req.params.id],
    );
  } catch (err) {
    console.error("Error tracking advertisement click:", err);
  }
  res.status(204).end();
};
