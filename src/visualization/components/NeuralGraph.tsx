import { ACTIONS } from "../../core/types";
import { inputLabel } from "../../core/observation";
import { BIAS, OUTPUT_START, type Genome } from "../../evolution/genome";
export function NeuralGraph({
  genome,
  values,
  action,
}: {
  genome: Genome;
  values: Float32Array;
  action: string;
}) {
  const used = new Set(genome.connections.flatMap((c) => [c.from, c.to]));
  const nodes = genome.nodes.filter(
    (n) => used.has(n.id) || n.kind === "output",
  );
  const groups = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const list = groups.get(n.depth) ?? [];
    list.push(n);
    groups.set(n.depth, list);
  }
  const positions = new Map<number, { x: number; y: number }>();
  for (const [depth, list] of groups) {
    list.sort((a, b) => a.id - b.id);
    list.forEach((n, i) =>
      positions.set(n.id, {
        x: 25 + depth * 260,
        y: 20 + ((i + 0.5) * 238) / list.length,
      }),
    );
  }
  return (
    <>
      <svg
        className="neural-svg"
        viewBox="0 0 352 282"
        role="img"
        aria-label="Actual selected genome topology and activations"
      >
        {genome.connections.map((c) => {
          const a = positions.get(c.from),
            b = positions.get(c.to);
          if (!a || !b) return null;
          const strength = Math.min(1, Math.abs(values[c.from] ?? 0));
          return (
            <path
              key={c.innovation}
              d={`M${a.x},${a.y} C${a.x + 65},${a.y} ${b.x - 65},${b.y} ${b.x},${b.y}`}
              fill="none"
              stroke={
                c.enabled ? (c.weight >= 0 ? "#88c7a0" : "#d0957f") : "#52615a"
              }
              strokeWidth={Math.min(2.8, 0.35 + Math.abs(c.weight) * 0.65)}
              opacity={c.enabled ? 0.1 + strength * 0.55 : 0.14}
              strokeDasharray={c.enabled ? undefined : "2 3"}
            >
              <title>{`${c.from} → ${c.to} · weight ${c.weight.toFixed(4)} · innovation ${c.innovation} · ${c.enabled ? "enabled" : "disabled"}`}</title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const p = positions.get(n.id)!,
            v = values[n.id] ?? 0,
            output = n.kind === "output",
            chosen = output && ACTIONS[n.id - OUTPUT_START] === action,
            label = output
              ? ACTIONS[n.id - OUTPUT_START]
              : n.id === BIAS
                ? "bias"
                : n.kind === "input"
                  ? inputLabel(n.id, genome.observationVersion)
                  : `hidden ${n.id}`;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={output ? 9 : n.kind === "hidden" ? 6 : 2.1}
                fill={chosen ? "#e2ed9e" : v >= 0 ? "#8ac4a7" : "#d49584"}
                fillOpacity={
                  chosen ? 1 : 0.25 + Math.min(1, Math.abs(v)) * 0.75
                }
                stroke={chosen ? "#f2f5d7" : "#243c32"}
                strokeWidth={chosen ? 3 : 1}
              >
                <title>{`${label} · activation ${v.toFixed(5)} · node ${n.id}`}</title>
              </circle>
              {output && (
                <text
                  x={p.x + 16}
                  y={p.y + 4}
                  fill={chosen ? "#e2ed9e" : "#8d9e94"}
                  fontSize="14"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
        <text x="16" y="278" fill="#7c9084" fontSize="10">
          INPUTS
        </text>
        <text x="131" y="278" fill="#7c9084" fontSize="10">
          HIDDEN
        </text>
        <text x="273" y="278" fill="#7c9084" fontSize="10">
          ACTIONS
        </text>
      </svg>
      <div className="graph-key">
        <span>
          <i className="mint" />
          positive weight
        </span>
        <span>
          <i className="coral" />
          negative weight
        </span>
      </div>
    </>
  );
}
