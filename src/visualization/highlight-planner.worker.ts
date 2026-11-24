import type { Genome } from "../evolution/genome";
import type { Config } from "../core/types";
import { prepareHighlightMap } from "./highlight-map";

/** New maps need their own complete timeline; this never runs on the UI thread. */
self.onmessage = ({ data }: MessageEvent<{ genomes: Genome[]; seed: number; config: Config }>) => {
  try {
    self.postMessage(prepareHighlightMap(data.genomes, data.seed, data.config));
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
