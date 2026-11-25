import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = env.VITE_SITE_URL || (productionHost ? `https://${productionHost}` : undefined);
  const siteOrigin = siteUrl ? new URL(siteUrl).origin : undefined;
  if (siteOrigin && !/^https?:\/\//.test(siteOrigin)) throw new Error("VITE_SITE_URL must be an HTTP(S) URL");
  return {
    plugins: [react(), {
      name: "standalone-site-metadata",
      transformIndexHtml: (html) => siteOrigin
        ? html.replaceAll("https://jeremyhua.ng/crossyroadai", siteOrigin)
        : html,
    }],
    server: {
      // Frozen training copies and growing research archives are not application sources.
      watch: { ignored: ["**/.publication/**", "**/results/**", "**/.reference/**", "**/artifacts/**"] },
    },
  };
});
