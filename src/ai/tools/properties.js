import db from "#db/promise";

const PROPERTY_BASE_URL =
  process.env.FRONTEND_URL ||
  process.env.REPARV_WEB_URL ||
  "https://www.reparv.in";

function parsePropertyType(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [String(p)];
  } catch {
    return [String(raw)];
  }
}

function parseAmenities(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.slice(0, 12);
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.slice(0, 12) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
}

function formatLakh(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function extractImagePaths(raw) {
  if (!raw) return [];
  if (typeof raw === "string" && raw.startsWith("http")) return [raw];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v || "").trim()).filter(Boolean);
    }
    if (typeof parsed === "string" && parsed) return [parsed];
  } catch {
    const text = String(raw).trim();
    if (text) return [text];
  }
  return [];
}

function toAbsoluteImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const cdn = process.env.ASSET_CDN_URL || process.env.AWS_PUBLIC_URL;
  if (cdn) {
    return `${cdn.replace(/\/$/, "")}${normalized}`;
  }

  if (
    normalized.startsWith("/uploads/") &&
    process.env.AWS_BUCKET_NAME &&
    process.env.AWS_REGION
  ) {
    const key = normalized.slice(1);
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  return normalized;
}

function resolveImageUrl(...sources) {
  for (const raw of sources) {
    for (const path of extractImagePaths(raw)) {
      const url = toAbsoluteImageUrl(path);
      if (url) return url;
    }
  }
  return null;
}

function buildPropertyUrl(seoSlug) {
  if (!seoSlug) return null;
  return `${PROPERTY_BASE_URL.replace(/\/$/, "")}/property-info/${seoSlug}`;
}

function normalizePropertyType(raw) {
  const t = String(raw || "").toLowerCase();
  if (/plot|land|zameen/.test(t)) return "Plot";
  if (/apartment|flat|bhk/.test(t)) return "Apartment";
  if (/villa|bungalow/.test(t)) return "Villa";
  if (/house|home|bungalow/.test(t)) return "House";
  if (/commercial|shop|office/.test(t)) return "Commercial";
  return raw;
}

