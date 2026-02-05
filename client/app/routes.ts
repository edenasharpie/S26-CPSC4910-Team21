import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin-dashboard", "routes/admin-dashboard.tsx"),
  route("audit-logs", "routes/audit-logs.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx"),
] satisfies RouteConfig;