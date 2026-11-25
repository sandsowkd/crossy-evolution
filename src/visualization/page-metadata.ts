/** A single public origin keeps build-time HTML and browser navigation consistent. */
export const SITE_ORIGIN = "https://crossyroadai.com";
export const HOME_TITLE = "Crossy Road AI – Watch AI Learn to Play Crossy Road";
export const HOME_DESCRIPTION = "Watch AI learn to play Crossy Road using neural networks and genetic algorithms. Explore interactive simulations, evolutionary training, and race against the AI.";
export const INDEXABLE_PATHS = ["/", "/play", "/explore", "/explore?variant=2"] as const;
export type PageMetadata = { title: string; description: string; canonical: string; indexable: boolean };
const replayDescription = "Explore saved neural network populations in Crossy Road AI. Choose a generation and map seed, compare behavior, and watch neuroevolution in action.";
export function pageMetadata(url: URL): PageMetadata {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const state = ["generation", "seed", "phase", "replay", "highlights", "explore", "milestone"].some(key => url.searchParams.has(key));
  if (path === "/play") return { title: "Race Against the AI – Crossy Road AI", description: "Play a Crossy Road-inspired game against a saved neural network on the same map. Choose cars and roads or add trains and floating logs.", canonical: `${SITE_ORIGIN}/play`, indexable: true };
  if (path === "/explore") {
    const two = url.searchParams.get("variant") === "2";
    return {title: `Explore ${two ? "Variant 2 " : ""}Replays – Crossy Road AI`, description: two ? "Watch saved AI chickens navigate traffic, train crossings, and floating logs. Explore Variant 2 generations and replay any map seed." : replayDescription,
      canonical: `${SITE_ORIGIN}/explore${two ? "?variant=2" : ""}`, indexable: !state};
  }
  if (state || path !== "/" || url.searchParams.has("variant")) return { title: "Saved Replay and Neural Networks – Crossy Road AI", description: replayDescription, canonical: `${SITE_ORIGIN}/explore${url.searchParams.get("variant") === "2" ? "?variant=2" : ""}`, indexable: false };
  return {title: HOME_TITLE, description: HOME_DESCRIPTION, canonical: `${SITE_ORIGIN}/`, indexable: true};
}
export const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function structuredData(metadata: PageMetadata) {
  return {"@context": "https://schema.org", "@graph": [
    {"@type": "Person", "@id": `${SITE_ORIGIN}/#author`, name: "Jeremy Huang", url: "https://jeremyhua.ng/"},
    {"@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: "Crossy Road AI", alternateName: "CrossyRoadAI", url: `${SITE_ORIGIN}/`, author: {"@id": `${SITE_ORIGIN}/#author`}, description: "An independent, unofficial machine learning experiment exploring AI agents learning a Crossy Road-inspired game through neuroevolution."},
    {"@type": "WebApplication", "@id": `${SITE_ORIGIN}/#application`, name: "Crossy Road AI", url: `${SITE_ORIGIN}/`, applicationCategory: "EducationalApplication", operatingSystem: "Web browser", browserRequirements: "JavaScript and WebGL", author: {"@id": `${SITE_ORIGIN}/#author`}, description: "An independent educational experiment with interactive neural network replays and a race against a saved AI. Not affiliated with Hipster Whale.", sameAs: "https://github.com/sandsowkd/crossy-road-ai", isPartOf: {"@id": `${SITE_ORIGIN}/#website`}},
    {"@type": "WebPage", "@id": metadata.canonical, url: metadata.canonical, name: metadata.title, description: metadata.description, isPartOf: {"@id": `${SITE_ORIGIN}/#website`}, about: {"@id": `${SITE_ORIGIN}/#application`}},
  ]};
}
export const safeJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
export function metadataHtml(metadata: PageMetadata) {
  const social = metadata.canonical === `${SITE_ORIGIN}/` ? "Watch neural networks evolve through generations of Crossy Road gameplay. Explore the simulations and see if you can beat the AI." : metadata.description;
  const tags = {"description": metadata.description, "robots": metadata.indexable ? "index, follow, max-image-preview:large" : "noindex, follow", "twitter:card": "summary_large_image", "twitter:title": metadata.title, "twitter:description": metadata.canonical === `${SITE_ORIGIN}/` ? "Watch AI learn to play Crossy Road through neuroevolution." : metadata.description, "twitter:image": `${SITE_ORIGIN}/social-preview.jpg`, "twitter:image:alt": "Crossy Road AI: saved chickens crossing roads, trains, and floating logs"};
  const og = {"og:type": "website", "og:site_name": "Crossy Road AI", "og:title": metadata.title, "og:description": social, "og:url": metadata.canonical, "og:image": `${SITE_ORIGIN}/social-preview.jpg`, "og:image:width": "1200", "og:image:height": "630", "og:image:type": "image/jpeg", "og:image:alt": tags["twitter:image:alt"], "og:locale": "en_US"};
  return `<title>${escapeHtml(metadata.title)}</title>\n<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />\n${Object.entries(tags).map(([name, value])=>`<meta name="${name}" content="${escapeHtml(value)}" />`).join("\n")}\n${Object.entries(og).map(([property, value])=>`<meta property="${property}" content="${escapeHtml(value)}" />`).join("\n")}\n<script type="application/ld+json" id="site-structured-data">${safeJson(structuredData(metadata))}</script>`;
}
export function applyPageMetadata(url = new URL(window.location.href)) {
  const metadata = pageMetadata(url);
  document.title = metadata.title;
  const template = document.createElement("template");
  template.innerHTML = metadataHtml(metadata);
  for (const element of template.content.children) {
    const selector = element.tagName === "TITLE" ? "title" : element.tagName === "LINK" ? 'link[rel="canonical"]' : element.tagName === "SCRIPT" ? "#site-structured-data" : element.hasAttribute("name") ? `meta[name="${element.getAttribute("name")}"]` : `meta[property="${element.getAttribute("property")}"]`;
    const current = document.head.querySelector(selector);
    if (current) current.replaceWith(element.cloneNode(true)); else document.head.append(element.cloneNode(true));
  }
}
