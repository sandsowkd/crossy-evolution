import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    // Frozen training copies and growing research archives are not application sources.
    watch: { ignored: ["**/.publication/**", "**/results/**", "**/.reference/**", "**/artifacts/**"] },
  },
});
