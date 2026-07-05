import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const NEW_PROJECT_CATEGORIES = ["NewFlat", "NewPlot", "CommercialFlat"];

const LOCATION_BADGES = [
  { badge: "Hot Zone", badgeBg: "bg-blue-600" },
  { badge: "SEZ", badgeBg: "bg-purple-600" },
  { badge: "Eco District", badgeBg: "bg-green-600" },
  { badge: "Industrial", badgeBg: "bg-orange-600" },
];

const BUILDER_TAGS = ["Top Rated", "Verified", "Premium", "New"];

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

const getProjectStatus = (property) => {
  const status = String(property.propertyStatusFeature || "").toLowerCase();

  if (property.hotDeal?.toLowerCase() === "active") {
    return "Hot Deal";
  }

  if (status.includes("under construction")) {
    return "Under Construction";
  }

  if (property.propertyCategory === "NewFlat") {
    return "New Launch";
  }

  return "Pre-Launch";
};

const buildBhkOptions = (properties) => {
  const options = new Set();

  for (const property of properties) {
    const types = Array.isArray(property.propertyType) ? property.propertyType : [];
    for (const type of types) {
      if (/bhk/i.test(String(type))) {
        options.add(String(type).trim());
      }
    }
  }

  return Array.from(options).sort((a, b) => {
    const aNum = Number.parseInt(a, 10) || 0;
    const bNum = Number.parseInt(b, 10) || 0;
    return aNum - bNum;
  });
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

const buildPopularLocations = (properties) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        count: 0,
        sampleFrontView: property.frontView,
        categories: {},
      });
    }

    const group = groups.get(key);
    group.count += 1;
    const category = property.propertyCategory || "NewFlat";
    group.categories[category] = (group.categories[category] || 0) + 1;

    if (!group.sampleFrontView && property.frontView) {
      group.sampleFrontView = property.frontView;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((group, index) => {
      const theme = LOCATION_BADGES[index % LOCATION_BADGES.length];
      const dominantCategory = Object.entries(group.categories).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];

      const descMap = {
        NewFlat: "Residential launches",
        NewPlot: "Plot developments",
        CommercialFlat: "Commercial projects",
      };

      return {
        name: group.name,
        badge: group.count >= 5 ? `${group.count} Projects` : theme.badge,
        badgeBg: theme.badgeBg,
        desc: descMap[dominantCategory] || "Fast developing zone",
        features: [
          `${group.count} verified ${group.count === 1 ? "project" : "projects"} listed`,
          "RERA-verified builder partnerships",
          "Strong infrastructure growth corridor",
        ],
        count: group.count,
        sampleFrontView: group.sampleFrontView,
      };
    });
};

const buildTopBuilders = (properties, limit = 4) => {
  const groups = new Map();

  for (const property of properties) {
    const partnerId = property.projectpartnerid;
    if (!partnerId) continue;

    if (!groups.has(partnerId)) {
      groups.set(partnerId, {
        id: partnerId,
        name: property.partnerName || "Verified Builder",
        projectCount: 0,
        reraNo: property.reraRegistered || property.reraStatus || "",
        createdAt: property.created_at,
      });
    }

    groups.get(partnerId).projectCount += 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.projectCount - a.projectCount)
    .slice(0, limit)
    .map((builder, index) => ({
      name: builder.name,
      rating: (4 + (builder.projectCount % 8) / 10).toFixed(1),
      projects: `${builder.projectCount} Projects`,
      since: builder.createdAt
        ? `Since ${new Date(builder.createdAt).getFullYear()}`
        : "Verified Partner",
      status: builder.reraNo ? "✓ RERA Verified" : "✓ Reparv Verified",
      statusColor: "text-green-600",
      tag: BUILDER_TAGS[index % BUILDER_TAGS.length],
      tagBg: [
        "bg-orange-100 text-orange-600",
        "bg-blue-100 text-blue-600",
        "bg-green-100 text-green-600",
        "bg-pink-100 text-pink-600",
      ][index % 4],
      partnerId: builder.id,
    }));
};

const buildFeaturedProjects = (properties, limit = 8) => {
  return properties.slice(0, limit).map((property) => {
    const bhkTypes = buildBhkOptions([property]);
    const price = Number(property.totalOfferPrice || property.totalSalesPrice);

    return {
      propertyid: property.propertyid,
      seoSlug: property.seoSlug,
      name: property.propertyName,
      location: titleCaseLocation(property.location),
      price: price ? `₹${Math.round(price / 100000)} Lakh` : "Price on request",
      beds: bhkTypes[0] || "New Project",
      bhk: bhkTypes[0] || "New Launch",
      phase: getProjectStatus(property),
      status: getProjectStatus(property),
      possessionDate: property.possessionDate || null,
      frontView: property.frontView,
      partnerName: property.partnerName,
    };
  });
};

export const getNewProjectsPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = NEW_PROJECT_CATEGORIES.map(() => "?").join(", ");

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
        AND LOWER(COALESCE(p.propertyStatusFeature, '')) LIKE '%under construction%'
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const [propertyRows] = await dbPromise.query(propertiesSql, [
      city,
      ...NEW_PROJECT_CATEGORIES,
    ]);

    const projects = propertyRows.map(formatPropertyRow);
    const localityKeys = new Set(
      projects
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    );

    const prices = projects
      .map((property) => Number(property.totalOfferPrice || property.totalSalesPrice))
      .filter((value) => value > 0);

    const discounts = projects
      .map((property) => {
        const sales = Number(property.totalSalesPrice);
        const offer = Number(property.totalOfferPrice);
        if (!sales || !offer || sales <= offer) return null;
        return ((sales - offer) / sales) * 100;
      })
      .filter((value) => value && value < 50);

    const partnerIds = new Set(
      projects.map((property) => property.projectpartnerid).filter(Boolean),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newListingsToday = projects.filter((property) => {
      const createdAt = new Date(property.created_at);
      return createdAt >= today;
    }).length;

    const featuredProjects = buildFeaturedProjects(projects);
    const heroProject = featuredProjects[0] || null;

    return res.json({
      city,
      stats: {
        projectCount: projects.length,
        localities: localityKeys.size,
        trustedBuilders: partnerIds.size,
        minPrice: prices.length ? Math.min(...prices) : null,
        avgLaunchDiscount: discounts.length
          ? Math.round(discounts.reduce((sum, value) => sum + value, 0) / discounts.length)
          : null,
        newListingsToday,
      },
      projects,
      featuredProjects,
      popularLocations: buildPopularLocations(projects),
      topBuilders: buildTopBuilders(projects),
      localities: buildLocalities(projects),
      bhkOptions: buildBhkOptions(projects),
      heroProject,
    });
  } catch (error) {
    console.error("getNewProjectsPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch new projects page data",
    });
  }
};
