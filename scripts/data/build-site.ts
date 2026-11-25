/** Prerender the existing React views, then hydrate exactly those components. */
import { build, createServer, type Manifest } from "vite";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { INDEXABLE_PATHS, metadataHtml, pageMetadata, safeJson, SITE_ORIGIN, escapeHtml } from "../../src/visualization/page-metadata";
import type { SiteBootstrap } from "../../src/visualization/site-bootstrap";
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.findIndex(value => value === `--${name}` || value.startsWith(`--${name}=`)); return i < 0 ? undefined : args[i].includes("=") ? args[i].split("=").slice(1).join("=") : args[i + 1]; };
const base = option("base") ?? "/", outDir = option("outDir") ?? "dist";
await build({base, build: {outDir, manifest: true}});
const template = await readFile(path.join(outDir, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(path.join(outDir, ".vite/manifest.json"), "utf8")) as Manifest;
const server = await createServer({base, server: {middlewareMode: true}, appType: "custom"});
try {
  const {render} = await server.ssrLoadModule("/src/entry-server.tsx") as {render: (bootstrap: SiteBootstrap) => string};
  const homepage = JSON.parse(await readFile("public/homepage-data.json", "utf8"));
  homepage.phases = []; // Training history is not used by this view; the archive is untouched.
  const catalog = JSON.parse(await readFile("public/explorer-catalog.json", "utf8"));
  const pages: {file: string; url: string; bootstrap?: SiteBootstrap; component?: string}[] = [
    {file: "_pages/home.html", url: "/", component: "Homepage", bootstrap: {page: "home", variant: 1, url: `${SITE_ORIGIN}/`, homepage}},
    {file: "_pages/play.html", url: "/play", component: "Play", bootstrap: {page: "play", variant: 1, url: `${SITE_ORIGIN}/play`}},
    {file: "_pages/explore-1.html", url: "/explore", component: "Explorer", bootstrap: {page: "explorer", variant: 1, url: `${SITE_ORIGIN}/explore`, catalog}},
    {file: "_pages/explore-2.html", url: "/explore?variant=2", component: "Explorer", bootstrap: {page: "explorer", variant: 2, url: `${SITE_ORIGIN}/explore?variant=2`, catalog}},
    {file: "_pages/replay.html", url: "/?generation=150"},
    {file: "_pages/inspector.html", url: "/?variant=2"},
    {file: "_pages/play-state.html", url: "/play?seed=42"},
  ];
  for (const page of pages) {
    let html = template.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/, `<!-- SEO:START -->\n${metadataHtml(pageMetadata(new URL(page.url, SITE_ORIGIN)))}\n<!-- SEO:END -->`);
    if (page.bootstrap) {
      const markup = render(page.bootstrap);
      if (markup.includes("Switched to client rendering")) throw new Error(`Prerender failed: ${page.file}: ${markup.slice(0, 1000)}`);
      const css = new Set<string>();
      const collect = (key: string) => { const item = manifest[key]; if (!item) return; item.imports?.forEach(collect); item.css?.forEach(file => css.add(file)); };
      collect(`src/visualization/${page.component}.tsx`);
      html = html.replace("</head>", [...css].filter(file => !html.includes(file)).map(file=>`<link rel="stylesheet" href="${base}${file}" />`).join("\n") + "\n</head>");
      html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>\n<script type="application/json" id="site-bootstrap">${safeJson(page.bootstrap)}</script>`);
    }
    // Vite's SSR loader exposes source asset URLs; use the exact browser-build
    // manifest mapping so the server HTML and hydrated image attributes agree.
    for (const [source, asset] of Object.entries(manifest)) {
      if (source.startsWith("src/") && /\.(png|jpe?g|svg|webp)$/.test(source))
        html = html.replaceAll(`${base}${source}`, `${base}${asset.file}`);
    }
    await mkdir(path.dirname(path.join(outDir, page.file)), {recursive: true});
    await writeFile(path.join(outDir, page.file), html);
    console.log(`Prerendered ${page.file}: ${page.bootstrap ? "existing React view" : "interactive state shell"}`);
  }
  // Public paths must have no competing physical HTML file: Vercel resolves
  // existing files before query-conditioned rewrites. All variants use the
  // same explicit static routing layer, including the homepage.
  await rm(path.join(outDir, "index.html"));
  await writeFile(path.join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
  await writeFile(path.join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${INDEXABLE_PATHS.map(route=>`  <url><loc>${escapeHtml(SITE_ORIGIN + route)}</loc></url>`).join("\n")}\n</urlset>\n`);
} finally { await server.close(); }
