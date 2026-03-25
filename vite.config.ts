import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    host: "::",
    port: 8080,
    // Tauri expects a fixed port
    strictPort: true,
  },
  // Allow Tauri env variables
  envPrefix: ["VITE_", "TAURI_"],
  // PGlite needs its WASM/data files served without transformation
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks — split large dependencies
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-popover", "@radix-ui/react-tooltip"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-datefns": ["date-fns"],
          "vendor-pglite": ["@electric-sql/pglite"],
        },
      },
    },
  },
}));
