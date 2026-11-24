/** Standalone original game assets and blocky illustrations, all on transparency. */
import carIcon from "./icons/blue-car-left.png";
import chickenIcon from "./icons/chicken.png";
import populationIcon from "./icons/population-formation.png";

export function ExperimentIcon({kind}: {kind: "surroundings" | "action" | "decision" | "population" | "score" | "evolution"}) {
  if(kind === "surroundings" || kind === "decision") return <span className={`home-step-icon home-model-icon ${kind === "decision" ? "home-hopping-chicken" : ""}`} aria-hidden="true">
    <img src={kind === "surroundings" ? carIcon : chickenIcon} alt="" width="256" height="256" />
  </span>;
  if(kind === "population") return <span className="home-step-icon home-population-icon" aria-hidden="true">
    <img src={populationIcon} alt="" width="256" height="256" />
  </span>;
  const key=(x:number,y:number,rotation:number)=><g transform={`translate(${x} ${y})`}>
    <path fill="#518293" d="M0 2h18v17l-3 3H0z" />
    <path fill="#83c4d3" d="M0 0h15v18H0z" />
    <path fill="#b4e0e5" d="M0 0h18l-3 3H0z" />
    <path fill="#fffdf4" transform={`translate(7.5 10) rotate(${rotation})`} d="M-1.5 5v-6H-5L0-6l5 5H1.5v6z" />
  </g>;
  return <svg className={`home-step-icon${kind === "score" ? " home-coin-icon" : ""}`} viewBox="0 0 64 64" fill="none" aria-hidden="true" shapeRendering="crispEdges">
    {kind === "action" && <g transform="translate(2 8)">{key(21,0,0)}{key(0,25,-90)}{key(21,25,180)}{key(42,25,90)}</g>}
    {kind === "score" && <>
      <path fill="#bc852a" d="M20 3h24v5h8v8h6v8h3v16h-3v8h-6v8h-8v5H20v-5h-8v-8H6v-8H3V24h3v-8h6V8h8z" />
      <path fill="#f4ca54" d="M21 7h22v5h8v9h5v22h-5v8h-8v5H21v-5h-8v-8H8V21h5v-9h8z" />
      <path fill="#ffdf7b" d="M23 12h18v5h7v7h3v16h-3v7h-7v4H23v-4h-7v-7h-3V24h3v-7h7z" />
      <path fill="#97651a" d="M43 19H24v5h-5v16h5v5h19v-7H28V26h15z" />
    </>}
    {kind === "evolution" && <g transform="translate(-1 9) scale(1.04 .78)">
      <path fill="#edaeb7" stroke="#b57381" strokeWidth="3" d="M43 39h8v11h6v10h-7v-7h-7z" />
      <path fill="#e9a8b1" stroke="#b57381" strokeWidth="3" d="M6 23h4v-8h8V9h10V5h14v4h10v7h6v9h3v12h-6v7H43v5H27v-4H17v-5H9v-7H6z" />
      <path stroke="#b57381" strokeWidth="3" d="M18 16v9h-5M29 13v9h10v-7M49 18v8h6M22 32h10v-7M12 34h9v7M36 30h9v7h-7M28 40h8" />
      <path fill="#d693a1" stroke="#b57381" strokeWidth="3" d="M46 36h9v4h5v7h-5v5H44v-4h-5v-8h7z" />
      <path stroke="#b57381" strokeWidth="2" d="M46 42h8m-11 5h10" />
    </g>}
  </svg>;
}
