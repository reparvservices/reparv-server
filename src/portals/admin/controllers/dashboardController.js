import db from "#db";
import dbPromise from "#db/promise";
import moment from "moment-timezone";
import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "../../subscription/utils/userSubscriptionCanonical.js";
import { PLAN_TYPE_SELECT_SQL } from "../../subscription/utils/planTypeSql.js";

const COUNT_QUERY = `
      SELECT
        (SELECT IFNULL(SUM(pf.dealamount), 0)
         FROM propertyfollowup pf
         JOIN enquirers e ON pf.enquirerid = e.enquirersid
         WHERE pf.status = 'Token'
        ) AS totalDealAmount,

        (SELECT COUNT(enquirersid) FROM enquirers WHERE status = 'Token') AS totalCustomer,
        (SELECT COUNT(enquirersid) FROM enquirers WHERE status != 'Token') AS totalEnquiry,
        (SELECT COUNT(enquirersid) FROM enquirers) AS totalEnquirersAll,

        (SELECT IFNULL(SUM(pf.totalcommission), 0)
         FROM propertyfollowup pf
         WHERE pf.status = 'Token'
        ) AS totalCommission,

        (SELECT IFNULL(SUM(p.carpetArea), 0)
         FROM enquirers e
         JOIN properties p ON e.propertyid = p.propertyid
         WHERE e.status = 'Token'
        ) AS totalDealInSquareFeet,

        (SELECT IFNULL(SUM(pf.reparvcommission), 0)
         FROM propertyfollowup pf
         WHERE pf.status = 'Token'
        ) AS totalReparvCommission,

        (SELECT IFNULL(SUM(pf.salescommission), 0)
         FROM propertyfollowup pf
         WHERE pf.status = 'Token'
        ) AS totalSalesCommission,

        (SELECT IFNULL(SUM(pf.territorycommission), 0)
         FROM propertyfollowup pf
         WHERE pf.status = 'Token'
        ) AS totalTerritoryCommission,

        (SELECT IFNULL(SUM(pf.tds), 0)
         FROM propertyfollowup pf
         WHERE pf.status = 'Token'
        ) AS totalTDS,

        (SELECT COUNT(propertyid) FROM properties) AS totalProperty,
        (SELECT COUNT(propertyid) FROM properties WHERE LOWER(status) = 'active' AND LOWER(approve) = 'approved') AS totalPropertyActive,
        (SELECT COUNT(propertyid) FROM properties WHERE LOWER(approve) != 'approved' OR approve IS NULL) AS totalPropertyPending,

        (SELECT COUNT(builderid) FROM builders) AS totalBuilder,
        (SELECT COUNT(id) FROM employees) AS totalEmployee,
        (SELECT COUNT(id) FROM promoter WHERE status = 'Active' AND paymentstatus = 'Success') AS totalPromoter,
        (SELECT COUNT(salespersonsid) FROM salespersons WHERE status = 'Active' AND paymentstatus = 'Success') AS totalSalesPerson,
        (SELECT COUNT(id) FROM territorypartner WHERE status = 'Active' AND paymentstatus = 'Success') AS totalTerritoryPartner,
        (SELECT COUNT(partnerid) FROM onboardingpartner WHERE status = 'Active' AND paymentstatus = 'Success') AS totalOnboardingPartner,
        (SELECT COUNT(id) FROM projectpartner WHERE status = 'Active' AND paymentstatus = 'Success') AS totalProjectPartner,
        (SELECT COUNT(id) FROM guestUsers WHERE status = 'Active') AS totalGuestUser,
        (SELECT COUNT(ticketid) FROM tickets) AS totalTicket,

        (SELECT COUNT(id) FROM blogs) AS totalBlog,
        (SELECT COUNT(id) FROM news) AS totalNews,

        (SELECT COUNT(*) FROM user_property_wishlist) AS propertyLikes,
        (SELECT IFNULL(SUM(views),0) FROM property_analytics) AS propertyViews,
        (SELECT IFNULL(SUM(share),0) FROM property_analytics) AS propertyShares,
        (SELECT IFNULL(SUM(calls),0) FROM property_analytics) AS call_enquirers,
        (SELECT IFNULL(SUM(whatsapp_enquiry),0) FROM property_analytics) AS whatsapp_enquirers,

        (SELECT COUNT(*) FROM user_blog_wishlist) AS blogLikes,
        (SELECT IFNULL(SUM(views),0) FROM blog_analyst) AS blogViews,
        (SELECT IFNULL(SUM(shares),0) FROM blog_analyst) AS blogShares,

        (SELECT COUNT(*) FROM user_news_wishlist) AS newsLikes,
        (SELECT IFNULL(SUM(views),0) FROM news_analyst) AS newsViews,
        (SELECT IFNULL(SUM(shares),0) FROM news_analyst) AS newsShares
`;

