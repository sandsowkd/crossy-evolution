import { useState } from "react";
import { type Generation } from "../../evolution/trainer";
export function EvolutionChart({
  history,
  selected,
  onSelect,
}: {
  history: Generation[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [metric, setMetric] = useState<"rows" | "fitness">("rows");
  const series =
    metric === "rows"
      ? [
          {
            name: "Population mean row",
            color: "#8eb2a2",
            get: (r: Generation) => r.meanRow,
          },
          {
            name: "Maximum training row",
            color: "#d6e99b",
            get: (r: Generation) => r.maxRow,
          },
          {
            name: "16-map monitor mean row",
            color: "#efba75",
            get: (r: Generation) => r.evalRow,
          },
        ]
      : [
          {
            name: "Mean training fitness",
            color: "#8eb2a2",
            get: (r: Generation) => r.meanFitness,
          },
          {
            name: "Best training fitness",
            color: "#d6e99b",
            get: (r: Generation) => r.bestFitness,
          },
        ];
  const all = history.flatMap((r) => series.map((s) => s.get(r))),
    min = Math.min(0, ...all),
    max = Math.max(10, ...all),
    range = max - min;
  const px = (i: number) => 42 + (i / Math.max(1, history.length - 1)) * 750,
    py = (v: number) => 106 - ((v - min) / range) * 88;
  return (
    <section className="chart-section">
      <div className="section-heading">
        <h2>
          Evolution in motion <span>{history.length} generations recorded</span>
        </h2>
        <div className="segmented small">
          <button
            className={metric === "rows" ? "active" : ""}
            onClick={() => setMetric("rows")}
          >
            Rows
          </button>
          <button
            className={metric === "fitness" ? "active" : ""}
            onClick={() => setMetric("fitness")}
          >
            Fitness
          </button>
        </div>
      </div>
      <svg
        viewBox="0 0 815 135"
        className="chart"
        role="img"
        aria-label="Measured generation history, training and independent monitor"
      >
        {[0, 0.5, 1].map((t) => {
          const v = min + range * t;
          return (
            <g key={t}>
              <line
                x1="42"
                x2="800"
                y1={py(v)}
                y2={py(v)}
                stroke="#2c3932"
                strokeDasharray="3 5"
              />
              <text x="0" y={py(v) + 4} fill="#809487" fontSize="10">
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <polyline
            key={s.name}
            points={history.map((r, i) => `${px(i)},${py(s.get(r))}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
          />
        ))}
        {history.map((r, i) => (
          <g
            key={r.generation}
            onClick={() => onSelect(i)}
            className="chart-point"
          >
            <rect
              x={px(i) - Math.max(4, 375 / Math.max(1, history.length))}
              y="8"
              width={Math.max(8, 750 / Math.max(1, history.length))}
              height="105"
              fill="transparent"
            >
              <title>{`Generation ${r.generation} · ${r.curriculum}\nTrain mean row ${r.meanRow.toFixed(2)} · monitor ${r.evalRow.toFixed(2)}\nBest fitness ${r.bestFitness.toFixed(2)}`}</title>
            </rect>
            {selected === i && (
              <line
                x1={px(i)}
                x2={px(i)}
                y1="8"
                y2="113"
                stroke="#d6e99b"
                opacity=".4"
              />
            )}
          </g>
        ))}
        <text x="42" y="132" fill="#809487" fontSize="10">
          GEN 1
        </text>
        <text x="740" y="132" fill="#809487" fontSize="10">
          GEN {history.length || 0}
        </text>
        {!history.length && (
          <text x="250" y="65" fill="#a5b5a8" fontSize="14">
            Start training to record real results.
          </text>
        )}
      </svg>
      <div className="graph-key">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </section>
  );
}
