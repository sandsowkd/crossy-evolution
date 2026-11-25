# Technical SEO and deployment

## Identity and alias follow-up — November 25, 2026

The existing rendering, route metadata, sitemap, crawler policy, design, visible text, and simulation code are retained. The author now uses the same stable `https://jeremyhua.ng/#person` identifier as the personal website, with the verified public handle `sandsowkd`. The owner confirmed `https://www.linkedin.com/in/jeremyhuang-` as the current LinkedIn profile; the obsolete profile reference is not included. `WebSite`, `WebApplication`, and the added `SoftwareSourceCode` node reference this creator. The source node uses `codeRepository` and `targetProduct` to connect the actual TypeScript repository to the application.

A fresh HTTP audit found that the default Vercel hostname's homepage returned 200 even though its child paths redirected. An explicit host-scoped `/` redirect supplements the existing wildcard, preserving preview hosts and meaningful parameters. Root and child aliases must both be verified after deployment; configuration alone is not evidence that Vercel has applied a redirect.

The follow-up passed all 186 existing tests, lint, TypeScript checking through the production build, the build itself, and generated-HTML SEO checks. Mobile (390 × 844) and desktop (1280 × 800) homepage text and measured layout rectangles match the live pre-change site. No game, replay, training, layout, styling, media, or README content was changed. The existing large scene chunk warning remains; no real-user INP data is available from this audit. A fresh PageSpeed API measurement was unavailable because the free endpoint returned HTTP 429.

The historical report below describes the earlier release; its separate `#author` identity and statements about default-host root behavior are superseded by this follow-up.

The canonical site is **https://crossyroadai.com/**. This report covers the technical SEO release of November 24–25, 2026. Existing page wording, layout, colors, navigation, recorded gameplay, controls, and saved populations are preserved. The only visible addition is the separately approved affiliation notice at the bottom of the homepage; it also appears in the README credits.

## Audit and changes

Before this release, the apex domain had Vercel DNS but was absent from the project's domain configuration, causing a hostname/certificate error. The working `www` and default Vercel origins served an empty React root in their initial HTML. There was no robots.txt, sitemap, or structured data. Play and replay chooser routes inherited `noindex, nofollow, noarchive` response headers. Their HTML metadata reused the homepage metadata. An invalid `/lab/...` path returned a successful application shell. The portfolio root redirected to `www`, but project subpaths still served its older embedded copy.

Implemented changes:

- Added the existing apex domain to the Vercel project, connected it to Production, and changed `www` to a permanent 308 redirect to the apex. No DNS or Google verification record was edited.
- Added build-time rendering of the existing React homepage, race setup, and both replay selectors. The same components and data hydrate in the browser. Canonical pages are stored at internal static paths so Vercel's filesystem priority cannot bypass query-based routing. Build-manifest CSS and image URLs prevent unstyled content and broken source-image references. Bootstrap JSON is escaped and includes only data needed by its view.
- Centralized titles, descriptions, absolute canonicals, robots, Open Graph, Twitter cards, and JSON-LD. The canonical origin is fixed independently of preview hosts or a stale environment variable.
- Made the substantive race and replay selector routes indexable. Detailed replay states, historical inspectors, and data archives remain outside the sitemap and have intentional noindex rules. Race seed/variant parameters canonicalize to `/play`; opening the setup must not turn that canonical page into a noindex page.
- Generated a four-URL XML sitemap and an unrestricted public robots.txt during the build, with no invented modification dates.
- Added a 1200 × 630 JPEG sharing image using the existing chicken icon, project colors, and actual gameplay poster. It is metadata-only. The original SVG, ICO, and Apple icon designs remain intact, with a matching 96 × 96 PNG added.
- Deferred offscreen video downloads until playback is needed, preserved visible autoplay/hover behavior, prioritized the first main poster, and lazy-loaded lower posters and decorative illustrations. Homepage rendering does not download the historical training history or replay cohorts.
- Added immutable caching only for content-hashed browser assets. Existing replay archive compression and on-demand integrity checks remain unchanged.
- Replaced broad development-route fallbacks with explicit supported routes. Unknown paths return genuine 404 responses in production. Existing valid replay paths and query parameters remain supported.
- Migrated every portfolio `/crossyroadai` path to its corresponding standalone path, including direct historical cohort aliases. Removed obsolete portfolio SPA rewrites, nofollow headers, and crawler blocks for that migrated subpath. No unrelated portfolio or Ranch routing was changed.
- Updated active README/results links and deployment documentation. Historical evidence files and their original URLs are untouched. The GitHub repository homepage points to the custom domain.

## Indexable URLs and metadata

| Canonical URL | Title |
| --- | --- |
| https://crossyroadai.com/ | Crossy Road AI – Watch AI Learn to Play Crossy Road |
| https://crossyroadai.com/play | Race Against the AI – Crossy Road AI |
| https://crossyroadai.com/explore | Explore Replays – Crossy Road AI |
| https://crossyroadai.com/explore?variant=2 | Explore Variant 2 Replays – Crossy Road AI |

