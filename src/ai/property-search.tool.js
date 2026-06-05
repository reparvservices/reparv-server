import db from "#db/promise";

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

/**
 * Search properties from MySQL (existing CRM `properties` + `propertiesinfo`).
 */
export async function propertySearch(filters = {}) {
  const {
    city,
    area,
    propertyType,
    budgetMin,
    budgetMax,
    bedrooms,
    possessionStatus,
    limit = 5,
  } = filters;

  const conditions = [
    "p.status = 'Active'",
    "p.approve = 'Approved'",
  ];
  const params = [];

  if (city) {
    conditions.push("p.city = ?");
    params.push(city);
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
    conditions.push("(p.propertyCategory LIKE ? OR p.propertyType LIKE ?)");
    params.push(`%${propertyType}%`, `%${propertyType}%`);
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
      MIN(pi.totalcost) AS minUnitPrice,
      GROUP_CONCAT(DISTINCT pi.type ORDER BY pi.type SEPARATOR ', ') AS unitTypes
    FROM properties p
    LEFT JOIN propertiesinfo pi
      ON pi.propertyid = p.propertyid AND pi.status = 'Available'
    WHERE ${conditions.join(" AND ")}
    ${bedroomClause}
    GROUP BY p.propertyid
    ORDER BY p.totalSalesPrice ASC
    LIMIT ?
  `;

  const [rows] = await db.query(sql, [
    ...params,
    ...bedroomParams,
    Math.min(Math.max(Number(limit) || 5, 1), 15),
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
    };
  });
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
