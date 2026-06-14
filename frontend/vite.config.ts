import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config. The dev server runs on :5173 (the origin allowed by the backend
// CORS list). API calls go straight to VITE_API_BASE_URL (see src/lib/api.ts),
// so no dev proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // Vitest: jsdom environment for component tests (added from Phase 2 on).
    environment: "jsdom",
    globals: true,
  },
});
