import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // The clinic runs in Turkey (UTC+3); date logic must be tested in that zone, not in CI's UTC.
    env: { TZ: "Europe/Istanbul" },
    include: ["src/**/*.test.ts"],
  },
});
