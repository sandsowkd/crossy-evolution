/** Fetch pinned reference assets locally; do not redistribute third-party artwork. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const manifest = JSON.parse(await fs.readFile("docs/visual-source-manifest.json", "utf8")) as {
  commit: string; files: {path: string; sha256: string}[];
};
const destination = process.argv[2] ?? "public/upstream";
let fetched = 0;
for (const file of manifest.files) {
  if (path.isAbsolute(file.path) || file.path.split("/").includes("..")) throw new Error("Invalid asset path");
  const target = path.join(destination, file.path);
  const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  try { if (digest(await fs.readFile(target)) === file.sha256) continue; } catch { /* Fetch missing files. */ }
  const upstream = file.path === "LICENSE.txt" ? "LICENSE" : `assets/${file.path}`;
  const response = await fetch(`https://raw.githubusercontent.com/EvanBacon/Expo-Crossy-Road/${manifest.commit}/${upstream}`);
  if (!response.ok) throw new Error(`Asset fetch failed (${response.status}): ${file.path}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (digest(data) !== file.sha256) throw new Error(`Asset hash mismatch: ${file.path}`);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, data);
  fetched++;
}
console.log(`Verified ${manifest.files.length} pinned upstream files; fetched ${fetched}. Local use only; see docs/ATTRIBUTION.md.`);
