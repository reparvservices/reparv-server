/**
 * Routes mounted before cookie JWT middleware (verifyToken).
 */
import loginRoutes from "../portals/admin/routes/loginRoutes.js";
import allPropertiesRoutes from "../portals/frontend/routes/allPropertiesRoutes.js";
import trendingPropertiesRoutes from "../portals/frontend/routes/trendingPropertiesRoutes.js";
import propertiesRoutes from "../portals/frontend/routes/propertiesRoutes.js";
import joinourteamRoutes from "../portals/frontend/routes/joinourteamRoutes.js";
import propertyinfoRoutes from "../portals/frontend/routes/propertyinfoRoutes.js";
import enquiryRoutes from "../portals/frontend/routes/enquiryRoutes.js";
import frontendBlogRoutes from "../portals/frontend/routes/blogRoutes.js";
import sliderImagesRoutes from "../portals/frontend/routes/sliderRoutes.js";
import testimonialFeedbackRoutes from "../portals/frontend/routes/testimonialRoutes.js";
import frontendEmiRoutes from "../portals/frontend/routes/emiRoutes.js";
import frontendContactUsRoutes from "../portals/frontend/routes/contactUsRoutes.js";
import frontendNewsRoute from "../portals/frontend/routes/newsRoute.js";
import frontendSeoRoutes from "../portals/frontend/routes/seoData.routes.js";
import frontendProjectPartnerRoutes from "../portals/frontend/routes/projectPartnerRoutes.js";
import weekendVisitRoutes from "../portals/frontend/routes/weekendVisitRoutes.js";
import verifiedPropertiesPageRoutes from "../portals/frontend/routes/verifiedPropertiesPageRoutes.js";
import flatsForSalePageRoutes from "../portals/frontend/routes/flatsForSalePageRoutes.js";
import plotsForSalePageRoutes from "../portals/frontend/routes/plotsForSalePageRoutes.js";
import rentalPropertiesPageRoutes from "../portals/frontend/routes/rentalPropertiesPageRoutes.js";
import newProjectsPageRoutes from "../portals/frontend/routes/newProjectsPageRoutes.js";
import readyToMovePageRoutes from "../portals/frontend/routes/readyToMovePageRoutes.js";
import topTrustedPropertiesPageRoutes from "../portals/frontend/routes/topTrustedPropertiesPageRoutes.js";
import firstTimeBuyerPageRoutes from "../portals/frontend/routes/firstTimeBuyerPageRoutes.js";
import familyDecisionStoriesPageRoutes from "../portals/frontend/routes/familyDecisionStoriesPageRoutes.js";
import budgetToDreamHomePageRoutes from "../portals/frontend/routes/budgetToDreamHomePageRoutes.js";
import paymentRoutes from "../portals/shared/routes/paymentRoutes.js";
import subscriptionCheckoutRoutes from "../portals/subscription/checkout/subscriptionCheckout.routes.js";
import publicPartnerPlansRoutes from "../portals/subscription/routes/publicPartnerPlans.routes.js";
import accountCancellation from "../portals/shared/routes/accountCancellationRoutes.js";
import geocodeRoutes from "../portals/shared/routes/geocodeRoutes.js";
import s3Routes from "../portals/shared/routes/s3Routes.js";
import otpRoutes from "../portals/shared/routes/otpRoutes.js";
import Feed from "../portals/shared/routes/feedRoute.js";
import FollowRoute from "../portals/shared/routes/followRoute.js";
import ForgetPasswordRoute from "../portals/shared/routes/Forgotpasswordroutes.js";
import sitemapRoutes from "../portals/shared/routes/sitemapRoutes.js";
import customersNotify from "../portals/customerApp/routes/notifyroute.js";
import { getAgentPage } from "../ai/controller.js";
import aiPublicRoutes from "../ai/publicRoutes.js";

export function mountPublicRoutes(app) {
  app.use("/admin", loginRoutes);

  app.use("/frontend/all-properties", allPropertiesRoutes);
  app.use("/frontend/trending-properties", trendingPropertiesRoutes);
  app.use("/frontend/properties", propertiesRoutes);
  app.use("/frontend/joinourteam", joinourteamRoutes);
  app.use("/frontend/propertyinfo", propertyinfoRoutes);
  app.use("/frontend/enquiry", enquiryRoutes);
  app.use("/frontend/blog", frontendBlogRoutes);
  app.use("/frontend/slider", sliderImagesRoutes);
  app.use("/frontend/testimonial", testimonialFeedbackRoutes);
  app.use("/frontend/emi", frontendEmiRoutes);
  app.use("/frontend/contact-us", frontendContactUsRoutes);
  app.use("/frontend/news", frontendNewsRoute);
  app.use("/frontend/seo-data", frontendSeoRoutes);
  app.use("/frontend/project-partner", frontendProjectPartnerRoutes);
  app.use("/frontend/weekend-visits", weekendVisitRoutes);
  app.use("/frontend/verified-properties-page", verifiedPropertiesPageRoutes);
  app.use("/frontend/flats-for-sale-page", flatsForSalePageRoutes);
  app.use("/frontend/plots-for-sale-page", plotsForSalePageRoutes);
  app.use("/frontend/rental-properties-page", rentalPropertiesPageRoutes);
  app.use("/frontend/new-projects-page", newProjectsPageRoutes);
  app.use("/frontend/ready-to-move-page", readyToMovePageRoutes);
  app.use("/frontend/top-trusted-properties-page", topTrustedPropertiesPageRoutes);
  app.use("/frontend/first-time-buyer-page", firstTimeBuyerPageRoutes);
  app.use("/frontend/family-decision-stories-page", familyDecisionStoriesPageRoutes);
  app.use("/frontend/budget-to-dream-home-page", budgetToDreamHomePageRoutes);

  app.use("/api/payment", paymentRoutes);
  app.use("/api/subscription/partner-plans", publicPartnerPlansRoutes);
  app.use("/api/subscription/payment", subscriptionCheckoutRoutes);
  app.use("/api/partner/account", accountCancellation);
  app.use("/api/map", geocodeRoutes);
  app.use("/api/s3", s3Routes);
  app.use("/api/user", otpRoutes);
  app.use("/api/customer-notify", customersNotify);
  app.get("/agent", getAgentPage);
  app.use("/api/ai", aiPublicRoutes);

  app.use("/api/feed/", Feed);
  app.use("/api/follow/", FollowRoute);
  app.use("/api/auth/forgot-password/", ForgetPasswordRoute);
  app.use("/", sitemapRoutes);
}
