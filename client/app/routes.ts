import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin/profile/:id", "routes/admin/profile/$id/edit.tsx"),
  route("admin/add-driver", "routes/admin/add-driver.tsx"),
  route("admin/add-sponsor", "routes/admin/add-sponsor.tsx"),
  route("admin/manage-users", "routes/admin/manage-users.tsx"),
  route("admin/manage-sponsors", "routes/admin/manage-sponsors.tsx"),
  route("about", "routes/about.tsx"),
  route("admin-dashboard", "routes/admin-dashboard.tsx"),
  route("audit-logs", "routes/audit-logs.tsx"),
  route("driver-dashboard/:id", "routes/driver-dashboard.tsx"),
  route("sponsor/deduct-points", "routes/sponsor/deduct-points.tsx"),
  //route("profile", "routes/profile.tsx"),
  //route("change-password", "routes/change-password.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx"),
] satisfies RouteConfig;