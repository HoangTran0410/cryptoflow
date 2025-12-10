import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  return {
    base: "./",
    root: "src",
    build: {
      outDir: "../",
      emptyOutDir: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom"],
            "ui-vendor": ["lucide-react", "d3", "recharts", "tailwindcss"],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
