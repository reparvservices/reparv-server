import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import "dotenv/config";
import "./utils/cron.js";

import loginRoutes from "./routes/admin/loginRoutes.js";
import profileRoutes from "./routes/admin/profileRoutes.js";
import dashboardRoutes from "./routes/admin/dashboardRoutes.js";
import employeeRoutes from "./routes/admin/employeeRoutes.js";
import builderRoutes from "./routes/admin/builderRoutes.js";
import propertyRoutes from "./routes/admin/propertyRoutes.js";
import propertyAdditionalInfoRoutes from "./routes/admin/propertyAdditionalInfoRoutes.js";
import customerRoutes from "./routes/admin/customerRoutes.js";
import roleRoutes from "./routes/admin/roleRoutes.js";
import departmentRoutes from "./routes/admin/departmentRoutes.js";
import authoritiesRoutes from "./routes/admin/authoritiesRoutes.js";
import stateRoutes from "./routes/admin/stateRoutes.js";
import cityRoutes from "./routes/admin/cityRoutes.js";
import mapRoutes from "./routes/admin/mapRoutes.js";
import promoterRoutes from "./routes/admin/promoterRoutes.js";
import adsManagerRoutes from "./routes/admin/adsManagerRoutes.js";
import salespersonRoutes from "./routes/admin/salespersonRoutes.js";
import partnerRoutes from "./routes/admin/partnerRoutes.js";
import projectPartnerRoutes from "./routes/admin/projectPartnerRoutes.js";
import territoryPartnerRoutes from "./routes/admin/territoryPartnerRoutes.js";
import guestUserRoutes from "./routes/admin/guestUserRoutes.js";
import subscriptionPricingRoutes from "./routes/admin/subscriptionPricingRoutes.js";
import subscriptionDiscountRoutes from "./routes/admin/subscriptionDiscountRoutes.js";
import propertytypeRoutes from "./routes/admin/propertytypeRoutes.js";
import enquirerRoutes from "./routes/admin/enquirerRoutes.js";
import addEnquiryRoutes from "./routes/admin/enquiryRoutes.js";
import auctionmembersRoutes from "./routes/admin/auctionmemberRoutes.js";
import ticketRoutes from "./routes/admin/ticketRoutes.js";
import apkUploadRoutes from "./routes/admin/apkUploadRoutes.js";
import blogRoutes from "./routes/admin/blogRoutes.js";
import trendRoutes from "./routes/admin/trendRoutes.js";
import sliderRoutes from "./routes/admin/sliderRoutes.js";
import testimonialRoutes from "./routes/admin/testimonialRoutes.js";
import calenderRoutes from "./routes/admin/calenderRoutes.js";
import emiRoutes from "./routes/admin/emiRoutes.js";
import marketingContentRoutes from "./routes/admin/marketingContentRoutes.js";
import brandAccessoriesRoutes from "./routes/admin/brandAccessoriesRoutes.js";
import messageRoutes from "./routes/admin/messageRoutes.js";

//frontend
import allPropertiesRoutes from "./routes/frontend/allPropertiesRoutes.js";
import propertiesRoutes from "./routes/frontend/propertiesRoutes.js";
import joinourteamRoutes from "./routes/frontend/joinourteamRoutes.js";
import propertyinfoRoutes from "./routes/frontend/propertyinfoRoutes.js";
import enquiryRoutes from "./routes/frontend/enquiryRoutes.js";
import frontendBlogRoutes from "./routes/frontend/blogRoutes.js";
import sliderImagesRoutes from "./routes/frontend/sliderRoutes.js";
import testimonialFeedbackRoutes from "./routes/frontend/testimonialRoutes.js";
import frontendEmiRoutes from "./routes/frontend/emiRoutes.js";
// frontend project-partner landing page
import frontendProjectPartnerRoutes from "./routes/frontend/projectPartnerRoutes.js";

// Payment Route
import paymentRoutes from "./routes/paymentRoutes.js";

// Subscription Payment Route
import subscriptionPaymentRoutes from "./routes/subscriptionPaymentRoutes.js";
// Redeem Route / Discount Routes
import redeemRoutes from "./routes/redeemRoutes.js";

// Account Cancellation Route
import accountCancellation from "./routes/accountCancellationRoutes.js";

// Map Route
import geocodeRoutes from "./routes/geocodeRoutes.js";

// Guest User Routes
import guestUserLoginRoutes from "./routes/guestUser/userRoutes.js";
import guestUserProfileRoutes from "./routes/guestUser/profileRoutes.js";
import guestUserDashboardRoutes from "./routes/guestUser/dashboardRoutes.js";
import guestUserPropertyRoutes from "./routes/guestUser/propertyRoutes.js";
import guestUserMapRoutes from "./routes/guestUser/mapRoutes.js";
import guestUserBuilderRoutes from "./routes/guestUser/builderRoutes.js";

