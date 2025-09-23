import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: ["app.lorna.tv","lector.lorna.tv","localhost","127.0.0.1","85.31.239.110"],
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: ["app.lorna.tv","lector.lorna.tv","localhost","127.0.0.1","85.31.239.110"],
      origin: "https://app.lorna.tv",
      hmr: { protocol: "wss", host: "app.lorna.tv", port: 443 },
    },
    define: { "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || "") },
  };
});
