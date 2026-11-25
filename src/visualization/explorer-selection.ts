import type { ExplorerCatalog, ExplorerVariant, ReplayEntry, SequenceRecord } from "./explorer-data";
import type { VariantNumber } from "./replay-links";
import { homepageMilestones } from "./site-content";
export type Selection = { variant: VariantNumber; phase: string; generation: number; seed: number };
export function menuRecords(variant: ExplorerVariant): SequenceRecord[] {
  return variant.sequence ?? variant.phases[0].records.map(record => ({...record,
    config: variant.phases[0].config, sourceGeneration: record.generation, sourcePhase: variant.phases[0].id}));
}
export function defaultSelection(variant: VariantNumber, catalog?: ExplorerCatalog): Selection {
  const experiment = catalog?.variants.find(item => item.id === variant);
  const seed = homepageMilestones(variant)[0].previewSeed;
  return {variant, phase: experiment && !experiment.sequence ? experiment.phases[0].id : "sequence", generation: 1, seed};
}
export function resolveEntry(catalog: ExplorerCatalog, selection: Selection): ReplayEntry | undefined {
  const variant = catalog.variants.find(item => item.id === selection.variant);
  if (!variant) return;
  if (selection.phase === "sequence") {
    const record = variant.sequence?.find(item => item.generation === selection.generation);
    return record && {...record, title: `Variant ${variant.id} · Generation ${record.generation}`};
  }
  const phase = variant.phases.find(item => item.id === selection.phase);
  const record = phase?.records.find(item => item.generation === selection.generation);
  return record && phase && {...record, config: phase.config, title: `Variant ${variant.id} · Generation ${record.generation}`};
}
/** The common audited replay panel, not the native training-map streams. */
export function mapSeedOptions(record: Pick<SequenceRecord, "seeds">) {
  return [...new Set(record.seeds.filter(seed => seed !== 42))];
}

/** Keep Advanced Replay inside its recorded panel; old direct links still replay as saved. */
export function replayMenuSeed(record: Pick<SequenceRecord, "seeds">, preferred: number) {
  const seeds = mapSeedOptions(record);
  return seeds.includes(preferred) ? preferred : seeds[0];
}
