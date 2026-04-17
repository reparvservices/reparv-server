import db from "#db";

export const getCount = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }

  const getProjectPartnerAdharQuery =
    "SELECT adharno FROM projectpartner WHERE id = ?";

  db.query(getProjectPartnerAdharQuery, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching Project Partner adharno:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Project Partner not found." });
    }

    const projectPartnerAdhar = result[0].adharno;

    const query = `
      SELECT
        /* DEAL AMOUNT */
        (
          SELECT IFNULL(SUM(pf.dealamount),0)
          FROM propertyfollowup pf
          JOIN enquirers e ON pf.enquirerid = e.enquirersid
          JOIN properties p ON e.propertyid = p.propertyid
          WHERE pf.status = 'Token' AND p.projectpartnerid = ?
        ) AS totalDealAmount,
        
        /* SELF EARNING */
        (
          SELECT IFNULL(SUM(pf.reparvcommission)/2,0)
          FROM propertyfollowup pf
          JOIN enquirers e ON pf.enquirerid = e.enquirersid
          JOIN properties p ON e.propertyid = p.propertyid
          WHERE pf.status = 'Token' AND p.projectpartnerid = ?
        ) AS selfEarning,

        /* CUSTOMERS */
        (
          SELECT COUNT(e.enquirersid)
          FROM enquirers e
          JOIN properties p ON e.propertyid = p.propertyid
          WHERE e.status = 'Token' AND p.projectpartnerid = ?
        ) AS totalCustomer,

        /* ENQUIRIES */
        (
          SELECT COUNT(e.enquirersid)
          FROM enquirers e
          JOIN properties p ON e.propertyid = p.propertyid
          WHERE (e.status != 'Token' AND p.projectpartnerid = ?) 
          OR e.projectpartnerid = ?
        ) AS totalEnquiry,

        /* SQFT DEAL */
        (
          SELECT IFNULL(SUM(p.carpetArea),0)
          FROM enquirers e
          JOIN properties p ON e.propertyid = p.propertyid
          WHERE e.status = 'Token' AND p.projectpartnerid = ?
        ) AS totalDealInSquareFeet,

        /* BUILDERS */
        (
          SELECT COUNT(builderid)
          FROM builders
          WHERE builderadder = ?
        ) AS totalBuilder,

        /* EMPLOYEES */
        (
          SELECT COUNT(id)
          FROM employees
          WHERE projectpartnerid = ?
        ) AS totalEmployee,

        /* PROPERTIES */
        (
          SELECT COUNT(propertyid)
          FROM properties
          WHERE projectpartnerid = ?
        ) AS totalProperty,

        /* SALES PERSONS */
        (
          SELECT COUNT(salespersonsid)
          FROM salespersons
          WHERE projectpartnerid = ?
        ) AS totalSalesPerson,

        /* TERRITORY PARTNERS */
        (
          SELECT COUNT(id)
          FROM territorypartner
          WHERE projectpartnerid = ?
        ) AS totalTerritoryPartner,

        /* TICKETS */
        (
          SELECT COUNT(ticketid)
          FROM tickets
          WHERE ticketadder = ?
        ) AS totalTicket,

        /* PROPERTY ANALYTICS */
        (
          SELECT IFNULL(SUM(pa.views),0)
          FROM property_analytics pa
          JOIN properties p ON pa.property_id = p.propertyid
          WHERE p.projectpartnerid = ?
        ) AS propertyViews,

        (
          SELECT COUNT(*)
          FROM user_property_wishlist w
          JOIN properties p ON w.property_id = p.propertyid
          WHERE p.projectpartnerid = ?
        ) AS propertyLikes,

        (
          SELECT IFNULL(SUM(pa.calls),0)
          FROM property_analytics pa
          JOIN properties p ON pa.property_id = p.propertyid
          WHERE p.projectpartnerid = ?
        ) AS call_enquirers,

        (
          SELECT IFNULL(SUM(pa.whatsapp_enquiry),0)
          FROM property_analytics pa
          JOIN properties p ON pa.property_id = p.propertyid
          WHERE p.projectpartnerid = ?
        ) AS whatsapp_enquirers,

        (
          SELECT IFNULL(SUM(pa.share),0)
          FROM property_analytics pa
          JOIN properties p ON pa.property_id = p.propertyid
          WHERE p.projectpartnerid = ?
        ) AS propertyShares,

        /* BLOG ANALYTICS */
        (SELECT COUNT(id) FROM blogs) AS totalBlog,

        (
          SELECT IFNULL(SUM(views),0)
          FROM blog_analyst
        ) AS blogViews,

        (
          SELECT COUNT(*)
          FROM user_blog_wishlist
        ) AS blogLikes,

        (
          SELECT IFNULL(SUM(shares),0)
          FROM blog_analyst
        ) AS blogShares,

        /* NEWS ANALYTICS */
        (SELECT COUNT(id) FROM news) AS totalNews,

        (
          SELECT IFNULL(SUM(views),0)
          FROM news_analyst
        ) AS newsViews,

        (
          SELECT COUNT(*)
          FROM user_news_wishlist
        ) AS newsLikes,

        (
          SELECT IFNULL(SUM(shares),0)
          FROM news_analyst
        ) AS newsShares
    `;

    db.query(
      query,
      [
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerAdhar,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerAdhar,

        /* Property Analytics */
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId,
        projectPartnerId
      ],
      (err, results) => {
        if (err) {
          console.error("Error fetching dashboard stats:", err);
          return res.status(500).json({ error: "Database error" });
        }

        return res.json(results[0]);
      }
    );
  });
};

// **Get Partner Properties with Enquiry/Booking Status**
export const getProperties = (req, res) => {
  const partnerId = req.projectPartnerUser?.id;

  if (!partnerId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const sql = `
    SELECT 
      p.*,
      builders.company_name,      
      COUNT(e.enquirersid) AS totalEnquiries,
      SUM(CASE WHEN e.status = 'Token' THEN 1 ELSE 0 END) AS bookedCount,
      SUM(CASE WHEN e.status != 'Token' THEN 1 ELSE 0 END) AS enquiryCount
    FROM properties p
    INNER JOIN builders ON p.builderid = builders.builderid
    LEFT JOIN enquirers e ON p.propertyid = e.propertyid
    WHERE p.projectpartnerid = ?
    GROUP BY p.propertyid
    ORDER BY p.created_at DESC;
  `;

  db.query(sql, [partnerId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "No properties found" });
    }

    // Format with status
    let formatted = result.map((row) => {
      let enquiryStatus = "None";
      if (row.bookedCount > 0) {
        enquiryStatus = "Booked";
      } else if (row.enquiryCount > 0) {
        enquiryStatus = "Enquired";
      }

      return {
        ...row,
        enquiryStatus,
      };
    });

    res.status(200).json(formatted);
  });
};