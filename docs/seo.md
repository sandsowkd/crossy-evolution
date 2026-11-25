# Technical SEO and deployment

The canonical site is **https://crossyroadai.com/**. This report covers the technical SEO release of November 24–25, 2026. Existing page wording, layout, colors, navigation, recorded gameplay, controls, and saved populations are preserved. The only visible addition is the separately approved affiliation notice at the bottom of the homepage; it also appears in the README credits.

## Audit and changes

Before this release, the apex domain had Vercel DNS but was absent from the project's domain configuration, causing a hostname/certificate error. The working `www` and default Vercel origins served an empty React root in their initial HTML. There was no robots.txt, sitemap, or structured data. Play and replay chooser routes inherited `noindex, nofollow, noarchive` response headers. Their HTML metadata reused the homepage metadata. An invalid `/lab/...` path returned a successful application shell. The portfolio root redirected to `www`, but project subpaths still served its older embedded copy.

Implemented changes:

- Added the existing apex domain to the Vercel project, connected it to Production, and changed `www` to a permanent 308 redirect to the apex. No DNS or Google verification record was edited.
- Added build-time rendering of the existing React homepage, race setup, and both replay selectors. The same components and data hydrate in the browser. Build-manifest CSS and image URLs prevent unstyled content and broken source-image references. Bootstrap JSON is escaped and includes only data needed by its view.
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

Production measurements after publication are recorded below once the deployed revision is verified. The preliminary local mobile measurement was 98 performance, 100 accessibility/best-practices/SEO, LCP 2.5 s, CLS 0, and 0 ms blocking. Local and remote measurements are not interchangeable; individual runs vary. No real-user INP or CrUX data was available in this audit. Total blocking time is reported as a lab responsiveness indicator, not as INP.

The Three.js scene chunk remains large and loads only on interactive game/replay routes. It is not part of homepage execution. Large authentic population archives stay on demand; the SEO release does not alter or regenerate them. Fonts and game rendering quality are unchanged.

## Validation and changed files

`npm test` passed 173 tests, including the existing simulation, replay, cohort, navigation, and race checks and three new SEO tests. Lint, type checking, production build, and `npm run check:seo` pass. The release checker reads actual generated HTML, checks metadata/schema/assets, verifies rendered content and the sitemap, and checks route configuration. It performs no training or evaluation episodes.

Browser QA exercised Variant 2 generation 150 on custom seed 0, all 150 selector options, replay play/pause/restart/jump/speed controls, race variant and seed selection, movement, and pause/resume. Browser console and hydration checks are part of release verification. Desktop 1280 × 720 and mobile 390 × 844 snapshots preserve all existing homepage text and every measured layout rectangle exactly; the approved notice extends the footer area. There is no horizontal overflow. Animated video frames naturally differ between screenshots.

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
