import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin/profile/:id", "routes/admin/profile/$id/edit.tsx"),
  route("admin/profile/:id/points", "routes/admin/profile/$id/points.tsx"),
  route("admin/invoices", "routes/admin/invoices.tsx"),
  route("about", "routes/about.tsx"),
  route("admin/dashboard", "routes/admin/dashboard.tsx"),
  route("admin/audit-logs", "routes/admin/audit-logs.tsx"),
  //route("profile", "routes/profile.tsx"),
  //route("change-password", "routes/change-password.tsx"),
  route("admin/catalogs", "routes/admin/catalogs.tsx"),
  route("driver/catalogs", "routes/driver/catalogs.tsx"),
  route("sponsor/catalogs", "routes/sponsor/catalogs.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")
] satisfies RouteConfig;