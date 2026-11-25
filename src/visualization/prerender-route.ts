/** Shared with the local preview; Vercel's equivalent rules are in vercel.json. */
export function prerenderFile(url: URL) {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") {
    if (["generation", "highlights", "replay"].some(key=>url.searchParams.has(key))) return "/_pages/replay.html";
    if (["variant", "explore"].some(key=>url.searchParams.has(key))) return "/_pages/inspector.html";
    return "/_pages/home.html";
  }
  if (path === "/play") return url.searchParams.has("seed") || url.searchParams.has("variant") ? "/_pages/play-state.html" : "/_pages/play.html";
  if (path === "/explore") return url.searchParams.get("variant") === "2" ? "/_pages/explore-2.html" : "/_pages/explore-1.html";
  if (/^\/generation\/\d+\/seed\/\d+$/.test(path) || path === "/replay" || /^\/replay\/variant-1\/(initial-population|early-five-generations|binary-road-learner|binary-road-progress|two-hop-lookahead|lookahead-progress|lookahead-memory|variant-1-final)$/.test(path)) return "/_pages/replay.html";
  if (path === "/lab/variant-1" || path === "/explore/variant-1") return "/_pages/inspector.html";
}
