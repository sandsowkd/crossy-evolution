import { defineConfig } from "vite";
import { prerenderFile } from "./src/visualization/prerender-route";
import react from "@vitejs/plugin-react";
import { metadataHtml, pageMetadata, SITE_ORIGIN } from "./src/visualization/page-metadata";
export default defineConfig({
  plugins: [react(), {
    name: "site-metadata",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const file = prerenderFile(url);
        if (file) req.url = file;
        else if (!/\.[a-z0-9]+$/i.test(url.pathname)) { res.statusCode = 404; res.end("Not found"); return; }
        next();
      });
    },
    transformIndexHtml: html => html.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/, `<!-- SEO:START -->\n${metadataHtml(pageMetadata(new URL(SITE_ORIGIN)))}\n<!-- SEO:END -->`),
  }],
  build: {manifest: true},
  server: {watch: {ignored: ["**/.publication/**", "**/results/**", "**/.reference/**", "**/artifacts/**"]}},
});
