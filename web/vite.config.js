// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowed = ["app.lorna.tv", "lector.lorna.tv", "localhost", "127.0.0.1", "85.31.239.110"];

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: allowed,
      hmr: {
        host: "app.lorna.tv",
        protocol: "wss",
        port: 443,
      },
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: allowed,
    },
    optimizeDeps: { include: ["shaka-player"] },
    define: {
      "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || ""),
    },
  };
});
