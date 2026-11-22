import { GameSimulation } from "../core/simulation";
import { HOP_TICKS, type AgentState, type Config } from "../core/types";
import { hazardsAt, signalAt } from "../core/world";
import { platformsAt } from "../core/upstream";
import { type Genome } from "./genome";
import { Network } from "./network";
import { sensorCount } from "../core/sensor-version";
export type ReplayOptions = { sparseObservations?: boolean; terrainBehind?: number; terrainAhead?: number };
export class Replay {
  agents: {
    genome: Genome;
    network: Network;
    sim: GameSimulation;
    previous: AgentState;
    ticks: number;
    observationBuffer?: Float32Array;
  }[];
  decisions = 0;
  selected = 0;
  constructor(
    genomes: Genome[],
    public seed: number,
    public config: Config,
    public options: ReplayOptions = {},
  ) {
    this.agents = genomes.map((genome) => {
      const sim = new GameSimulation(config, seed);
      const network = new Network(genome);
      return {
        genome,
        network,
        sim,
        previous: { ...sim.agent },
        ticks: 0,
        observationBuffer: options.sparseObservations ? new Float32Array(sensorCount(network.observationVersion)) : undefined,
      };
    });
  }
  advance(manual?: import("../core/types").Action) {
    for (const a of this.agents) {
      a.previous = { ...a.sim.agent };
      a.ticks = a.sim.tick;
      if (a.sim.agent.alive)
        a.sim.step(
          manual ??
            a.network.decide(
              a.sim.getObservation(a.network.observationVersion,
                this.options.sparseObservations ? a.network.requiredInputs : undefined, a.observationBuffer),
            ),
          false,
        );
    }
    this.decisions++;
  }
  seek(decision: number) {
    const genomes = this.agents.map((a) => a.genome);
    this.agents = new Replay(genomes, this.seed, this.config, this.options).agents;
    this.decisions = 0;
    for (let i = 0; i < decision; i++) this.advance();
  }
  get current() {
    return this.agents[this.selected] ?? this.agents[0];
  }
  get finished() {
    return this.agents.every((a) => !a.sim.agent.alive);
  }
  snapshot(alpha = 1, terminalSeconds = 0, allAgents = false) {
    const tick = Math.max(0, this.decisions - 1 + alpha) * HOP_TICKS,
      focus = this.current.sim.agent.row,
      rows = [];
    for (
      let r = Math.max(0, Math.floor(focus) - (this.options.terrainBehind ?? 6));
      r <= Math.floor(focus) + (this.options.terrainAhead ?? 15);
      r++
    )
      rows.push(this.current.sim.world.row(r));
    return {
      tick,
      focus,
      rows,
      hazards: rows.flatMap((r) => hazardsAt(r, tick)),
      signals: rows.filter((r) => signalAt(r, tick)).map((r) => r.index),
      ...(this.config.mechanics === "upstream-v2" ? { supports: rows.flatMap(r => platformsAt(r, tick)) } : {}),
      agents: this.agents
        .map((a, id) => {
          const duration = (a.sim.tick - a.ticks) / HOP_TICKS,
            progress = duration > 0 ? Math.min(1, alpha / duration) : 1,
            from = a.previous,
            to = a.sim.agent,
            moved = to.x !== from.x || to.row !== from.row;
          return {
            id,
            x: from.x + (to.x - from.x) * progress,
            row: from.row + (to.row - from.row) * progress,
            alive: to.alive || (from.alive && alpha < duration),
            hop: moved ? progress : 0,
            ...(this.config.mechanics === "upstream-v2" ? {visualY: to.visualY, deathReason: to.deathReason} : {}),
            ...(a.sim.eagleState ? { eagle: {
              ...a.sim.eagleState,
              captureTicks: a.sim.eagleState.captured ? Math.max(0, tick - a.sim.tick) + terminalSeconds * 60 : 0,
            }} : {}),
            color:
              id === 0
                ? "#fffbea"
                : ["#b3d8ea", "#f1c1a1", "#d4c5f3", "#e1e9a6"][id % 4],
          };
        })
        .filter((a) => allAgents || a.row >= Math.floor(focus) - 6),
    };
  }
}
