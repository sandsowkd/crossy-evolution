/** Rebuild an interrupted long-run summary from its completed generation
 * boundary and lossless archives. Model selection is repeated on validation
 * maps only, and must reproduce the saved model exactly. */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { evaluateGenome, mean } from "../src/evolution/evaluation";
import { VALIDATION_SEEDS } from "../src/evolution/suites";
const output = process.argv[2] ?? "results/learned";
const c = parseCheckpoint(
  fs.readFileSync(path.join(output, "checkpoint.json"), "utf8"),
);
const saved = parseEvolution<{
  genome: Genome;
  generation: number;
  criterion: number;
  episodes: ReturnType<typeof evaluateGenome>;
}>(fs.readFileSync(path.join(output, "selected.json"), "utf8"));
const validation: {
  generation: number;
  genome: number;
  criterion: number;
  meanRow: number;
}[] = [];
let selected: typeof saved | undefined;
for (const r of c.history.filter(
  (r) =>
    r.generation === 1 ||
    r.generation % 10 === 0 ||
    r.generation === c.generation,
)) {
  const population = parseEvolution<{ contenders: Genome[] }>(
    gunzipSync(
      fs.readFileSync(
        path.join(output, "generations", path.basename(r.cohortFile!)),
      ),
    ).toString("utf8"),
  );
  for (const genome of population.contenders.slice(0, 3)) {
    const episodes = evaluateGenome(
        genome,
        VALIDATION_SEEDS,
        c.config.simulation,
      ),
      rows = episodes.map((e) => e.score).sort((a, b) => a - b);
    const meanRow = mean(rows),
      criterion = 0.5 * meanRow + 0.5 * mean(rows.slice(0, rows.length / 2));
    validation.push({
      generation: r.generation,
      genome: genome.id,
      meanRow,
      criterion,
    });
    if (!selected || criterion > selected.criterion)
      selected = { genome, generation: r.generation, criterion, episodes };
  }
}
assert.equal(selected!.generation, saved.generation);
assert.equal(selected!.genome.id, saved.genome.id);
assert.deepEqual(selected!.episodes, saved.episodes);
const result = {
  config: c.config,
  generations: c.generation,
  requestedCap: Number(process.argv[4] ?? c.generation),
  stopReason: `Finalized the completed generation-${c.generation} checkpoint; model selection used validation maps only.`,
  ...(process.argv[3] ? {seconds:Number(process.argv[3])} : {}),
  trainingEpisodes: c.generation * c.config.population * c.config.trainingSeeds,
  monitorEpisodes: c.generation * 16,
  validationEpisodes: validation.length * 64,
  validationLedgerReconstructedAndVerified: true,
  validation,
  history: c.history.map(({ champion: _c, contenders: _p, ...r }) => r),
};
fs.writeFileSync(
  path.join(output, "training-summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  `Reconstructed ${validation.length * 64} validation episodes and verified selected model #${saved.genome.id} from generation ${saved.generation}.`,
);
