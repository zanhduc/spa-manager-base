import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.js"],
    css: true,
    globals: true,
    exclude: ["tests/ui/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/client/**/*.{js,jsx}"],
      exclude: ["src/client/main.jsx"],
    },
  },
});