// builder
import builderLoginRoutes from "./routes/builder/loginRoutes.js";
import builderProfileRoutes from "./routes/builder/profileRoutes.js";
import builderDashboardRoutes from "./routes/builder/dashboardRoutes.js";
import builderCustomerRoutes from "./routes/builder/customerRoutes.js";
import builderPropertyRoutes from "./routes/builder/propertyRoutes.js";
import builderTicketRoutes from "./routes/builder/ticketRoutes.js";

//employee
import employeeLoginRoutes from "./routes/employee/employeeLoginRoutes.js";
import employeeProfileRoutes from "./routes/employee/employeeProfileRoutes.js";
import employeeDashboardRoutes from "./routes/employee/dashboardRoutes.js";
import employeeTicketRoutes from "./routes/employee/employeeTicketRoutes.js";
// employee project partner routes
import employeeBuilderRoutes from "./routes/employee/builderRoutes.js";
import employeePropertyRoutes from "./routes/employee/propertyRoutes.js";
import employeeEnquirersRoutes from "./routes/employee/enquirerRoutes.js";
import employeeEnquiryRoutes from "./routes/employee/enquiryRoutes.js";
import employeeCustomerRoutes from "./routes/employee/customerRoutes.js";
import employeeSalesPartnerRoutes from "./routes/employee/salesPartnerRoutes.js";
import employeeTerritoryPartnerRoutes from "./routes/employee/territoryPartnerRoutes.js";
import employeeMapRoutes from "./routes/employee/mapRoutes.js";
import employeeCalenderRoutes from "./routes/employee/calenderRoutes.js";
import employeeRoleRoutes from "./routes/employee/roleRoutes.js";
import employeeDepartmentRoutes from "./routes/employee/departmentRoutes.js";
import employeeMessageRoutes from "./routes/employee/messageRoutes.js";

// import Promoter Routes
import promoterLoginRoutes from "./routes/promoter/loginRoutes.js";
import promoterProfileRoutes from "./routes/promoter/profileRoutes.js";
import promoterAgreementRoutes from "./routes/promoter/agreementRoutes.js";
import promoterDashboardRoutes from "./routes/promoter/dashboardRoutes.js";
import promoterEnquirerRoutes from "./routes/promoter/enquirerRoutes.js";
import promoterCustomerRoutes from "./routes/promoter/customerRoutes.js";
import promoterSalespersonRoutes from "./routes/promoter/salespersonRoutes.js";
import promoterPartnerRoutes from "./routes/promoter/partnerRoutes.js";
import promoterProjectPartnerRoutes from "./routes/promoter/projectPartnerRoutes.js";
import promoterTerritoryPartnerRoutes from "./routes/promoter/territoryPartnerRoutes.js";
import promoterEmiRoutes from "./routes/promoter/emiRoutes.js";
import promoterTicketRoutes from "./routes/promoter/ticketRoutes.js";

//sales
import salesLoginRoutes from "./routes/sales/salesLoginRoutes.js";
import salesProfileRoutes from "./routes/sales/salesProfileRoutes.js";
import salesAgreementRoutes from "./routes/sales/agreementRoutes.js";
import salesDashboardRoutes from "./routes/sales/dashboardRoutes.js";
import salesPropertyRoutes from "./routes/sales/salesPropertyRoutes.js";
import salesTicketRoutes from "./routes/sales/salesTicketRoutes.js";
import salesCustomerRoutes from "./routes/sales/customerRoutes.js";
import salesEnquirersRoutes from "./routes/sales/salesEnquirerRoutes.js";
import salesEnquiryRoutes from "./routes/sales/salesEnquiryRoutes.js";
import salesCalenderRoutes from "./routes/sales/calenderRoutes.js";
import salesPropertiesRoutes from "./routes/sales/propertiesRoutes.js";
import salesPropertyinfoRoutes from "./routes/sales/propertyinfoRoutes.js";
import enquiryRoutesSaleApp from "./routes/salesAppRoute/enquiryRoute.js";

