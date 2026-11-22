import type { Replay } from "../evolution/replay";
import type { SceneAgent, SceneSnapshot } from "./three/scene";

export const SINGLE_CHICKEN_OPACITY = 0.20;
export type DensityGroup = SceneAgent & { populationCount: number; memberIds: number[] };

/** Keep a living target through close density changes; rate-limit voluntary cuts. */
export class PopulationCamera {
  private followedId?: number;
  private switchTimes: number[] = [];
  private lastDecision = -1;

  follow(groups: DensityGroup[], decision: number, now: number) {
    if (decision < this.lastDecision) {
      this.followedId = undefined;
      this.switchTimes = [];
    }
    // Decide on completed hops, never on the render rate or an interpolated split.
    if (decision === this.lastDecision) return this.followedId;
    this.lastDecision = decision;
    this.switchTimes = this.switchTimes.filter(time => now - time < 5000);
    const leader = groups.reduce<DensityGroup | undefined>((best, group) =>
      !best || group.populationCount > best.populationCount ||
        (group.populationCount === best.populationCount && group.row > best.row)
        ? group : best, undefined);
    if (!leader) return this.followedId;
    const current = groups.find(group => this.followedId !== undefined && group.memberIds.includes(this.followedId));
    if (current) {
      // Hold ties and one-chicken deficits. A switch needs a lead of at least two.
      if (current.populationCount >= leader.populationCount - 1 || this.switchTimes.length >= 2)
        return this.followedId;
      this.switchTimes.push(now);
    }
    // Initial selection and replacing a dead target bypass the cap, without
    // spending or clearing the budget for voluntary switches.
    this.followedId = leader.id;
    return this.followedId;
  }
}

const cameras = new WeakMap<Replay, { agents: Replay["agents"]; camera: PopulationCamera }>();

/** Collapse coincident living agents before drawing, so alpha never stacks. */
export function populationDensity(agents: SceneAgent[]) {
  const positions = new Map<string, DensityGroup>();
  for (const agent of agents) {
    if (!agent.alive) continue;
    const height = (agent.visualY ?? 0) + Math.sin((agent.hop ?? 0) * Math.PI) * 0.5;
    // Retain sub-tile movement: separating hops become separate glyphs immediately.
    const key = [agent.x, agent.row, height].map(n => Math.round(n * 1e6)).join(":");
    const existing = positions.get(key);
    if (existing) { existing.populationCount++; existing.memberIds.push(agent.id); }
    else positions.set(key, { ...agent, populationCount: 1, memberIds: [agent.id] });
  }
  const groups = [...positions.values()];
  const largest = Math.max(0, ...groups.map(group => group.populationCount));
  for (const group of groups) {
    // Highlights report eagle deaths in the HUD; they never animate an eagle.
    delete group.eagle;
    group.color = "#ffffff";
    group.opacity = largest <= 1 ? 1 : SINGLE_CHICKEN_OPACITY +
      (1 - SINGLE_CHICKEN_OPACITY) * (group.populationCount - 1) / (largest - 1);
  }
  return { groups, largest, alive: groups.reduce((sum, group) => sum + group.populationCount, 0) };
}

/** All networks are simulated; the camera holds its target through close races. */
export function populationFrame(replay: Replay, alpha = 1, now = performance.now()): SceneSnapshot & {
  population: { alive: number; total: number; largest: number; groups: number; eagleDeaths: number };
} {
  let snapshot = replay.snapshot(alpha, 0, true);
  const density = populationDensity(snapshot.agents);
  let state = cameras.get(replay);
  if (!state || state.agents !== replay.agents) {
    state = { agents: replay.agents, camera: new PopulationCamera() };
    cameras.set(replay, state);
  }
  const settled = alpha === 1 ? density : populationDensity(replay.snapshot(1, 0, true).agents);
  const followedId = state.camera.follow(settled.groups, replay.decisions, now);
  if (followedId !== undefined && followedId !== replay.selected) {
    replay.selected = followedId;
    snapshot = replay.snapshot(alpha, 0, true);
  }
  // Follow the actual member, even when another member represents its glyph.
  const followed = snapshot.agents.find(agent => agent.id === followedId);
  return { ...snapshot, agents: density.groups,
    focus: followed?.row ?? snapshot.focus, focusX: followed?.x,
    population: { alive: density.alive, total: replay.agents.length,
      largest: density.largest, groups: density.groups.length,
      eagleDeaths: replay.agents.filter(agent => agent.sim.agent.deathReason === "eagle").length } };
}
