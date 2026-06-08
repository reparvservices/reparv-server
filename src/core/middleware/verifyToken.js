import jwt from "jsonwebtoken";

const publicRoutes = [
  "/admin/login",
  "/admin/auth/me",
  "/admin/setup/create-user",
  "/builder/login",
  "/employee/login",
  "/promoter/login",
  "/sales/login",
  "/partner/login",
  "/project-partner/login",
  "/territory-partner/login",
  "/guest-user/register",
  "/guest-user/login",
  "/user/send-otp",
  "/user/verify-otp",
  "/user/auth/google",
  "/admin/faqs",
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
  "/admin/marketing-content",
  "/admin/apk",
  "/api/payment/create-order",
  "/api/payment/verify-payment",
  "/api/user",
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
  "/frontend/contact-us",
  "/frontend/news",
  "/frontend/seo-data",
  "/api/ai",
  "/agent",
  "/ai-chat",
  "/salesapp/enquiry",
  "/api/booking",
  "/salesapp/api/edit",
  "/salesapp/api",
  "/salesapp/api/login",
  "/sales/flat",
  "/salesapp/flats",
  "/salesapp/subscription",
  "/territoryapp/user",
  "/territoryapp/subscription",
  "/upload",
  "/salesapp/tickets",
  "/salesapp/post",
  "/salesapp/user",
  "/salesapp/client",
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
  "/territoryapp/enquiry/getAll",
  "/projectpartner/employee/",
  "/salesapp/schedule-notes",
  "/projectpartner/enquiries/",
  "/projectpartner/enquiries/remarklist/",
  "/projectpartner/enquiries/assignEnquiry/",
  "/projectpartner/enquiries/create",
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
  "/admin/faqs/:location",
  "/admin/propertyAnalytics",
  "/admin/blogAnalytics",
  "/admin/call-enquirers/add",
  "/admin/whatsapp-enquirers/add",
  "/project-partner/properties/additionalinfo/",
  "/customerapp/ticket",
  "customerapp/user/google-login",
  "/customerapp/loans",
  "/admin/blog",
  "/admin/subscribers",
  "/admin/partner",
  "/projectpartner/builders/add",
  "/projectpartner/builders",
  "/projectPartner/property/",
  "/projectpartner/property",
  "/projectpartner/property/generate-upload-url",
  "/meta",
  "/customerapp/notifications",
  "/projectpartner/auth/",
  "/territoryapp/auth",
  "/projectpartner/event",
  "/projectpartner/profile",
  "/sales/customers/payment/add",
  "/territoryapp/client",
  "/api/feed/",
  "/api/follow/",
  "/api/auth/forgot-password/",
  "/event/users/auth",
  "/event/profile/",
  "/event/",
];

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

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Map decoded JWT to partner user key from request path (mobile Bearer auth). */
function assignPartnerFromBearer(req, decoded, path) {
  if (
    path.startsWith("/project-partner/") ||
    path.startsWith("/projectpartner")
  ) {
    req.projectPartnerUser = decoded;
    return true;
  }
  if (path.startsWith("/sales/") || path.startsWith("/salesapp/")) {
    req.salesUser = decoded;
    return true;
  }
  if (
    path.startsWith("/territory-partner/") ||
    path.startsWith("/territoryapp/")
  ) {
    req.territoryUser = decoded;
    return true;
  }
  if (decoded.freeProjectPartner !== undefined) {
    req.projectPartnerUser = decoded;
    return true;
  }
  if (decoded.projectpartnerid !== undefined && decoded.state !== undefined) {
    req.territoryUser = decoded;
    return true;
  }
  req.salesUser = decoded;
  return true;
}

export function verifyToken(req, res, next) {
  if (publicRoutes.some((route) => req.path.startsWith(route))) {
    return next();
  }

  let atLeastOneValid = false;
  const path = req.path || "";

  for (const [cookieName, userKey] of Object.entries(cookieMap)) {
    const token = req.cookies?.[cookieName];
    if (!token) continue;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req[userKey] = decoded;
      atLeastOneValid = true;
    } catch (error) {
      console.warn(`Invalid token for ${cookieName}:`, error.message);
    }
  }

  if (!atLeastOneValid) {
    const bearer = readBearerToken(req);
    if (bearer) {
      try {
        const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
        if (assignPartnerFromBearer(req, decoded, path)) {
          atLeastOneValid = true;
        }
      } catch (error) {
        console.warn("Invalid Bearer token:", error.message);
      }
    }
  }

  if (!atLeastOneValid) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }

  next();
}
