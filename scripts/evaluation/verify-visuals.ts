import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  fs.readFileSync("docs/visual-source-manifest.json", "utf8"),
) as { commit: string; files: { path: string; sha256: string }[] };
for (const file of manifest.files) {
  const data = fs.readFileSync(path.join("public/upstream", file.path));
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== file.sha256)
    throw new Error(`Original asset changed: ${file.path}`);
}
console.log(
  `${manifest.files.length} original repository files verified byte-for-byte against commit ${manifest.commit}.`,
);
