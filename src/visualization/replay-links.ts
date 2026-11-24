import { MILESTONES, HOMEPAGE_MILESTONES, VARIANT_TWO_MILESTONES } from "./site-content";
import { sitePath, SITE_BASE } from "./site-path";

const replayMilestones = [...MILESTONES, ...HOMEPAGE_MILESTONES,
  { id: "binary-road-progress", generation: 50 }];
export type VariantNumber = 1 | 2;
export function parseMapSeed(value: string | null | undefined, fallback = 42) {
  if (value === null || value === undefined || !/^\d+$/.test(value)) return fallback;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : fallback;
}
export function milestonePhase(id: string) {
  if (id === "initial-population" || id === "early-five-generations") return "prototype";
  if (id === "binary-road-learner" || id === "binary-road-progress") return "binary";
  if (id === "two-hop-lookahead" || id === "lookahead-progress") return "lookahead";
  return id === "lookahead-memory" ? "memory-audit" : "memory";
}
export function replayUrl(generation: number, seed: number, variant: VariantNumber = 1, phase = "sequence") {
  const params = new URLSearchParams({ generation: String(generation), seed: String(parseMapSeed(String(seed))), variant: String(variant) });
  if (phase !== "sequence") params.set("phase", phase);
  return `${sitePath()}?${params}`;
}
export function milestoneUrl(id: string, seed?: number) {
  const two=VARIANT_TWO_MILESTONES.find(item=>item.id===id);
  if(two) return replayUrl(two.generation,seed ?? two.previewSeed,2);
  const chapter = HOMEPAGE_MILESTONES.find(item => item.id === id);
  if (chapter) return replayUrl(chapter.generation, seed ?? chapter.previewSeed);
  const milestone = replayMilestones.find(item => item.id === id) ?? MILESTONES[0];
  return replayUrl(milestone.generation, seed ?? 27099291, 1, milestonePhase(milestone.id));
}
export function explorerUrl(generation?: number, seed?: number, variant: VariantNumber = 1) {
  return generation !== undefined ? replayUrl(generation, seed ?? 27099291, variant) : sitePath(`/explore?variant=${variant}`);
}
/** Keep the original development UI and network inspector available. */
export function labUrl(generation?: number, seed?: number) {
  const params = new URLSearchParams();
  if (generation !== undefined) params.set("generation", String(generation));
  if (seed !== undefined) params.set("seed", String(seed));
  return sitePath(`/lab/variant-1${params.size ? `?${params}` : ""}`);
}
export function siteRoute(url: URL, base = SITE_BASE) {
  const root = sitePath("/", base);
  const pathname = url.pathname === root.slice(0,-1) ? "/" : url.pathname.startsWith(root) ? `/${url.pathname.slice(root.length)}` : url.pathname;
  if (/^\/play\/?$/.test(pathname)) return {page: "play"} as const;
  const variant: VariantNumber = url.searchParams.get("variant") === "2" ? 2 : 1;
  const queryGeneration = url.searchParams.get("generation");
  if ((pathname === "/" || /^\/replay\/?$/.test(pathname)) && /^[1-9]\d*$/.test(queryGeneration ?? "") && Number.isSafeInteger(Number(queryGeneration)))
    return {page: "explorer", variant, generation: Number(queryGeneration), seed: parseMapSeed(url.searchParams.get("seed")),
      phase: url.searchParams.get("phase") ?? "sequence"} as const;
  const generation = /^\/generation\/([1-9]\d*)\/seed\/(\d+)\/?$/.exec(pathname);
  if (generation) return { page: "explorer", variant, generation: Number(generation[1]),
    seed: parseMapSeed(generation[2]), phase: url.searchParams.get("phase") ?? "sequence" } as const;
  if (/^\/explore\/?$/.test(pathname)) return { page: "explorer", variant } as const;
  // Old links still open the original development visualizers.
  if (url.searchParams.get("variant") === "2") return { page: "variant-two" } as const;
  const match = /^\/replay\/variant-1\/([^/]+)\/?$/.exec(pathname);
  if (match || url.searchParams.has("highlights")) {
    const requested = match?.[1] ?? url.searchParams.get("milestone");
    const milestone = replayMilestones.find(item => item.id === requested) ?? MILESTONES[0];
    return { page: "highlight", milestone: milestone.id, seed: parseMapSeed(url.searchParams.get("seed")) } as const;
  }
  if (pathname.startsWith("/lab") || pathname.startsWith("/explore/") || url.searchParams.has("explore") || url.searchParams.get("variant") === "1")
    return { page: "lab" } as const;
  return { page: "home" } as const;
}
