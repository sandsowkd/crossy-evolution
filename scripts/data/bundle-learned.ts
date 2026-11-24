import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import {
  parseEvolution,
  stringifyEvolution,
} from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";

const input = process.argv[2] ?? ".archive/results/variant-1/learned";
const namespace = process.argv[3];
if (
  namespace !== undefined &&
  !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(namespace)
)
  throw new Error(
    "Archive namespace must be a lowercase alphanumeric/hyphen slug, 1–64 characters, starting and ending with an alphanumeric character",
  );
const archiveDirectory = path.join("public/training-cohorts", namespace ?? "");
const checkpoint = parseCheckpoint(
  fs.readFileSync(path.join(input, "checkpoint.json"), "utf8"),
);
const selectedModel = parseEvolution<{
  genome: Genome;
  generation: number;
  meanRow: number;
}>(fs.readFileSync(path.join(input, "selected.json"), "utf8"));
const evaluation = JSON.parse(
  fs.readFileSync(path.join(input, "evaluation.json"), "utf8"),
);
const provenanceFile = path.join(input, "provenance.json");
const provenance = fs.existsSync(provenanceFile)
  ? JSON.parse(fs.readFileSync(provenanceFile, "utf8"))
  : undefined;
fs.mkdirSync(archiveDirectory, { recursive: true });
for (const r of checkpoint.history) {
  if (!r.cohortFile)
    throw new Error(`Missing archive for generation ${r.generation}`);
  const file = path.basename(r.cohortFile);
  const data = fs.readFileSync(path.join(input, "generations", file));
  r.cohortHash = createHash("sha256").update(gunzipSync(data)).digest("hex");
  r.cohortFile = `/training-cohorts/${namespace ? `${namespace}/` : ""}${file}`;
  fs.writeFileSync(path.join(archiveDirectory, file), data);
}
// Publication metadata belongs to the exported copy; preserve source snapshots.
fs.writeFileSync(
  "public/trained-checkpoint.json",
  stringifyEvolution(checkpoint),
);
fs.writeFileSync(
  "public/demo.json",
  stringifyEvolution({
    config: checkpoint.config,
    history: checkpoint.history,
    selectedModel,
    evaluation,
    ...(provenance ? { provenance } : {}),
  }),
);
console.log(
  `Bundled ${checkpoint.generation} full populations; default model selected at generation ${selectedModel.generation} using separate validation maps.`,
);
