import { BASE_NODES, BIAS, OUTPUT_START, type NodeGene } from "./genome";

// Every genome has the same 658 input nodes, bias and five outputs. Store
// those once by convention; retain every hidden node and connection exactly.
const baseNodes: NodeGene[] = Array.from({ length: BASE_NODES }, (_, id) => ({
  id,
  kind: id < BIAS ? "input" : id < OUTPUT_START ? "bias" : "output",
  depth: id < OUTPUT_START ? 0 : 1,
}));
export function stringifyEvolution(data: object): string {
  return JSON.stringify(
    { ...data, genomeEncoding: "implicit-base-v1" },
    (key, value) =>
      key === "nodes" && Array.isArray(value)
        ? value.filter((n: NodeGene) => n.id >= BASE_NODES)
        : value,
  );
}
export function parseEvolution<T>(text: string): T {
  const data = JSON.parse(text);
  if (data.genomeEncoding === "implicit-base-v1") {
    const restore = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "nodes" && Array.isArray(entry)) {
          (value as { nodes: NodeGene[] }).nodes = [
            ...baseNodes.map((n) => ({ ...n })),
            ...entry,
          ];
        } else restore(entry);
      }
    };
    restore(data);
    delete data.genomeEncoding;
  } else if (data.genomeEncoding !== undefined) {
    throw new Error("Unsupported genome encoding");
  }
  return data as T;
}