// import onBarding Partner Routes
import partnerLoginRoutes from "./routes/onboardingPartner/partnerLoginRoutes.js";
import partnerProfileRoutes from "./routes/onboardingPartner/partnerProfileRoutes.js";
import partnerAgreementRoutes from "./routes/onboardingPartner/agreementRoutes.js";
import partnerDashboardRoutes from "./routes/onboardingPartner/dashboardRoutes.js";
import partnerPropertyRoutes from "./routes/onboardingPartner/partnerPropertyRoutes.js";
import partnerMapRoutes from "./routes/onboardingPartner/mapRoutes.js";
import partnerBuilderRoutes from "./routes/onboardingPartner/partnerBuilderRoutes.js";
import partnerTicketRoutes from "./routes/onboardingPartner/partnerTicketRoutes.js";

// import Project Partner Routes
import projectPartnerLoginRoutes from "./routes/projectPartner/loginRoutes.js";
import projectPartnerProfileRoutes from "./routes/projectPartner/profileRoutes.js";
import projectPartnerAgreementRoutes from "./routes/projectPartner/agreementRoutes.js";
import projectPartnerDashboardRoutes from "./routes/projectPartner/dashboardRoutes.js";
import projectPartnerPropertyRoutes from "./routes/projectPartner/propertyRoutes.js";
import projectPartnerPropertyAdditionalInfoRoutes from "./routes/projectPartner/propertyAdditionalInfoRoutes.js";
import projectPartnerMapRoutes from "./routes/projectPartner/mapRoutes.js";
import projectPartnerCustomerRoutes from "./routes/projectPartner/customerRoutes.js";
import projectPartnerBuilderRoutes from "./routes/projectPartner/builderRoutes.js";
import projectPartnerTicketRoutes from "./routes/projectPartner/ticketRoutes.js";
import projectSalesPartnerRoutes from "./routes/projectPartner/salesPartnerRoutes.js";
import projectTerritoryPartnerRoutes from "./routes/projectPartner/territoryPartnerRoutes.js";
import projectEnquirerRoutes from "./routes/projectPartner/enquirerRoutes.js";
import projectEnquiryRoutes from "./routes/projectPartner/enquiryRoutes.js";
import projectCalenderRoutes from "./routes/projectPartner/calenderRoutes.js";
import projectEmployeeRoutes from "./routes/projectPartner/employeeRoutes.js";
import projectRoleRoutes from "./routes/projectPartner/roleRoutes.js";
import projectDepartmentRoutes from "./routes/projectPartner/departmentRoutes.js";
import projectSliderRoutes from "./routes/projectPartner/sliderRoutes.js";
import projectPartnerMessageRoutes from "./routes/projectPartner/messageRoutes.js";
import projectPartnerSubscriptionRoutes from "./routes/projectPartner/subscriptionRoutes.js";

// import Territory Partner Routes
import territoryPartnerLoginRoutes from "./routes/territoryPartner/loginRoutes.js";
import territoryPartnerProfileRoutes from "./routes/territoryPartner/profileRoutes.js";
import territoryPartnerAgreementRoutes from "./routes/territoryPartner/agreementRoutes.js";
import territoryPartnerDashboardRoutes from "./routes/territoryPartner/dashboardRoutes.js";
//import territoryPartnerPropertyRoutes from "./routes/territoryPartner/propertyRoutes.js";
import territoryPartnerBuilderRoutes from "./routes/territoryPartner/builderRoutes.js";
import territoryPartnerTicketRoutes from "./routes/territoryPartner/ticketRoutes.js";
import territoryPartnerCustomerRoutes from "./routes/territoryPartner/customerRoutes.js";
import territoryPartnerEnquirersRoutes from "./routes/territoryPartner/enquirerRoutes.js";
import territoryPartnerEnquiryRoutes from "./routes/territoryPartner/enquiryRoutes.js";
import territoryPartnerCalenderRoutes from "./routes/territoryPartner/calenderRoutes.js";
import territoryPartnerPropertiesRoutes from "./routes/territoryPartner/propertiesRoutes.js";
import territoryPartnerPropertyinfoRoutes from "./routes/territoryPartner/propertyinfoRoutes.js";

