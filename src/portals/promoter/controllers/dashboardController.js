import db from "#db";

export const getCount = (req, res) => {
  const query = `
    SELECT
      (
        SELECT COUNT(e.enquirersid)
        FROM enquirers e
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE e.status = 'Token' AND p.city = ?
      ) AS totalCustomer,

      (SELECT COUNT(enquirersid) FROM enquirers WHERE status != 'Token' AND city = ? ) AS totalEnquiry,
      (SELECT COUNT(salespersonsid) FROM salespersons WHERE status = 'Active' AND paymentstatus = 'Success' AND partneradder = ? ) AS totalSalesPerson,
      (SELECT COUNT(id) FROM territorypartner WHERE status = 'Active' AND paymentstatus = 'Success' AND partneradder = ? ) AS totalTerritoryPartner,
      (SELECT COUNT(partnerid) FROM onboardingpartner WHERE status = 'Active' AND paymentstatus = 'Success' AND partneradder = ? ) AS totalOnboardingPartner,
      (SELECT COUNT(id) FROM projectpartner WHERE status = 'Active' AND paymentstatus = 'Success' AND partneradder = ? ) AS totalProjectPartner,
      (SELECT COUNT(id) FROM guestUsers WHERE status = 'Active' AND partneradder = ? ) AS totalGuestUser,
      
      (
        SELECT COUNT(ticketid) 
        FROM tickets 
        INNER JOIN promoter 
        ON promoter.adharno = tickets.ticketadder 
        WHERE tickets.ticketadder = ?
      ) AS totalTicket
  `;

  db.query(
    query,
    [
      req.promoterUser?.city, // for totalCustomer
      req.promoterUser?.city, // for totalEnquiry
      req.promoterUser?.id, // for totalSalesPartner
      req.promoterUser?.id, // for totalTerritoryPartner
      req.promoterUser?.id, // for totalOnboardingPartner
      req.promoterUser?.id, // for totalProjectPartner
      req.promoterUser?.id, // for totalGuestUser
      req.promoterUser?.adharId, // for totalTicket
    ],
    (err, results) => {
      if (err) {
        console.error("Error fetching dashboard stats:", err);
        return res.status(500).json({ error: "Database error" });
      }

      return res.json(results[0]);
    }
  );
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

    return res.json(results[0]); // Since it's a single row
  });
};
