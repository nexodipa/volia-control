import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Atlas aparte: aplicación estática (sin servidor ni base de datos) que se publica en su propio Worker.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
