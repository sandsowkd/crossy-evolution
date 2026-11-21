import { ACTIONS } from "../core/types";
import { INPUT_COUNT } from "../core/observation";
import { BIAS, OUTPUT_START, type Genome } from "./genome";
export class Network {
  readonly observationVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Constant channel mask for the compiled graph, including hidden-node inputs. */
  readonly requiredInputs = new Uint8Array(INPUT_COUNT);
  private operations: {
    id: number;
    hidden: boolean;
    edges: { from: number; weight: number }[];
  }[];
  readonly values: Float32Array;
  readonly scores = new Float32Array(5);
  constructor(g: Genome) {
    this.observationVersion = g.observationVersion ?? 1;
    this.values = new Float32Array(Math.max(...g.nodes.map((n) => n.id)) + 1);
    const edges = new Map<number, { from: number; weight: number }[]>();
    for (const c of g.connections)
      if (c.enabled) {
        if (c.from < INPUT_COUNT) this.requiredInputs[c.from] = 1;
        const list = edges.get(c.to) ?? [];
        list.push({ from: c.from, weight: c.weight });
        edges.set(c.to, list);
      }
    this.operations = g.nodes
      .filter((n) => n.depth > 0)
      .sort((a, b) => a.depth - b.depth || a.id - b.id)
      .map((n) => ({
        id: n.id,
        hidden: n.kind === "hidden",
        edges: edges.get(n.id) ?? [],
      }));
  }
  activate(observation: Float32Array) {
    this.values.set(observation.subarray(0, INPUT_COUNT));
    this.values[BIAS] = 1;
    for (const op of this.operations) {
      let sum = 0;
      for (const c of op.edges) sum += this.values[c.from] * c.weight;
      this.values[op.id] = op.hidden ? Math.tanh(sum) : sum;
    }
    for (let i = 0; i < 5; i++) this.scores[i] = this.values[OUTPUT_START + i];
    return this.scores;
  }
  decide(observation: Float32Array) {
    const s = this.activate(observation);
    let best = 0;
    for (let i = 1; i < 5; i++) if (s[i] > s[best]) best = i;
    return ACTIONS[best];
  }
}
