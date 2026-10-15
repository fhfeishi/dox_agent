import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Keep the shared React runtime together; feature pages remain lazy-loaded.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return "react-vendor";
        },
      },
    },
  },
  server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:8000" } },
});

