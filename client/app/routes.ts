import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin-dashboard", "routes/admin-dashboard.tsx"),
  route("audit-logs", "routes/audit-logs.tsx"),
  route("profile", "routes/profile.tsx"),
  route("change-password", "routes/change-password.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx"),
] satisfies RouteConfig;