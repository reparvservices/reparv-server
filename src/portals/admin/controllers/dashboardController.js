import db from "#db";
import dbPromise from "#db/promise";
import moment from "moment-timezone";

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
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(status) = 'active' AND (end_date IS NULL OR end_date >= NOW()) THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN LOWER(status) = 'expired' THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN LOWER(status) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN LOWER(status) = 'halted' THEN 1 ELSE 0 END) AS halted,
      SUM(CASE WHEN LOWER(status) = 'active' AND (end_date IS NULL OR end_date >= NOW()) THEN IFNULL(final_amount, 0) ELSE 0 END) AS activeRevenue,
      SUM(CASE WHEN role = 'project' AND LOWER(status) = 'active' AND (end_date IS NULL OR end_date >= NOW()) THEN 1 ELSE 0 END) AS activeProject,
      SUM(CASE WHEN role = 'sales' AND LOWER(status) = 'active' AND (end_date IS NULL OR end_date >= NOW()) THEN 1 ELSE 0 END) AS activeSales,
      SUM(CASE WHEN role = 'territory' AND LOWER(status) = 'active' AND (end_date IS NULL OR end_date >= NOW()) THEN 1 ELSE 0 END) AS activeTerritory
    FROM user_subscriptions
`;

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
    const [[counts], [subscriptionRows], [recentRows]] = await Promise.all([
      dbPromise.query(COUNT_QUERY),
      dbPromise.query(SUBSCRIPTION_STATS_SQL),
      dbPromise.query(RECENT_CUSTOMERS_SQL),
    ]);

    const c = counts || {};
    const sub = subscriptionRows?.[0] || {};
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
        total: Number(sub.total) || 0,
        active: Number(sub.active) || 0,
        pending: Number(sub.pending) || 0,
        expired: Number(sub.expired) || 0,
        cancelled: Number(sub.cancelled) || 0,
        halted: Number(sub.halted) || 0,
        activeRevenue: Number(sub.activeRevenue) || 0,
        byRole: {
          project: Number(sub.activeProject) || 0,
          sales: Number(sub.activeSales) || 0,
          territory: Number(sub.activeTerritory) || 0,
        },
      },
      recentCustomers: (recentRows || []).map(formatCustomerRow),
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