import bookPropertyRoute from "./routes/sales/propertyBookingRoute.js";
//sales app route
import authRoute from "./routes/salesAppRoute/authRoute.js";
import appFlatRoute from "./routes/salesAppRoute/flatRoutes.js";
import appTicketRoute from "./routes/salesAppRoute/ticketRoute.js";
import postRoute from "./routes/salesAppRoute/postRoutes.js";
import userController from "./routes/salesAppRoute/userRoute.js";
import clientRoute from "./routes/salesAppRoute/clientRoute.js";
import salesPropertyEnquiry from "./routes/salesAppRoute/propertyEnquiry.js";
//territory app route
import territoryUserController from "./routes/territoryAppRoute/userRoute.js";
import territorypostRoute from "./routes/territoryAppRoute/postRoutes.js";
import territoryBooking from "./routes/territoryPartner/propertyBookingRoute.js";
import territoryClientRoute from "./routes/territoryAppRoute/profileRoute.js";
import territoryEnquiryRoute from "./routes/territoryAppRoute/enquiryRoute.js";
import territoryPropertyEnquiryRoute from "./routes/territoryAppRoute/propertyEnquiriesRoute.js";
import territorySubscription from "./routes/territoryAppRoute/subscription.js";
import salesSubscription from "./routes/salesAppRoute/subscription.js";
import scheduleNotesRoutes from "./routes/salesAppRoute/notesRoute.js";
//Onboarding App
import onboardingAppRoute from "./routes/onboardingAppRoute/userRoute.js";
import onboardingPartnerPostRoute from "./routes/onboardingAppRoute/postRoutes.js";
import onboardingSubscription from "./routes/onboardingAppRoute/subscription.js";
//ProjectPartner App
import projectPartnerAppRoute from "./routes/projectPartnerAppRoute/userRoute.js";
import projectPartnerPostRoute from "./routes/projectPartnerAppRoute/postRoutes.js";
import projectSubscription from "./routes/projectPartnerAppRoute/subscription.js";
import projectEnquiriesRoute from "./routes/projectPartnerAppRoute/enquiryRoute.js";
import projectpartnerSalesAndTerritoryRoute from "./routes/projectPartnerAppRoute/partnerRoute.js";
import projectPartnerEmployee from "./routes/projectPartnerAppRoute/employeeRoute.js";
import projectPartnerTickets from "./routes/projectPartnerAppRoute/ticketRouter.js";
import projectpartnerappDepartment from "./routes/projectPartnerAppRoute/departmentRoutes.js";
import projectPartnerRoles from "./routes/projectPartnerAppRoute/roleRoutes.js";
//Customer App
import customerEmi from "./routes/customerAppRoute/EmiRoute.js";
import customerSignUp from "./routes/customerAppRoute/userRoute.js";
import customerPropertyRoute from "./routes/customerAppRoute/propertyRoute.js";
import customerTrendRoute from "./routes/customerAppRoute/trendRoute.js";
import customerEnquiryRoute from "./routes/customerAppRoute/enquiryRoute.js";