The homepage description is: “Watch AI learn to play Crossy Road using neural networks and genetic algorithms. Explore interactive simulations, evolutionary training, and race against the AI.”

Previously its title was “Crossy Road AI — Teaching the chicken to cross the road.” and its description was “An interactive machine learning experiment in neuroevolution. Watch Crossy Road AI learn to navigate traffic, trains, and rivers. Race against it yourself!” The visible title/subtitle and description have not been replaced by these search snippets.

Each canonical page has one title, description, canonical, and robots tag, a consistent language and viewport, and complete sharing metadata. Variant 1 chooser links containing `?variant=1` canonicalize to `/explore`. Replay generation/map combinations keep their working URLs but do not become thousands of sitemap entries. Unrelated tracking parameters do not change the canonical.

- [Sitemap](https://crossyroadai.com/sitemap.xml)
- [Robots.txt](https://crossyroadai.com/robots.txt)
- [Social preview](https://crossyroadai.com/social-preview.jpg)
- [96-pixel favicon](https://crossyroadai.com/favicon-96.png)

## Rendering and structured data

The initial homepage response now contains its existing H1, section headings, descriptions, preview images, and ordinary navigation links. It is the same content sent to users and crawlers. No extra keyword text or crawler-specific view is served. Race setup and chooser markup are prerendered; JavaScript opens their existing dialogs and initializes WebGL. Arbitrary replay states and historical network inspectors remain client-rendered because their simulation depends on the requested population and seed. Their parent chooser pages provide the indexable entry points.

The JSON-LD graph contains `WebSite` (name and alternate name), `WebApplication`, author `Person`, and the current `WebPage`. It references Jeremy Huang's actual homepage and the verified GitHub repository, and describes the project as an independent, unofficial educational experiment. It contains no invented ratings, reviews, awards, FAQs, or affiliation claims. Syntactic parsing and graph consistency are checked automatically; no eligibility for a special search result is claimed.

## Redirect contract

| Request | Expected result |
| --- | --- |
| HTTPS apex | 200 for canonical pages |
| HTTPS www | 308 to the identical apex path/query |
| HTTP | Vercel HTTPS redirect; a noncanonical HTTP hostname can require the HTTPS host hop |
| crossy-road-ai.vercel.app | 308 to the identical apex path/query |
| jeremyhua.ng/crossyroadai | 308 to the apex homepage |
| jeremyhua.ng/crossyroadai/play?variant=2&seed=318 | 308 to the identical standalone race state |
| Unknown page or unsupported lab/milestone path | 404 |

The default-host redirect matches that exact hostname, not preview hosts or localhost. Vercel's preview deployment protections/noindex behavior remain in place. Only the Crossy Road subpath is migrated from the personal site; `jeremyhua.ng/`, `/ranch`, and its project write-up remain independent.

## Performance measurements

Lighthouse is a synthetic lab measurement, not field Core Web Vitals or a ranking prediction. Baseline measurements used the working `www` deployment before changes, with standard Lighthouse simulated mobile throttling and the desktop preset in headless Chrome. A high Lighthouse SEO score did not detect the empty pre-JavaScript body or the apex certificate failure.

| Baseline | Performance | Accessibility | Best practices | SEO | LCP | CLS | Total blocking time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 97 | 100 | 100 | 100 | 2.0 s | 0 | 170 ms |
| Desktop | 100 | 100 | 100 | 100 | 0.4 s | 0.01 | 10 ms |

| Published site after changes | Performance | Accessibility | Best practices | SEO | LCP | CLS | Total blocking time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 100 | 100 | 100 | 100 | 1.4 s | 0 | 0 ms |
| Desktop | 100 | 100 | 100 | 100 | 0.4 s | 0 | 0 ms |

Mobile Speed Index changed from 1.5 to 1.0 seconds; desktop changed from 0.5 to 0.3 seconds. These are single lab runs on the same machine and presets, not guaranteed real-user performance. The mobile measurement used the published homepage from the first SEO deployment; its HTML was subsequently verified byte-for-byte identical to the corrected static-route release. The desktop measurement used the corrected release. The preliminary local mobile result was 98, illustrating normal environment/run variation. No real-user INP was measured; these Lighthouse runs provide lab data only. Total blocking time is a lab responsiveness indicator, not INP.

The Three.js scene chunk remains large and loads only on interactive game/replay routes. It is not part of homepage execution. Large authentic population archives stay on demand; the SEO release does not alter or regenerate them. Fonts and game rendering quality are unchanged.

## Validation and changed files

`npm test` passed 173 tests, including the existing simulation, replay, cohort, navigation, and race checks and three new SEO tests. Lint, type checking, production build, and `npm run check:seo` pass. The release checker reads actual generated HTML, checks metadata/schema/assets, verifies rendered content and the sitemap, and checks route configuration. It performs no training or evaluation episodes.

Browser QA exercised Variant 2 generation 150 on custom seed 0, all 150 selector options, replay play/pause/restart/jump/speed controls, race variant and seed selection, movement, and pause/resume. No console or hydration warnings/errors were observed in the tested pages. Deployed Variant 2 chooser metadata and selection were verified after correcting Vercel filesystem precedence. Both bloodline videos play in view and pause offscreen; homepage highlight playback remains the existing full Auto recording. Desktop 1280 × 720 and mobile 390 × 844 snapshots preserve all existing homepage text and every measured layout rectangle exactly; the approved notice extends the footer area. There is no horizontal overflow. Animated video frames naturally differ between screenshots.

Main project changes:

- `index.html`, `vite.config.ts`, `vercel.json`, `package.json`: metadata, rendering/build, routing and caching.
- `src/main.tsx`, `src/entry-server.tsx`: matching hydration and server rendering.
- `src/visualization/page-metadata.ts`, `site-bootstrap.ts`, `prerender-route.ts`: shared metadata, typed initial data and preview routing.
- `Homepage.tsx`, `ExperimentIcon.tsx`, `homepage.css`: initial content, safe media loading and approved notice.
- `Explorer.tsx`, `Play.tsx`, `Highlights.tsx`: server-safe initialization and consistent document metadata; existing controls/game logic retained.
- `scripts/data/build-site.ts`, `check-seo.ts`, `src/tests/seo.test.ts`: production generation and regression checks.
- `public/social-preview.jpg`, `public/favicon-96.png`: metadata-only image and matching favicon.
- `README.md`, `docs/README.md`, `docs/results/variant-1.md`, `docs/results/variant-2.md`, this report: current domain links and documentation.

Personal-site changes are confined to `vercel.json`, `robots.txt`, the project card's destination in `index.html`, `scripts/check-seo.py`, and `docs/search-discovery.md`. Other concurrent personal-site changes were preserved.

## Published verification

The implementation is published in [8a83e9e0](https://github.com/sandsowkd/crossy-road-ai/commit/8a83e9e0a6894d831f165e750682a816dbc7f90f) with the static-route correction in [aaa4d101](https://github.com/sandsowkd/crossy-road-ai/commit/aaa4d101). Both Vercel deployments completed successfully; the corrected [production deployment](https://vercel.com/jeremys-projects-f2bb3745/crossy-road-ai/CgR4dydJ5khwNaNmhdYxCWuq9q6N) was tested on the custom domain. The personal-site migration is published in [5aeb5ae](https://github.com/sandsowkd/jeremyhuang.dev/commit/5aeb5ae); its Vercel deployment and local/live SEO checks passed.

Live HTTP verification confirmed all four canonical pages return 200 with the correct raw-HTML metadata, one H1, and no accidental noindex response header. Robots and sitemap return 200 with `text/plain` and `application/xml` content types. The social image and PNG icon return 200. Replay states retain intentional noindex; invalid ordinary, lab, and milestone paths return 404. WWW, the default production alias, and old portfolio paths return 308 while preserving their meaningful query strings. Hashed browser assets return `public, max-age=31536000, immutable`. Googlebot and ordinary requests receive byte-identical homepage HTML. The unique Vercel deployment hostname redirects unauthenticated requests to Vercel sign-in; preview access/security settings were not weakened.

The corrected homepage's SHA-256 is `23d7f7fe8a68ac128866d1ae4f7c6e060530e89a14011347376a01c39a47f3cd`, matching the local rendered release exactly. The simulation/evolution source, saved policy, replay catalog, homepage media data, and population archives have no changes in this release. No training or reserved final-map assessment was run.

## Owner actions after deployment

No DNS change is required for the SEO release. Keep the existing Google site-verification TXT record at Namecheap. There is no Google Indexing API integration and no claim of verified indexing.

1. In [Google Search Console](https://search.google.com/search-console/), open the Domain property for `crossyroadai.com`. Finish verification using the TXT record already added if Google has not confirmed it yet; keep the record afterward.
2. In **Sitemaps**, submit `https://crossyroadai.com/sitemap.xml`.
3. Inspect each of the four canonical URLs above. Use **Test live URL**, check that crawling/indexing is allowed and the rendered content is present, then request indexing once for the canonical pages.
4. Inspect one old portfolio URL and confirm that Google observes its permanent redirect. Do not use Change of Address for the entire personal domain: only a project subpath moved.
5. After Google recrawls, compare the declared and Google-selected canonicals. Monitor Page indexing, Sitemaps, Crawl stats, Performance, and the Mobile/Core Web Vitals reports. Field reports may remain unavailable for a low-traffic site.
6. If a sharing service cached an older preview, request a rescrape in that service's official sharing debugger. Search snippets and favicons can also take time to refresh.

Vercel's apex Production attachment and www→apex 308 have been configured in the dashboard. The default production alias redirect is in this repository. No extra paid service, DNS edit, or manual portfolio change is required. Keep production public and previews protected or noindex; do not remove Google's verification record or disable security controls to make a crawl succeed.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [favicon requirements](https://developers.google.com/search/docs/appearance/favicon-in-search), [Vercel routing configuration](https://vercel.com/docs/project-configuration/vercel-json).
