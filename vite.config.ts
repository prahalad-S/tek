import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      deny: [
        "**/.env*",
        "**/private-backup/**",
        "**/private-migration/**",
        "**/.git/**",
      ],
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@radix-ui")) return "accessible-ui";
            if (
              id.includes("react-dom") ||
              id.includes("/react/") ||
              id.includes("react-router")
            )
              return "react-runtime";
          }
        },
      },
    },
  },
});
