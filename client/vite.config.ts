import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const browserApiUrl =
  process.env.VITE_API_URL || process.env.API_URL || "";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  define: {
    "process.env.API_URL": JSON.stringify(browserApiUrl),
  },
});