//Builder App
import builderapploginRoute from "./routes/builderAppRoute/builderapploginRoute.js";
import builderProfileRoute from "./routes/builderAppRoute/builderProfileRoutes.js";
import builderpropertyRoute from "./routes/builderAppRoute/propertyController.js";
import builderEnquiryCustomerRoute from "./routes/builderAppRoute/builderPropertyEnquiryRoute.js";
import builderCommunityRoute from "./routes/builderAppRoute/communityRoute.js";
import builderTicketRoute from "./routes/builderAppRoute/BuilderTicketRoutes.js";
import builderpostRoute from "./routes/builderAppRoute/BuilderpostRoutes.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }, // Use `secure: true` in production with HTTPS
  })
);

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
// Serve static files from 'uploads' directory
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "https://admin.reparv.in",
  "https://reparv.in",
  "https://www.reparv.in",
  "https://users.reparv.in",
  "https://builder.reparv.in",
  "https://employee.reparv.in",
  "https://promoter.reparv.in",
  "https://partners.reparv.in",
  "https://onboarding.reparv.in",
  "https://sales.reparv.in",
  "https://projectpartner.reparv.in",
  "https://territory.reparv.in",
  "https://business.reparv.in",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error("Blocked by CORS:", origin); // Debugging
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// Use the same custom CORS for preflight requests
app.options(
  "*",
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error("Blocked by CORS (OPTIONS):", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);
app.use(cookieParser());

export const verifyToken = (req, res, next) => {
  const publicRoutes = [
    "/admin/login",
    "/builder/login",
    "/employee/login",
    "/promoter/login",
    "/sales/login",
    "/partner/login",
    "/project-partner/login",
    "/territory-partner/login",
    "/guest-user/register",
    "/guest-user/login",
    "/admin/authorities",
    "/admin/states",
    "/admin/cities",
    "/admin/promoter/add",
    "/admin/salespersons/status",
    "/admin/salespersons/add",
    "/admin/salespersons/assignlogin",
    "/admin/partner/add",
    "/admin/partner/assignlogin",
    "/admin/partner/status",
    "/admin/projectpartner/status",
    "/admin/projectpartner/add",
    "/admin/projectpartner/assignlogin",
    "/admin/territorypartner/add",
    "/admin/territorypartner/status",
    "/admin/territorypartner/assignlogin",
    "/admin/subscription/pricing",
    "/admin/marketing-content",
    "/admin/apk",
    "/api/payment/create-order",
    "/api/payment/verify-payment",
    "/frontend/properties",
    "/frontend/all-properties",
    "/frontend/joinourteam",
    "/frontend/propertyinfo",
    "/frontend/enquiry",
    "/frontend/blog",
    "/frontend/blog/",
    "/frontend/blog/details/",
    "/frontend/slider",
    "/frontend/testimonial",
    "/frontend/emi",
    "/frontend/project-partner",
    "/salesapp/enquiry",
    "/api/booking",
    "/salesapp/api/login",
    "/sales/flat",
    "/salesapp/flats",
    "/salesapp/subscription",
    "/salesapp/subscription/validate",
    "/territoryapp/user",
    "/territoryapp/subscription",
    "/upload",
    "/salesapp/tickets",
    "/salesapp/post",
    "/salesapp/user",
    "/salesapp/client",
    "/territoryapp/user",
    "/territoryapp/post",
    "/territoryapp/post/get",
    "/customerapp/enquiry",
    "/customerapp/",
    "/customerapp/emiform",
    "/builderapp/community",
    "/builderapp/user",
    "/builderapp/post",
    "/onboardingapp/post",
    "/projectpartner/post",
    "/projectpartner/subscription",
    "/onboardingapp/subscription",
    "/api/partner/account/cancellation",
    "/projectpartnerRoute/user/:city",
    "/projectpartnerRoute/user",
    "/territoryapp/enquiry/add/",
    "/projectpartner/employee/",
    "/salesapp/schedule-notes",
    "/projectpartner/enquiries/add",
    "/projectpartner/enquiries/enquiry/",
    "/projectpartner/enquiries/get",
    "/projectpartner/enquiries/assign/to/reparv",
    "/projectpartner/enquiries/enquiry/status/",
    "/projectpartner/ticket",
    "/projectpartner/enquiries/get/partnersenquiry",
    "/territoryapp/property/enquiry",
    "/salesapp/property/enquiry",
    "/projectpartner/enquiries/getdigitalenquiry/",
    "/projectpartner/departments",
    "/projectpartner/roles",
    "/project-partner/profile/contact",
    "/project-partner/profile/schedule",
  ];

  // Skip verification for public routes
  if (publicRoutes.some((route) => req.path.startsWith(route))) {
    return next();
  }

  // Map cookies to user keys
  const cookieMap = {
    adminToken: "adminUser",
    builderToken: "builderUser",
    employeeToken: "employeeUser",
    promoterToken: "promoterUser",
    salesToken: "salesUser",
    onboardingToken: "onboardingUser",
    projectPartnerToken: "projectPartnerUser",
    territoryToken: "territoryUser",
    userToken: "guestUser",
    token: "user",
  };

  // Decode all valid tokens (don’t stop at first)
  let atLeastOneValid = false;

  for (const [cookieName, userKey] of Object.entries(cookieMap)) {
    const token = req.cookies?.[cookieName];
    if (!token) continue;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req[userKey] = decoded; // Store individually
      atLeastOneValid = true;
    } catch (error) {
      console.warn(`Invalid token for ${cookieName}:`, error.message);
    }
  }

  if (!atLeastOneValid) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }

  next();
};

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running successfully!",
  });
});

app.get("/get-cookie", (req, res) => {
  console.log("Cookies:", req.cookies); //  Print cookies in terminal
  res.json({ cookies: req.cookies }); // Send cookie data in response
});

// Use Login & Auth Routes

app.use("/admin", loginRoutes);

//frontend
app.use("/frontend/all-properties", allPropertiesRoutes);
app.use("/frontend/properties", propertiesRoutes);
app.use("/frontend/joinourteam", joinourteamRoutes);
app.use("/frontend/propertyinfo", propertyinfoRoutes);
app.use("/frontend/enquiry", enquiryRoutes);
app.use("/frontend/blog", frontendBlogRoutes);
app.use("/frontend/slider", sliderImagesRoutes);
app.use("/frontend/testimonial", testimonialFeedbackRoutes);
app.use("/frontend/emi", frontendEmiRoutes);
// frontend project-partner landing page
app.use("/frontend/project-partner", frontendProjectPartnerRoutes);

// Payment Call
app.use("/api/payment", paymentRoutes);

// Subscription Payment Call
app.use("/api/subscription/payment", subscriptionPaymentRoutes);
app.use("/api/redeem", redeemRoutes);

// Account Cancellation Request
app.use("/api/partner/account", accountCancellation);

// Map Route Call
app.use("/api/map", geocodeRoutes);