async function runPropertySearch(filters = {}) {
  const {
    city,
    area,
    propertyType,
    budgetMin,
    budgetMax,
    bedrooms,
    possessionStatus,
    excludePropertyIds,
    offset = 0,
    sortVariant = 0,
    limit = 5,
  } = filters;

  const conditions = [
    "p.status = 'Active'",
    "p.approve = 'Approved'",
  ];
  const params = [];

  if (city) {
    conditions.push("LOWER(p.city) = LOWER(?)");
    params.push(city.trim());
  }
  if (area) {
    conditions.push("(p.location LIKE ? OR p.address LIKE ?)");
    params.push(`%${area}%`, `%${area}%`);
  }
  if (budgetMin != null && budgetMax != null) {
    conditions.push("p.totalSalesPrice BETWEEN ? AND ?");
    params.push(Number(budgetMin), Number(budgetMax));
  } else if (budgetMax != null) {
    conditions.push("p.totalSalesPrice <= ?");
    params.push(Number(budgetMax));
  } else if (budgetMin != null) {
    conditions.push("p.totalSalesPrice >= ?");
    params.push(Number(budgetMin));
  }
  if (propertyType) {
    const normalized = normalizePropertyType(propertyType);
    conditions.push(
      "(p.propertyCategory LIKE ? OR p.propertyType LIKE ? OR p.propertyCategory LIKE ? OR p.propertyType LIKE ?)",
    );
    params.push(
      `%${normalized}%`,
      `%${normalized}%`,
      `%${propertyType}%`,
      `%${propertyType}%`,
    );
  }
  if (possessionStatus) {
    conditions.push("(p.propertyStatusFeature LIKE ? OR p.possessionDate IS NOT NULL)");
    params.push(`%${possessionStatus}%`);
  }

  const bedroomClause = bedrooms
    ? `AND EXISTS (
        SELECT 1 FROM propertiesinfo pi2
        WHERE pi2.propertyid = p.propertyid
          AND pi2.status = 'Available'
          AND (pi2.type LIKE ? OR pi2.flatno LIKE ?)
      )`
    : "";

  const bedroomParams = bedrooms ? [`%${bedrooms}%`, `%${bedrooms}%`] : [];

  const excludeIds = (Array.isArray(excludePropertyIds) ? excludePropertyIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (excludeIds.length) {
    conditions.push(`p.propertyid NOT IN (${excludeIds.map(() => "?").join(", ")})`);
    params.push(...excludeIds);
  }

  const orderClause =
    Number(sortVariant) % 2 === 1
      ? "ORDER BY p.updated_at DESC, p.propertyid DESC"
      : "ORDER BY p.totalSalesPrice ASC, p.propertyid ASC";

  const safeOffset = Math.max(0, Number(offset) || 0);

  const sql = `
    SELECT
      p.propertyid,
      p.propertyName AS projectName,
      p.city,
      p.location,
      p.address,
      p.totalSalesPrice AS price,
      p.propertyCategory,
      p.propertyType,
      p.possessionDate,
      p.amenitiesFeature,
      p.seoSlug,
      p.frontView,
      (
        SELECT img.image
        FROM propertiesimages img
        WHERE img.propertyid = p.propertyid
        ORDER BY img.imageid ASC
        LIMIT 1
      ) AS galleryImage,
      MIN(pi.totalcost) AS minUnitPrice,
      GROUP_CONCAT(DISTINCT pi.type ORDER BY pi.type SEPARATOR ', ') AS unitTypes
    FROM properties p
    LEFT JOIN propertiesinfo pi
      ON pi.propertyid = p.propertyid AND pi.status = 'Available'
    WHERE ${conditions.join(" AND ")}
    ${bedroomClause}
    GROUP BY p.propertyid
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const [rows] = await db.query(sql, [
    ...params,
    ...bedroomParams,
    Math.min(Math.max(Number(limit) || 5, 1), 15),
    safeOffset,
  ]);

  return rows.map((row, index) => {
    const types = parsePropertyType(row.propertyType);
    const priceNum = Number(row.minUnitPrice) || Number(row.price) || 0;
    return {
      rank: index + 1,
      propertyId: row.propertyid,
      projectName: row.projectName,
      location: [row.location, row.city].filter(Boolean).join(", "),
      city: row.city,
      price: formatLakh(priceNum) || "Price on request",
      priceInr: priceNum,
      area: row.address || row.location,
      bedrooms: row.unitTypes || types.join(", ") || null,
      propertyType: row.propertyCategory || types[0] || null,
      possessionDate: row.possessionDate,
      amenities: parseAmenities(row.amenitiesFeature),
      seoSlug: row.seoSlug,
      imageUrl: resolveImageUrl(row.frontView, row.galleryImage),
      url: buildPropertyUrl(row.seoSlug),
    };
  });
}

export async function propertySearch(filters = {}) {
  const searchFilters = {
    ...filters,
    sortVariant: filters.sortVariant ?? filters.searchRound ?? 0,
  };
  let results = await runPropertySearch(searchFilters);

  if (results.length === 0 && (searchFilters.budgetMin != null || searchFilters.budgetMax != null)) {
    const { budgetMin, budgetMax, ...broader } = searchFilters;
    results = await runPropertySearch(broader);
  }

  if (results.length === 0 && searchFilters.bedrooms) {
    const { bedrooms, ...broader } = searchFilters;
    results = await runPropertySearch(broader);
  }

  if (results.length === 0 && searchFilters.area) {
    const { area, ...broader } = searchFilters;
    results = await runPropertySearch(broader);
  }

  if (results.length === 0 && searchFilters.possessionStatus) {
    const { possessionStatus, ...broader } = searchFilters;
    results = await runPropertySearch(broader);
  }

  return results;
}

export async function getPropertyById(propertyId) {
  const [rows] = await db.query(
    `SELECT p.*,
      GROUP_CONCAT(DISTINCT pi.type ORDER BY pi.type SEPARATOR ', ') AS unitTypes
     FROM properties p
     LEFT JOIN propertiesinfo pi ON pi.propertyid = p.propertyid
     WHERE p.propertyid = ? AND p.status = 'Active' AND p.approve = 'Approved'
     GROUP BY p.propertyid
     LIMIT 1`,
    [propertyId],
  );
  if (!rows?.length) return null;
  const p = rows[0];
  return {
    propertyId: p.propertyid,
    projectName: p.propertyName,
    city: p.city,
    location: p.location,
    address: p.address,
    totalSalesPrice: p.totalSalesPrice,
    possessionDate: p.possessionDate,
    amenities: parseAmenities(p.amenitiesFeature),
    propertyCategory: p.propertyCategory,
    unitTypes: p.unitTypes,
    description: p.description || null,
  };
}

export async function findPropertyByName(projectName) {
  const [rows] = await db.query(
    `SELECT propertyid, propertyName, city, location, totalSalesPrice
     FROM properties
     WHERE status = 'Active' AND approve = 'Approved'
       AND propertyName LIKE ?
     ORDER BY propertyid DESC
     LIMIT 3`,
    [`%${projectName}%`],
  );
  return rows;
}
