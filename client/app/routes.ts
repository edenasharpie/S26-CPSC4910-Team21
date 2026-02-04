import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  /* demo purposes only */
  route("components-demo", "routes/components-demo.tsx")
] satisfies RouteConfig;