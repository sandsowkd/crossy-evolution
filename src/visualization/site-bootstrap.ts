import type { HomepageData } from "./homepage-data";
import type { ExplorerCatalog } from "./explorer-data";
export type SiteBootstrap = { page: "home" | "play" | "explorer"; variant: 1 | 2; url: string; homepage?: HomepageData; catalog?: ExplorerCatalog };
export function readBootstrap(): SiteBootstrap | undefined {
  const script = document.getElementById("site-bootstrap");
  if (!script?.textContent) return;
  try { return JSON.parse(script.textContent) as SiteBootstrap; } catch { return; }
}
