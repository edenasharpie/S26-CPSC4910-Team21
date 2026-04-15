import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  //INFO
  index("routes/home.tsx"),
  route("login",  "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("apply", "routes/apply.tsx"),
  route("logout", "routes/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("exit-assumption", "routes/exit-assumption.tsx"),
  route("about", "routes/about.tsx"),
  route("change-password", "routes/change-password.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx"),

  //DASHBOARDS
  route("admin/dashboard", "routes/admin/dashboard.tsx"),
  route("sponsor/dashboard", "routes/sponsor/dashboard.tsx"),
  route("driver/dashboard", "routes/driver/dashboard.tsx"),

  //SETTINGS
  route("sponsor/settings/:userId", "routes/sponsor/settings.$userId.tsx"),
  route("admin/settings/:userId", "routes/admin/settings.$userId.tsx"),
  //route("driver/settings/:userId", "routes/driver/settings.$userId.tsx"),

  //POINTS (must come before generic profile routes)
  route("admin/profile/:id/points", "routes/admin/profile/$id/points.tsx"),
  route("sponsor/profile/:id/points", "routes/sponsor/profile/$id/points.tsx"),
  //route("driver/profile/:id/points", "routes/driver/profile/$id/points.tsx"),

  //PROFILES
  route("admin/profile/:id/edit", "routes/admin/profile/$id/edit.tsx"),
  route("sponsor/profile/:id/edit", "routes/sponsor/profile/$id/edit.tsx"),
  route("driver/profile/:id/edit", "routes/driver/profile/$id/edit.tsx"),

  //INVOICES
  route("admin/invoices", "routes/admin/invoices.tsx"),
  route("sponsor/invoices", "routes/sponsor/invoices.tsx"),

  //AUDIT LOGS
  route("admin/audit-logs", "routes/admin/audit-logs.tsx"),
  route("admin/debug-navigation", "routes/admin/debug-navigation.tsx"),

  //REPORTS
  route("admin/reports", "routes/admin/reports.tsx"),
  route("sponsor/reports", "routes/sponsor/reports.tsx"),
  route("sponsor/reviews", "routes/sponsor/reviews.tsx"),

  //CATALOGS
  route("admin/catalogs", "routes/admin/catalogs.tsx"),
  route("driver/catalogs", "routes/driver/catalogs.tsx"),
  route("driver/orders", "routes/driver/orders.tsx"),
  route("sponsor/catalogs", "routes/sponsor/catalogs.tsx"),

  //ADMIN USER MANAGEMENT (quick-add forms)
  route("admin/add-driver", "routes/admin/add-driver.tsx"),
  route("admin/add-sponsor", "routes/admin/add-sponsor.tsx"),
  route("admin/bulk-upload", "routes/admin/bulk-upload.tsx"),

  //SPONSOR FLEET MANAGEMENT
  route("sponsor/driver-purchases", "routes/sponsor/driver-purchases.tsx"),
  route("sponsor/applications", "routes/sponsor/applications.tsx"),
  route("sponsor/bulk-upload", "routes/sponsor/bulk-upload.tsx"),
  route("sponsor/manage-users", "routes/sponsor/manage-users.tsx"),
  route("sponsor/manage-users/:userId", "routes/sponsor/manage-users.$userId.tsx"),

  // Legacy driver dashboard (accessed by URL param)
  route("driver-dashboard/:id", "routes/driver-dashboard.tsx"),

  //Applications
  route("driver/apply", "routes/driver/apply.tsx"),

] satisfies RouteConfig;