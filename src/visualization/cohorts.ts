import { isCohortArchivePath } from "../evolution/archive-path";
import { sitePath } from "./site-path";
import { type Generation } from "../evolution/trainer";
import { type Genome } from "../evolution/genome";
import { parseEvolution } from "../evolution/serialization";
import { validGenome } from "../evolution/checkpoint";

// A small cache keeps long training histories from loading hundreds of
// populations into browser memory. All original genomes remain on disk.
const cache = new Map<string, Promise<Genome[]>>();
export async function loadCohort<T extends Pick<Generation,
  "generation" | "contenders" | "populationSize" | "cohortFile" | "cohortHash"
>>(record: T): Promise<T> {
  const file = record.cohortFile;
  if (!file || record.contenders.length === record.populationSize)
    return record;
  if (!isCohortArchivePath(file))
    throw new Error("Invalid population archive path");
  const key = `${file}:${record.cohortHash ?? "unhashed"}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(sitePath(file));
      if (!response.ok || !response.body)
        throw new Error(
          `Population archive unavailable: generation ${record.generation}`,
        );
      const text =
        response.headers.get("content-encoding") === "gzip"
          ? await response.text()
          : await new Response(
              response.body.pipeThrough(new DecompressionStream("gzip")),
            ).text();
      if (record.cohortHash) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text),
        );
        const hash = [...new Uint8Array(digest)]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== record.cohortHash)
          throw new Error(
            "Population archive belongs to a different run or is damaged",
          );
      }
      const data = parseEvolution<{ contenders: Genome[] }>(text);
      if (
        !Array.isArray(data.contenders) ||
        data.contenders.length !== record.populationSize ||
        !data.contenders.every(validGenome) ||
        new Set(data.contenders.map((g) => g.id)).size !==
          data.contenders.length
      )
        throw new Error("Invalid population archive");
      return data.contenders;
    })();
    cache.set(key, pending);
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
    void pending.catch(() => cache.delete(key));
  }
  return { ...record, contenders: await pending };
}
