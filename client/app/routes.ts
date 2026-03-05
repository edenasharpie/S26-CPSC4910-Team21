import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  //INFO
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx"),

  //DASHBOARDS
  route("admin/dashboard", "routes/admin/dashboard.tsx"),
  route("sponsor/dashboard", "routes/sponsor/dashboard.tsx"),

  //PROFILES
  route("admin/profile/:id", "routes/admin/profile/$id/edit.tsx"),

  //POINTS
  route("admin/profile/:id/points", "routes/admin/profile/$id/points.tsx"),

  //INVOICES
  route("admin/invoices", "routes/admin/invoices.tsx"),
  route("sponsor/invoices", "routes/sponsor/invoices.tsx"),

  //AUDIT LOGS
  route("admin/audit-logs", "routes/admin/audit-logs.tsx"),
  route("admin/reports", "routes/admin/reports.tsx"),
  //route("profile", "routes/profile.tsx"),
  //route("change-password", "routes/change-password.tsx"),
  route("admin/catalogs", "routes/admin/catalogs.tsx"),
  route("driver/catalogs", "routes/driver/catalogs.tsx"),
  route("sponsor/catalogs", "routes/sponsor/catalogs.tsx"),
  route("sponsor/reports", "routes/sponsor/reports.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")
] satisfies RouteConfig;