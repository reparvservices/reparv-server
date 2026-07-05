import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const BUDGET_CATEGORIES = ["NewFlat", "ResaleFlat", "Resale", "RowHouse", "NewPlot"];
const MAX_BUDGET = 6000000;

const JOURNEY_TEMPLATES = [
  {
    seed: 0,
    label: "A BUYER JOURNEY REVIEWED",
    titleSuffix: "Prioritising Peace of Mind",
    quote:
      "Once we focused on what we could comfortably afford, the decision felt lighter and more confident. After moving in, daily life became smoother.",
    imageRight: true,
    avatarColor: "bg-[#4500B4]",
    buildText: ({ location, bhk, priceRange }) =>
      `A family had their eyes on a 3BHK in a prime locality, but realised the EMI would leave very little breathing room. They chose a well-designed ${bhk || "2BHK"} in ${location} at ${priceRange} — and haven't looked back.`,
  },
  {
    seed: 1,
    label: "A BUYER JOURNEY REVIEWED",
    titleSuffix: "Quality Over Quantity",
    quote:
      "I realised that a smaller well-designed home in the right neighbourhood gave me time back every day. That was my true dream feature.",
    imageRight: false,
    avatarColor: "bg-[#5323DC]",
    buildText: ({ location, bhk, priceRange }) =>
      `A buyer wanted a spacious flat but the budget capped at ${priceRange}. They pivoted to a compact ${bhk || "2BHK"} in ${location} — and now sleep better.`,
  },
  {
    seed: 2,
    label: "A BUYER JOURNEY REVIEWED",
    titleSuffix: "Better Area, Smaller Home",
    quote:
      "Choosing a smaller home in a better-connected locality turned out to be the smartest upgrade we made.",
    imageRight: true,
    avatarColor: "bg-[#4500B4]",
    buildText: ({ location, bhk, priceRange }) =>
      `Instead of stretching for a larger home farther away, they picked a ${bhk || "2BHK"} in ${location} within ${priceRange} — closer to work, schools, and daily essentials.`,
  },
];

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

const getPrice = (property) =>
  Number(property.totalOfferPrice || property.totalSalesPrice);

const getBhkLabel = (property) => {
  const types = Array.isArray(property.propertyType) ? property.propertyType : [];
  const bhk = types.find((item) => /bhk/i.test(String(item)));
  return bhk || null;
};

const isBudgetProperty = (property) => {
  const price = getPrice(property);
  if (!price || price > MAX_BUDGET) {
    return false;
  }

  if (property.propertyCategory === "NewPlot") {
    return true;
  }

  return BUDGET_CATEGORIES.includes(property.propertyCategory);
};

const formatPriceShort = (price) => {
  const value = Number(price);
  if (!value) return "Price on request";
  if (value >= 100000) return `₹${Math.round(value / 100000)} Lakh`;
  return `₹${Math.round(value / 1000)}k`;
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
        prices: [],
        bhkTypes: new Set(),
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const price = getPrice(property);
    if (price > 0) group.prices.push(price);

    const bhk = getBhkLabel(property);
    if (bhk) group.bhkTypes.add(bhk);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 6)
    .map((group) => {
      const minPrice = group.prices.length ? Math.min(...group.prices) : null;
      const maxPrice = group.prices.length ? Math.max(...group.prices) : null;

      return {
        name: group.name,
        count: group.properties.length,
        priceRange:
          minPrice && maxPrice
            ? minPrice === maxPrice
              ? formatPriceShort(minPrice)
              : `${formatPriceShort(minPrice)} - ${formatPriceShort(maxPrice)}`
            : "Price on request",
        bhkOptions: Array.from(group.bhkTypes).slice(0, 3),
        sampleSlug: group.properties[0]?.seoSlug || null,
        sampleFrontView: group.properties[0]?.frontView || null,
      };
    });
};

const buildJourneys = (properties, areas, city) => {
  return JOURNEY_TEMPLATES.map((template, index) => {
    const area = areas[index] || areas[0];
    const sample = properties[index] || properties[0] || null;
    const location = area?.name || titleCaseLocation(sample?.location) || city;
    const bhk = getBhkLabel(sample) || area?.bhkOptions?.[0] || "2BHK";
    const priceRange =
      area?.priceRange ||
      (sample ? formatPriceShort(getPrice(sample)) : "₹25 Lakh - ₹60 Lakh");

    const initials = location
      .split(" ")
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();

    return {
      ...template,
      name: `${location}: ${template.titleSuffix}`,
      location,
      bhk,
      priceRange,
      text: template.buildText({ location, bhk, priceRange }),
      propertySlug: sample?.seoSlug || area?.sampleSlug || null,
      image: sample?.frontView || area?.sampleFrontView || null,
      avatar: initials || "NB",
      href: sample?.seoSlug
        ? `/property-info/${sample.seoSlug}`
        : area?.sampleSlug
          ? `/property-info/${area.sampleSlug}`
          : `/properties?city=${encodeURIComponent(city)}&location=${encodeURIComponent(location)}`,
    };
  });
};

export const getBudgetToDreamHomePageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = BUDGET_CATEGORIES.map(() => "?").join(", ");

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
      ...BUDGET_CATEGORIES,
    ]);

    const allProperties = propertyRows.map(formatPropertyRow);
    let budgetProperties = allProperties
      .filter(isBudgetProperty)
      .sort((a, b) => getPrice(a) - getPrice(b));

    if (budgetProperties.length < 3) {
      budgetProperties = allProperties
        .filter((property) => {
          const price = getPrice(property);
          return price > 0 && price <= MAX_BUDGET;
        })
        .slice(0, 30);
    }

    const popularAreas = buildPopularAreas(budgetProperties);
    const journeys = buildJourneys(budgetProperties, popularAreas, city);

    const prices = budgetProperties.map(getPrice).filter((value) => value > 0);
    const localityKeys = new Set(
      budgetProperties
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    );

    const under30L = budgetProperties.filter((property) => getPrice(property) <= 3000000).length;
    const under45L = budgetProperties.filter((property) => getPrice(property) <= 4500000).length;

    return res.json({
      city,
      stats: {
        budgetHomes: budgetProperties.length,
        localities: localityKeys.size,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        under30L,
        under45L,
      },
      journeys,
      popularAreas,
      heroProperty: budgetProperties[0] || null,
    });
  } catch (error) {
    console.error("getBudgetToDreamHomePageData:", error);
    return res.status(500).json({
      message: "Failed to fetch budget to dream home page data",
    });
  }
};
