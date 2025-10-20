import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react({
        // Enable React Fast Refresh
        fastRefresh: true,
        // Optimize JSX runtime
        jsxRuntime: "automatic",
      }),
      // Bundle analyzer
      visualizer({
        filename: "dist/bundle-analysis.html",
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    build: {
      // Optimize build performance
      target: "esnext",
      minify: "esbuild",
      cssMinify: true,
      // Enable source maps for debugging
      sourcemap: mode === "development",
      // Optimize chunk splitting
      rollupOptions: {
        output: {
          manualChunks: {
            // Separate vendor chunks
            vendor: ["react", "react-dom"],
            router: ["react-router-dom"],
            player: ["hls.js", "shaka-player"],
            utils: ["axios"],
          },
          // Optimize chunk names
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
    },
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
    // Optimize dependencies
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom", "axios"],
      exclude: ["shaka-player"], // Load shaka-player separately
    },
  };
});
