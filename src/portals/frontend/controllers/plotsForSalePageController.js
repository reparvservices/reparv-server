import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const PLOT_CATEGORIES = ["NewPlot", "CommercialPlot", "FarmLand", "FarmHouse"];

const RESIDENTIAL_CATEGORIES = ["NewPlot", "FarmLand", "FarmHouse"];

const CATEGORY_SUBTITLES = {
  NewPlot: "Residential Layout",
  CommercialPlot: "Commercial Zone",
  FarmLand: "Farm & Land",
  FarmHouse: "Farm House Plot",
};

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

const getPlotArea = (property) => {
  const area = Number(
    property.carpetArea || property.builtUpArea || property.sizeAreaFeature,
  );
  return area > 0 ? area : null;
};

const getPricePerSqft = (property) => {
  const price = Number(property.totalOfferPrice || property.totalSalesPrice);
  const area = getPlotArea(property);

  if (!price || !area) return null;
  return price / area;
};

const formatSqftPrice = (value) => {
  const price = Number(value);
  if (!price || Number.isNaN(price)) return null;

  if (price >= 1000) {
    return `₹${(price / 1000).toFixed(1).replace(/\.0$/, "")}k/sqft`;
  }

  return `₹${Math.round(price)}/sqft`;
};

const buildLocalities = (properties, limit = 12) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, titleCaseLocation(property.location));
    }
  }

  return Array.from(groups.values()).slice(0, limit);
};

const buildPlotTypeOptions = (properties) => {
  const options = new Set();

  for (const property of properties) {
    if (RESIDENTIAL_CATEGORIES.includes(property.propertyCategory)) {
      options.add("Residential");
    }
    if (property.propertyCategory === "CommercialPlot") {
      options.add("Commercial");
    }
  }

  return Array.from(options);
};

const buildGrowthCorridors = (properties, limit = 4) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        count: 0,
      });
    }

    groups.get(key).count += 1;
  }

  const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, limit);
  const maxCount = top[0]?.count || 1;

  return top.map((item) => ({
    label: item.name.length > 14 ? `${item.name.slice(0, 12)}…` : item.name,
    fullName: item.name,
    count: item.count,
    pct: `${Math.max(20, Math.round((item.count / maxCount) * 100))}%`,
    listingsLabel: `${item.count} plots`,
  }));
};

const buildPopularAreas = (properties) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        properties: [],
        categories: {},
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const category = property.propertyCategory || "NewPlot";
    group.categories[category] = (group.categories[category] || 0) + 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 4)
    .map((group) => {
      const count = group.properties.length;
      const dominantCategory = Object.entries(group.categories).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];

      const growthVal =
        count >= 10 ? "Very High" : count >= 5 ? "High" : "Growing";

      return {
        name: group.name,
        sub: CATEGORY_SUBTITLES[dominantCategory] || "Plot Corridor",
        badge: count >= 5 ? "Hot Zone" : "Rising",
        plotsLabel: "AVAILABLE PLOTS",
        plotsVal: `${count} verified ${count === 1 ? "plot" : "plots"} listed`,
        growthLabel: "DEMAND",
        growthVal,
        growthColor: "text-green-600",
        count,
      };
    });
};

const buildAreaLinks = (properties, limit = 8) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        label: `Plots in ${titleCaseLocation(property.location)}`,
        location: titleCaseLocation(property.location),
        count: 0,
      });
    }

    groups.get(key).count += 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

export const getPlotsForSalePageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = PLOT_CATEGORIES.map(() => "?").join(", ");

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
        AND p.propertyCategory IN (${categoryPlaceholders})
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const [propertyRows] = await dbPromise.query(propertiesSql, [
      city,
      ...PLOT_CATEGORIES,
    ]);

    const plots = propertyRows.map(formatPropertyRow);
    const localityKeys = new Set(
      plots.map((property) => normalizeLocation(property.location)).filter(Boolean),
    );

    const sqftPrices = plots
      .map(getPricePerSqft)
      .filter((value) => value && !Number.isNaN(value));

    const residentialCount = plots.filter((property) =>
      RESIDENTIAL_CATEGORIES.includes(property.propertyCategory),
    ).length;

    const commercialCount = plots.filter(
      (property) => property.propertyCategory === "CommercialPlot",
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newListingsToday = plots.filter((property) => {
      const createdAt = new Date(property.created_at);
      return createdAt >= today;
    }).length;

    const featuredPlots = plots.slice(0, 8);
    const heroProperty = featuredPlots[0] || null;

    return res.json({
      city,
      stats: {
        plotListings: plots.length,
        localities: localityKeys.size,
        residentialPlots: residentialCount,
        commercialPlots: commercialCount,
        minPricePerSqft: sqftPrices.length
          ? Math.round(Math.min(...sqftPrices))
          : null,
        newListingsToday,
      },
      plots,
      featuredPlots,
      popularAreas: buildPopularAreas(plots),
      growthCorridors: buildGrowthCorridors(plots),
      areaLinks: buildAreaLinks(plots),
      localities: buildLocalities(plots),
      plotTypeOptions: buildPlotTypeOptions(plots),
      heroProperty,
    });
  } catch (error) {
    console.error("getPlotsForSalePageData:", error);
    return res.status(500).json({
      message: "Failed to fetch plots for sale page data",
    });
  }
};