app.post("/api/saveSheetData", async (req, res) => {
  try {
    const { rows } = req.body;

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "No sheet data received" });
    }

    const header = rows[0];
    const dataRows = rows.slice(1); // skip header
    const updatedRows = [];

    // Convert db.query to promise
    const queryAsync = (sql, values) =>
      new Promise((resolve, reject) => {
        db.query(sql, values, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

    for (let index = 0; index < dataRows.length; index++) {
      const row = dataRows[index];

      const leadStatus = (row[18] || "").trim().toUpperCase(); // Column 19

      // Only insert rows marked as CREATED
      if (leadStatus !== "CREATED") continue;

      const fullName = row[14] || ""; // Column 15
      const rawPhone = row[16] || ""; // Column 17
      const city = row[17] || ""; // Column 18
      const budgetRange = row[12] || ""; // Column 13

      // Clean the phone number
      const contact = rawPhone.replace(/[^0-9]/g, "");

      // Extract minbudget and maxbudget
      let minbudget = 0;
      let maxbudget = 0;

      try {
        if (budgetRange.includes("to")) {
          const parts = budgetRange.split("to");

          minbudget = parseInt(parts[0].replace("_lakhs", "").trim()) * 100000;
          maxbudget = parseInt(parts[1].replace("_lakhs", "").trim()) * 100000;
        }
      } catch (err) {
        console.error("Budget Parse Error:", err);
      }

      // Insert into database
      const insertSql = `
        INSERT INTO enquirers (customer, contact, city, minbudget, maxbudget)
        VALUES (?, ?, ?, ?, ?)
      `;

      try {
        await queryAsync(insertSql, [
          fullName,
          contact,
          city,
          minbudget,
          maxbudget,
        ]);

        console.log(`Inserted: ${fullName} | ${contact} | ${city}`);

        // Mark row as updated (Google Sheet index)
        updatedRows.push({
          rowIndex: index + 2, // Sheet starts at row 2 (after header)
          newStatus: "Added",
        });

        // Update local array also → status column is index 18
        row[18] = "Added";
      } catch (err) {
        console.error("Database Insert Error:", err);
      }
    }

    res.json({
      message: "Sheet data processed successfully",
      updateRows: updatedRows,
      updatedSheet: [header, ...dataRows],
    });
  } catch (e) {
    console.error("API Error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.use(verifyToken);
app.use("/admin/profile", profileRoutes);
app.use("/admin/dashboard", dashboardRoutes);
app.use("/admin/employees", employeeRoutes);
app.use("/admin/properties", propertyRoutes);
app.use("/admin/property/additional-info", propertyAdditionalInfoRoutes);
app.use("/admin/builders", builderRoutes);
app.use("/admin/customers", customerRoutes);
app.use("/admin/roles", roleRoutes);
app.use("/admin/departments", departmentRoutes);
app.use("/admin/authorities", authoritiesRoutes);
app.use("/admin/states", stateRoutes);
app.use("/admin/cities", cityRoutes);
app.use("/admin/map", mapRoutes);
app.use("/admin/promoter", promoterRoutes);
app.use("/admin/ads-manager", adsManagerRoutes);
app.use("/admin/salespersons", salespersonRoutes);
app.use("/admin/partner", partnerRoutes);
app.use("/admin/projectpartner", projectPartnerRoutes);
app.use("/admin/territorypartner", territoryPartnerRoutes);
app.use("/admin/guestuser", guestUserRoutes);
app.use("/admin/subscription/pricing", subscriptionPricingRoutes);
app.use("/admin/subscription/discount", subscriptionDiscountRoutes);
app.use("/admin/propertytypes", propertytypeRoutes);
app.use("/admin/enquirers", enquirerRoutes);
// CSV File add Enquiries Route
app.use("/admin/enquiries", verifyToken, addEnquiryRoutes);
app.use("/admin/auctionmembers", auctionmembersRoutes);
app.use("/admin/tickets", ticketRoutes);
app.use("/admin/apk", apkUploadRoutes);
app.use("/admin/blog", blogRoutes);
app.use("/admin/trend", trendRoutes);
app.use("/admin/slider", sliderRoutes);
app.use("/admin/testimonial", testimonialRoutes);
app.use("/admin/calender", calenderRoutes);
app.use("/admin/emi", emiRoutes);
app.use("/admin/marketing-content", marketingContentRoutes);
app.use("/admin/brand-accessories", brandAccessoriesRoutes);
app.use("/admin/messages", messageRoutes);

// Guest User Routes
app.use("/guest-user", guestUserLoginRoutes);
app.use("/guest-user/profile", guestUserProfileRoutes);
app.use("/guest-user/dashboard", guestUserDashboardRoutes);
app.use("/guest-user/builders", guestUserBuilderRoutes);
app.use("/guest-user/properties", guestUserPropertyRoutes);
app.use("/guest-user/map", guestUserMapRoutes);

// Builder Routes
app.use("/builder", builderLoginRoutes);
app.use("/builder/profile", builderProfileRoutes);
app.use("/builder/dashboard", builderDashboardRoutes);
app.use("/builder/customers", builderCustomerRoutes);
app.use("/builder/properties", builderPropertyRoutes);
app.use("/builder/tickets", builderTicketRoutes);

// Employee Routes
app.use("/employee", employeeLoginRoutes);
app.use("/employee/profile", employeeProfileRoutes);
app.use("/employee/dashboard", employeeDashboardRoutes);
app.use("/employee/tickets", employeeTicketRoutes);
// Employee Project Partner Routes
app.use("/employee/builders", employeeBuilderRoutes);
app.use("/employee/properties", employeePropertyRoutes);
app.use("/employee/enquirers", employeeEnquirersRoutes);
app.use("/employee/map", employeeMapRoutes);
app.use("/employee/customers", employeeCustomerRoutes);
app.use("/employee/sales", employeeSalesPartnerRoutes);
app.use("/employee/territory", employeeTerritoryPartnerRoutes);
app.use("/employee/enquiry", employeeEnquiryRoutes);
app.use("/employee/calender", employeeCalenderRoutes);
app.use("/employee/roles", employeeRoleRoutes);
app.use("/employee/departments", employeeDepartmentRoutes);
app.use("/employee/messages", employeeMessageRoutes);

// Promoter Partner Routes
app.use("/promoter", promoterLoginRoutes);
app.use("/promoter/profile", promoterProfileRoutes);
app.use("/promoter/agreement", promoterAgreementRoutes);
app.use("/promoter/dashboard", promoterDashboardRoutes);
app.use("/promoter/enquirers", promoterEnquirerRoutes);
app.use("/promoter/customers", promoterCustomerRoutes);
app.use("/promoter/salespersons", promoterSalespersonRoutes);
app.use("/promoter/partner", promoterPartnerRoutes);
app.use("/promoter/projectpartner", promoterProjectPartnerRoutes);
app.use("/promoter/territorypartner", promoterTerritoryPartnerRoutes);
app.use("/promoter/emi", promoterEmiRoutes);
app.use("/promoter/tickets", promoterTicketRoutes);

//Sales Person Routes
app.use("/sales", salesLoginRoutes);
app.use("/sales/profile", salesProfileRoutes);
app.use("/sales/agreement", salesAgreementRoutes);
app.use("/sales/enquirers", salesEnquirersRoutes);
app.use("/sales/dashboard", salesDashboardRoutes);
app.use("/sales/properties", salesPropertyRoutes);
app.use("/sales/customers", salesCustomerRoutes);
app.use("/sales/tickets", salesTicketRoutes);
app.use("/sales/calender", salesCalenderRoutes);
app.use("/sales/enquiry", salesEnquiryRoutes);
// Property Pages Routes
app.use("/sales/properties", salesPropertiesRoutes);
app.use("/sales/propertyinfo", salesPropertyinfoRoutes);

// On Boarding Partner Routes
app.use("/partner", partnerLoginRoutes);
app.use("/partner/profile", partnerProfileRoutes);
app.use("/partner/agreement", partnerAgreementRoutes);
app.use("/partner/dashboard", partnerDashboardRoutes);
app.use("/partner/properties", partnerPropertyRoutes);
app.use("/partner/map", partnerMapRoutes);
app.use("/partner/builders", partnerBuilderRoutes);
app.use("/partner/tickets", partnerTicketRoutes);

// Project Partner Routes
app.use("/project-partner", projectPartnerLoginRoutes);
app.use("/project-partner/profile", projectPartnerProfileRoutes);
app.use("/project-partner/agreement", projectPartnerAgreementRoutes);
app.use("/project-partner/dashboard", projectPartnerDashboardRoutes);
app.use("/project-partner/properties", projectPartnerPropertyRoutes);
app.use(
  "/project-partner/property/additional-info",
  projectPartnerPropertyAdditionalInfoRoutes
);
app.use("/project-partner/map", projectPartnerMapRoutes);
app.use("/project-partner/customers", projectPartnerCustomerRoutes);
app.use("/project-partner/builders", projectPartnerBuilderRoutes);
app.use("/project-partner/tickets", projectPartnerTicketRoutes);
app.use("/project-partner/sales", projectSalesPartnerRoutes);
app.use("/project-partner/territory", projectTerritoryPartnerRoutes);
app.use("/project-partner/enquirers", projectEnquirerRoutes);
app.use("/project-partner/enquiry", projectEnquiryRoutes);
app.use("/project-partner/calender", projectCalenderRoutes);
app.use("/project-partner/roles", projectRoleRoutes);
app.use("/project-partner/departments", projectDepartmentRoutes);
app.use("/project-partner/employees", projectEmployeeRoutes);
app.use("/project-partner/slider", projectSliderRoutes);
app.use("/project-partner/messages", projectPartnerMessageRoutes);
app.use("/project-partner/subscription", projectPartnerSubscriptionRoutes);

// Territory Partner Routes
app.use("/territory-partner", territoryPartnerLoginRoutes);
app.use("/territory-partner/profile", territoryPartnerProfileRoutes);
app.use("/territory-partner/agreement", territoryPartnerAgreementRoutes);
app.use("/territory-partner/dashboard", territoryPartnerDashboardRoutes);
//app.use("/territory-partner/properties", territoryPartnerPropertyRoutes);
app.use("/territory-partner/builders", territoryPartnerBuilderRoutes);
app.use("/territory-partner/tickets", territoryPartnerTicketRoutes);
app.use("/territory-partner/customers", territoryPartnerCustomerRoutes);
app.use("/territory-partner/enquirers", territoryPartnerEnquirersRoutes);
app.use("/territory-partner/enquiry", territoryPartnerEnquiryRoutes);
app.use("/territory-partner/calender", territoryPartnerCalenderRoutes);
// Property Pages Routes
app.use("/territory-partner/properties", territoryPartnerPropertiesRoutes);
app.use("/territory-partner/propertyinfo", territoryPartnerPropertyinfoRoutes);

//Sales App Routes
app.use("/salesapp/api", authRoute);
app.use("/salesapp/flats", appFlatRoute);
app.use("/salesapp/tickets", appTicketRoute);
app.use("/salesapp/post", postRoute);
app.use("/salesapp/user", userController);
app.use("/salesapp/client", clientRoute);
app.use("/salesapp/enquiry", enquiryRoutesSaleApp);
app.use("/salesapp/subscription", salesSubscription);
app.use("/salesapp/property/enquiry", salesPropertyEnquiry);
app.use("/salesapp/schedule-notes", scheduleNotesRoutes);

//Territory App Route
app.use("/territoryapp/user", territoryUserController);
app.use("/territoryapp/post", territorypostRoute);
app.use("/territoryapp/client", territoryClientRoute);
app.use("/territoryapp/enquiry", territoryEnquiryRoute);
app.use("/territoryapp/property/enquiry", territoryPropertyEnquiryRoute);
app.use("/territoryapp/subscription", territorySubscription);
//Book Enquiry Property
app.use("/api/booking", bookPropertyRoute);
//get territory Book Enquiry Property
app.use("/api/booking/territory", territoryBooking);

//onboarding Partner
app.use("/onboardingapp/user", onboardingAppRoute);
app.use("/onboardingapp/post", onboardingPartnerPostRoute);
app.use("/onboardingapp/subscription", onboardingSubscription);
//ProjectPartner App
app.use("/projectpartnerRoute/user", projectPartnerAppRoute);
app.use("/projectpartner/post", projectPartnerPostRoute);
app.use("/projectpartner/subscription", projectSubscription);
app.use("/projectpartner/enquiries", projectEnquiriesRoute);
app.use("/projectpartner/partner", projectpartnerSalesAndTerritoryRoute);
app.use("/projectpartner/employee", projectPartnerEmployee);
app.use("/projectpartner/ticket", projectPartnerTickets);
app.use("/projectpartner/departments", projectpartnerappDepartment);
app.use("/projectpartner/roles", projectPartnerRoles);

//Customer app
app.use("/customerapp", customerEmi);
app.use("/customerapp/user", customerSignUp);
app.use("/customerapp/property", customerPropertyRoute);
app.use("/customerapp/customerTrendRoute", customerTrendRoute);
app.use("/customerapp/enquiry", customerEnquiryRoute);

//Builder app
app.use("/builderapp/user", builderapploginRoute);
app.use("/builderapp/profile", builderProfileRoute);
app.use("/builderapp/property", builderpropertyRoute);
app.use("/builderapp/customer", builderEnquiryCustomerRoute);
app.use("/builderapp/community", builderCommunityRoute);
app.use("/builderapp/ticket", builderTicketRoute);
app.use("/builderapp/post", builderpostRoute);

//  Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
