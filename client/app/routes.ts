import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin/profile/:id", "routes/admin/profile/$id/edit.tsx"),
  route("about", "routes/about.tsx"),
  route("admin-dashboard", "routes/admin/dashboard.tsx"),
  route("audit-logs", "routes/admin/audit-logs.tsx"),
  //route("profile", "routes/profile.tsx"),
  //route("change-password", "routes/change-password.tsx"),
  route("catalogs", "routes/admin/catalogs.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")
] satisfies RouteConfig;