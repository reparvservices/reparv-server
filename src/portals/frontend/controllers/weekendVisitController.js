import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const formatPropertyRow = (row) => {
  let parsedType = [];

  try {
    parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
  } catch {
    parsedType = [];
  }

  return {
    ...row,
    propertyType: parsedType,
    likes: Number(row.likes) || 0,
    views: Number(row.views) || 0,
  };
};

const normalizeLocation = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const titleCaseLocation = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const CATEGORY_LABELS = {
  NewFlat: "new flats",
  NewPlot: "residential plots",
  Resale: "resale homes",
  ResaleFlat: "resale flats",
  RentalFlat: "rental flats",
  RentalOffice: "rental offices",
  RentalShop: "commercial rentals",
};

const IDEAL_FOR = {
  NewFlat: "Home buyers & families",
  NewPlot: "Plot buyers & investors",
  Resale: "End-user homebuyers",
  ResaleFlat: "End-user homebuyers",
  RentalFlat: "Tenants & investors",
  RentalOffice: "Business owners",
  RentalShop: "Retail & business owners",
};

function buildLocalitySnapshots(properties) {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: titleCaseLocation(property.location),
        properties: [],
        categories: {},
        distances: [],
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const category = property.propertyCategory || "Property";
    group.categories[category] = (group.categories[category] || 0) + 1;

    const distance = Number(property.distanceFromCityCenter);
    if (!Number.isNaN(distance) && distance > 0) {
      group.distances.push(distance);
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 6)
    .map((group) => {
      const dominantCategory = Object.entries(group.categories).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];

      const avgDistance = group.distances.length
        ? (
            group.distances.reduce((sum, value) => sum + value, 0) /
            group.distances.length
          ).toFixed(1)
        : null;

      const listingLabel =
        CATEGORY_LABELS[dominantCategory] || "verified listings";
      const count = group.properties.length;
      const sampleProperty = group.properties[0];

      let description = `${count} verified ${listingLabel} available in ${group.title}.`;
      if (avgDistance) {
        description += ` Typical distance from city center is about ${avgDistance} km — worth checking on a weekend before you decide.`;
      } else {
        description += ` Plan a weekend visit to review traffic, utilities, and neighborhood livability in person.`;
      }

      return {
        title: group.title,
        description,
        idealFor: IDEAL_FOR[dominantCategory] || "Home buyers & investors",
        bestTime: "Saturday 8–10 AM",
        propertyCount: count,
        sampleSlug: sampleProperty?.seoSlug || null,
        sampleFrontView: sampleProperty?.frontView || null,
      };
    });
}

export const getWeekendVisitPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const propertiesSql = `
      SELECT
        p.*,
        pp.fullname AS partnerName,
        ${VIEWS_EXPR} AS views,
        COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes
      FROM properties p
      LEFT JOIN projectpartner pp ON pp.id = p.projectpartnerid
      LEFT JOIN property_analytics
        ON property_analytics.property_id = p.propertyid
      LEFT JOIN user_property_wishlist
        ON user_property_wishlist.property_id = p.propertyid
      WHERE p.status = 'Active'
        AND p.approve = 'Approved'
        AND TRIM(p.city) = ?
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const filterCitiesSql = `
      SELECT DISTINCT TRIM(city) AS city
      FROM properties
      WHERE status = 'Active'
        AND approve = 'Approved'
        AND TRIM(city) <> ''
      ORDER BY city ASC
    `;

    const [[propertyRows], [filterCityRows]] = await Promise.all([
      dbPromise.query(propertiesSql, [city]),
      dbPromise.query(filterCitiesSql),
    ]);

    const formattedProperties = propertyRows.map(formatPropertyRow);
    const localityKeys = new Set(
      formattedProperties
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    );

    return res.json({
      city,
      stats: {
        verifiedProperties: formattedProperties.length,
        localities: localityKeys.size,
        weekendSlots: Math.min(formattedProperties.length, 20),
      },
      properties: formattedProperties.slice(0, 8),
      localities: buildLocalitySnapshots(formattedProperties),
      filterCities: filterCityRows.map((row) => row.city),
    });
  } catch (error) {
    console.error("getWeekendVisitPageData:", error);
    return res.status(500).json({ message: "Failed to fetch weekend visit data" });
  }
};
