import { RNG } from "../core/rng";
import { sensorCount, sensorNodeId } from "../core/sensor-version";
import { INPUT_COUNT } from "../core/observation";
import { OUTPUT_START, type Genome, type Innovations } from "./genome";
/** Preserve every V8 weight/topology/ID; new V9 channels initially contribute zero. */
export function upgradeToVariantTwo(genome: Genome, tracker: Innovations, rng: RNG): Genome {
  const upgraded = structuredClone(genome);
  if (upgraded.observationVersion !== 8) throw new Error("Variant2 transfer parent must use sensor version8");
  upgraded.observationVersion = 9; upgraded.fitness = 0; upgraded.species = 0;
  for (let index=INPUT_COUNT;index<sensorCount(9);index++) upgraded.nodes.push({id:sensorNodeId(index),kind:"input",depth:0});
  const sensors = new Set(Array.from({length:20},()=>sensorNodeId(INPUT_COUNT+rng.int(sensorCount(9)-INPUT_COUNT))));
  for (let index=sensorCount(9)-8;index<sensorCount(9);index++) sensors.add(sensorNodeId(index));
  for(const from of sensors)for(let action=0;action<5;action++){
    const to=OUTPUT_START+action;
    upgraded.connections.push({from,to,innovation:tracker.connection(from,to),weight:0,enabled:true});
  }
  return upgraded;
}
