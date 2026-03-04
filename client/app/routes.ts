import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),

  //ACCOUNT EDITING
  //route("admin/profile/:id", "routes/admin/$id/profile/$id/edit.tsx"),
  //route("sponsor/profile/:id", "routes/sponsor/profile/$id/edit.tsx"),
  //route("driver/profile/:id", "routes/driver/profile/$id/edit.tsx"),

  //POINTS MANAGEMENT
  //route("admin/profile/:id/points", "routes/admin/$id/profile/$id/points.tsx"),
  //route("sponsor/profile/:id/points", "routes/sponsor/profile/$id/points.tsx"),
  //route("driver/profile/:id/points", "routes/driver/profile/$id/points.tsx"),

  //INVOICES
  //route("admin/invoices", "routes/admin/$id/invoices.tsx"),
  //route("sponsor/invoices", "routes/sponsor/invoices.tsx"),
  //route("driver/invoices", "routes/driver/invoices.tsx"),

  //DASHBOARD
  route("admin/dashboard", "routes/admin/$id/dashboard.tsx"),
  //route("sponsor/dashboard", "routes/sponsor/dashboard.tsx"),
  //route("driver/dashboard", "routes/driver/dashboard.tsx"),

  //AUDIT LOGS
  //route("admin/audit-logs", "routes/admin/$id/audit-logs.tsx"),
  //route("sponsor/audit-logs", "routes/sponsor/audit-logs.tsx"),
  //route("driver/audit-logs", "routes/driver/audit-logs.tsx"),

  //CATALOGS
  //route("admin/catalogs", "routes/admin/$id/catalogs.tsx"),
 //route("driver/catalogs", "routes/driver/catalogs.tsx"),
  //route("sponsor/catalogs", "routes/sponsor/catalogs.tsx"),

  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")

  //route("profile", "routes/profile.tsx"),
  //route("change-password", "routes/change-password.tsx"),
] satisfies RouteConfig;