const RECENT_CUSTOMERS_SQL = `
    SELECT
      enquirers.enquirersid,
      enquirers.customer,
      enquirers.contact,
      enquirers.assign,
      properties.frontView,
      properties.seoSlug,
      propertyfollowup.dealamount,
      propertyfollowup.created_at
    FROM enquirers
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token'
    ORDER BY propertyfollowup.created_at DESC
    LIMIT 8
`;

const SUBSCRIPTION_STATS_SQL = `
    SELECT
      COUNT(*) AS partnersWithSubscription,
      SUM(LOWER((${PLAN_TYPE_SELECT_SQL})) = 'trial') AS trial,
      SUM(
        LOWER(us.status) = 'active'
        AND (us.end_date IS NULL OR us.end_date >= NOW())
        AND LOWER((${PLAN_TYPE_SELECT_SQL})) NOT IN ('trial', 'enterprise')
      ) AS active,
      SUM(LOWER(us.status) = 'pending') AS pending,
      SUM(LOWER(us.status) = 'expired') AS expired,
      SUM(LOWER(us.status) = 'cancelled') AS cancelled,
      SUM(LOWER(us.status) = 'halted') AS halted,
      SUM(CASE
        WHEN LOWER(us.status) = 'active'
          AND (us.end_date IS NULL OR us.end_date >= NOW())
          AND LOWER((${PLAN_TYPE_SELECT_SQL})) = 'paid'
        THEN IFNULL(us.final_amount, 0) ELSE 0
      END) AS activeRevenue,
      SUM(
        LOWER(us.status) = 'active'
        AND (us.end_date IS NULL OR us.end_date >= NOW())
        AND us.role = 'project'
        AND LOWER((${PLAN_TYPE_SELECT_SQL})) NOT IN ('trial', 'enterprise')
      ) AS activeProject,
      SUM(
        LOWER(us.status) = 'active'
        AND (us.end_date IS NULL OR us.end_date >= NOW())
        AND us.role = 'sales'
        AND LOWER((${PLAN_TYPE_SELECT_SQL})) NOT IN ('trial', 'enterprise')
      ) AS activeSales,
      SUM(
        LOWER(us.status) = 'active'
        AND (us.end_date IS NULL OR us.end_date >= NOW())
        AND us.role = 'territory'
        AND LOWER((${PLAN_TYPE_SELECT_SQL})) NOT IN ('trial', 'enterprise')
      ) AS activeTerritory
    FROM user_subscriptions us
    INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
`;

const SUBSCRIPTION_TOTAL_ROWS_SQL = `SELECT COUNT(*) AS total FROM user_subscriptions`;

const RECENT_SUBSCRIPTIONS_SQL = `
    SELECT
      us.id,
      us.user_id,
      us.role,
      us.status,
      us.final_amount,
      us.created_at,
      us.updated_at,
      us.razorpay_subscription_id,
      sp.plan_name,
      (${PLAN_TYPE_SELECT_SQL}) AS plan_type,
      CASE us.role
        WHEN 'project' THEN pp.fullname
        WHEN 'sales' THEN s.fullname
        WHEN 'territory' THEN tp.fullname
      END AS user_name
    FROM user_subscriptions us
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
    LEFT JOIN projectpartner pp ON us.role = 'project' AND pp.id = us.user_id
    LEFT JOIN salespersons s ON us.role = 'sales' AND s.salespersonsid = us.user_id
    LEFT JOIN territorypartner tp ON us.role = 'territory' AND tp.id = us.user_id
    ORDER BY COALESCE(us.updated_at, us.created_at) DESC, us.id DESC
    LIMIT 6
`;

