import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "app",
    rollupOptions: {
      input: {
        background: "src/background.ts",
        content: "src/content.ts",
        options: "src/options.html",
      },
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
  },
});
