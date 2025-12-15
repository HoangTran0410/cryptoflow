import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  return {
    base: "./",
    root: "src",
    build: {
      outDir: "../",
      emptyOutDir: false,
      assetsDir: "public",
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor chunks
            if (id.includes("node_modules")) {
              return "vendor";
            }

            for (const folder of [
              "components",
              // "assets",
              // "visualizers",
            ]) {
              if (id.includes(`/${folder}/`)) {
                const componentName = id.split(".")?.[0]?.split(`/`)?.at?.(-1);
                console.log(id, componentName);
                if (componentName) {
                  return `${folder}/${componentName.toLowerCase()}`;
                }
              }
            }

            return "default";
          },
        },
      },
    },
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
