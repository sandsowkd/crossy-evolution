import fs from "node:fs";
import path from "node:path";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { Network } from "../../src/evolution/network";
import {
  episode,
  evaluateGenome,
  type Trace,
} from "../../src/evolution/evaluation";
const file = process.argv[2] ?? "results/checkpoint.json";
const c = parseCheckpoint(fs.readFileSync(file, "utf8")),
  r = c.history.at(-1)!;
const trace: Trace[] = [],
  network = new Network(r.champion),
  seeds = r.seeds;
const replay = episode(
  (o) => network.decide(o),
  seeds[0],
  c.config.simulation,
  trace,
  network,
);
const result = {
  generation: r.generation,
  seeds,
  genomes: r.contenders.slice(0, 5).map((g) => ({
    id: g.id,
    species: g.species,
    episodes: evaluateGenome(g, seeds, c.config.simulation),
  })),
  replay,
  trace,
};
fs.writeFileSync(
  path.join(path.dirname(file), "integration-demo.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  `Evaluated ${result.genomes.length} genomes; exported ${trace.length} real decisions beside ${file}`,
);