async function subscriptionRevenueThisMonth() {
  try {
    const start = moment.tz("Asia/Kolkata").startOf("month").format("YYYY-MM-DD HH:mm:ss");
    const end = moment.tz("Asia/Kolkata").endOf("month").add(1, "second").format("YYYY-MM-DD HH:mm:ss");
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM subscription_recurring_payments
       WHERE status IN ('captured', 'authorized')
         AND COALESCE(paid_at, created_at) >= ?
         AND COALESCE(paid_at, created_at) < ?`,
      [start, end],
    );
    return Number(rows[0]?.total) || 0;
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") return 0;
    throw err;
  }
}

function formatCustomerRow(row) {
  return {
    enquirersid: row.enquirersid,
    customer: row.customer,
    contact: row.contact,
    assign: row.assign,
    frontView: row.frontView,
    seoSlug: row.seoSlug,
    dealamount: row.dealamount,
    created_at: moment
      .utc(row.created_at)
      .tz("Asia/Kolkata")
      .format("DD MMM YYYY | hh:mm A"),
  };
}

function formatSubscriptionRow(row) {
  const planType = String(row.plan_type || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();
  let displayStatus = status || "—";
  if (planType === "trial" && status === "active") displayStatus = "trial";
  if (planType === "trial" && status === "pending") displayStatus = "trial";

  return {
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    user_name: row.user_name || "—",
    plan_name: row.plan_name || "—",
    plan_type: planType,
    status: row.status,
    display_status: displayStatus,
    final_amount: Number(row.final_amount) || 0,
    razorpay_subscription_id: row.razorpay_subscription_id,
    updated_at: row.updated_at
      ? moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
      : "—",
  };
}

export const getCount = (req, res) => {
  db.query(COUNT_QUERY, (err, results) => {
    if (err) {
      console.error("Error fetching dashboard count:", err);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json(results[0]);
  });
};

/** Full dashboard payload: counts, subscriptions, funnel, recent customers */
export const getSummary = async (req, res) => {
  try {
    const [[counts], [subscriptionRows], [subscriptionTotalRows], [recentRows], [recentSubRows], revenueMonth] =
      await Promise.all([
        dbPromise.query(COUNT_QUERY),
        dbPromise.query(SUBSCRIPTION_STATS_SQL),
        dbPromise.query(SUBSCRIPTION_TOTAL_ROWS_SQL),
        dbPromise.query(RECENT_CUSTOMERS_SQL),
        dbPromise.query(RECENT_SUBSCRIPTIONS_SQL),
        subscriptionRevenueThisMonth(),
      ]);

    const c = counts || {};
    const sub = subscriptionRows?.[0] || {};
    const subTotalAll = Number(subscriptionTotalRows?.[0]?.total) || 0;
    const totalLeads = Number(c.totalEnquirersAll) || 0;
    const tokenCustomers = Number(c.totalCustomer) || 0;
    const openEnquiries = Number(c.totalEnquiry) || 0;
    const conversionRate =
      totalLeads > 0 ? Number(((tokenCustomers / totalLeads) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      counts: c,
      funnel: {
        totalLeads,
        openEnquiries,
        tokenCustomers,
        conversionRate,
      },
      properties: {
        total: Number(c.totalProperty) || 0,
        active: Number(c.totalPropertyActive) || 0,
        pendingApproval: Number(c.totalPropertyPending) || 0,
      },
      subscriptions: {
        total: subTotalAll,
        partnersWithSubscription: Number(sub.partnersWithSubscription) || 0,
        active: Number(sub.active) || 0,
        trial: Number(sub.trial) || 0,
        pending: Number(sub.pending) || 0,
        expired: Number(sub.expired) || 0,
        cancelled: Number(sub.cancelled) || 0,
        halted: Number(sub.halted) || 0,
        activeRevenue: Number(sub.activeRevenue) || 0,
        revenueThisMonth: revenueMonth,
        byRole: {
          project: Number(sub.activeProject) || 0,
          sales: Number(sub.activeSales) || 0,
          territory: Number(sub.activeTerritory) || 0,
        },
      },
      recentCustomers: (recentRows || []).map(formatCustomerRow),
      recentSubscriptions: (recentSubRows || []).map(formatSubscriptionRow),
    });
  } catch (err) {
    console.error("getSummary dashboard:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard summary",
    });
  }
};

export const getData = (req, res) => {
  const query = `
      SELECT
        (SELECT COUNT(enquirersid) FROM enquirers) AS totalenquiry,
        (SELECT COUNT(propertyid) FROM properties) AS totalproperty,
        (SELECT COUNT(builderid) FROM builders) AS totalbuilder,
        (SELECT COUNT(salespersonsid) FROM salespersons) AS totalsalesperson,
        (SELECT COUNT(id) FROM territorypartner) AS totalterritoryperson,
        (SELECT COUNT(partnerid) FROM onboardingpartner) AS totalonboardingpartner,
        (SELECT COUNT(id) FROM projectpartner) AS totalprojectpartner,
        (SELECT COUNT(ticketid)
          FROM tickets
          INNER JOIN salespersons ON salespersons.adharno = tickets.ticketadder
        ) AS totalticket;
    `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    return res.json(results[0]);
  });
};
