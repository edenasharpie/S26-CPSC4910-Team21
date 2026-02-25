import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin/profile/:id", "routes/admin/profile/$id/edit.tsx"),
  route("admin/profile/:id/points", "routes/admin/profile/$id/points.tsx"),
  route("about", "routes/about.tsx"),
  route("admin-dashboard", "routes/admin/dashboard.tsx"),
  route("audit-logs", "routes/admin/audit-logs.tsx"),
  route("catalogs", "routes/admin/catalogs.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")
] satisfies RouteConfig;