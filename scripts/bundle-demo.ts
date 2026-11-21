import fs from "node:fs";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { stringifyEvolution } from "../src/evolution/serialization";
const input = process.argv[2] ?? "results";
const c = parseCheckpoint(fs.readFileSync(`${input}/checkpoint.json`, "utf8"));
const evaluation = JSON.parse(
  fs.readFileSync(`${input}/evaluation.json`, "utf8"),
);
fs.writeFileSync(
  "public/demo.json",
  stringifyEvolution({ config: c.config, history: c.history, evaluation }),
);
fs.writeFileSync("public/trained-checkpoint.json", stringifyEvolution(c));
console.log("Bundled genuinely evaluated history and resumable checkpoint.");
