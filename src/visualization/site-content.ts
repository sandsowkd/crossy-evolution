export const REPOSITORY = "https://github.com/sandsowkd/crossy-road-ai";
export const AUTHOR_WEBSITE = "https://jeremyhua.ng";

/** These are archived phase positions, not six consecutive training generations. */
export const MILESTONES = [
  { id: "initial-population", title: "First population", generation: 1, population: 200,
    theme: "A world of possibilities", label: "Random beginnings", skill: "EXPLORATION",
    description: "Two hundred randomly wired brains meet the road. Most go nowhere; a few stumble into forward progress.",
    note: "Before the first round of breeding", color: "#dce8c5" },
  { id: "early-five-generations", title: "Five-generation prototype", generation: 5, population: 200,
    theme: "A little direction", label: "The first selection", skill: "FORWARD PROGRESS",
    description: "After five generations, selection has started to favor movement. Useful wiring gets a chance to survive.",
    note: "A separate, early prototype", color: "#f3e7b3" },
  { id: "binary-road-learner", title: "Binary road learner", generation: 470, population: 200,
    theme: "Read the road", label: "Sensing hazards", skill: "ROAD AWARENESS",
    description: "Simple occupied-or-clear observations give evolution something useful to work with: where the hazards are.",
    note: "Binary-sensor branch · generation 470", color: "#d3e7e6" },
  { id: "two-hop-lookahead", title: "Two-hop lookahead", generation: 85, population: 100,
    theme: "Think a crossing ahead", label: "More of the picture", skill: "LOOKAHEAD",
    description: "A wider view of nearby traffic helps the network choose moves with consequences beyond the next tile.",
    note: "Lookahead branch · generation 85", color: "#e2dcf1" },
  { id: "lookahead-memory", title: "Lookahead with memory", generation: 100, population: 100,
    theme: "Give the present a past", label: "Adding context", skill: "MEMORY INPUTS",
    description: "Lookahead meets a small memory input: the previous horizontal action. That extra context can shape the next move.",
    note: "Memory branch · generation 100", color: "#f0daca" },
  { id: "variant-1-final", title: "Final Variant 1 policy", generation: 150, population: 100,
    theme: "Meet the final flock", label: "Frozen and tested", skill: "THE FINAL POLICY",
    description: "The final saved population, with its selected brain frozen before the independent assessment. See how far it goes.",
    note: "Memory branch · generation 150", color: "#dce8c5" },
] as const;

/** Curated display positions; native origins are preserved in explorer-sequence.ts and the catalog.
 * Preview maps are selected from the already audited eight-map panel to show
 * distinct behaviors. These are real whole-population scores for those maps,
 * not averages or all-map maxima. They do not change the common-panel audit.
 */
export const HOMEPAGE_MILESTONES = [
  { ...MILESTONES[0], title: "Random movement", previewSeed: 561909326,
    description: "Randomly wired networks send chickens in different directions." },
  { ...MILESTONES[1], title: "Forward selection", previewSeed: 627233379,
    description: "Movement is still scattered, but more and more chickens move forward." },
  { ...MILESTONES[3], id: "lookahead-progress", generation: 50, sourceGeneration: 30, title: "Traffic timing", previewSeed: 346364751,
    description: "The chickens learn to time their moves around nearby traffic.",
    note: "Lookahead branch · generation 30" },
  { ...MILESTONES[3], title: "Longer crossings", previewSeed: 27099291,
    description: "The chickens learn to use traffic farther ahead when choosing a crossing." },
  { ...MILESTONES[4], title: "Action memory", previewSeed: 27099291,
    description: "The chickens learn to use previous actions when choosing their next move." },
  { ...MILESTONES[5], title: "Final population", previewSeed: 561909326,
    description: "The final saved population combines traffic lookahead and action memory." },
] as const;

export const VARIANT_ONE_RESULT = {
  mean: 1361.208984375, maps: 512, median: 1697, reach1000: 76.5625,
  interval: [1313.322265625, 1409.09375], maxTicks: 36000,
  comparisons: [
    { name: "Random actions", score: .97 },
    { name: "Simple rule", score: 13.08 },
    { name: "Distance rule", score: 111.97 },
    { name: "Previous saved policy", score: 1297.03 },
    { name: "Final NEAT policy", score: 1361.21 },
  ],
};

/** A data-driven list leaves room for future public experiments. */
export const PUBLIC_VARIANTS = [
  { number: "01", name: "Cars & roads", status: "Complete", description: "The original challenge. Evolve a brain that can read traffic and keep crossing.", href: "/#milestones" },
  { number: "02", name: "Cars, trains & logs", status: "Complete", description: "Explore150 saved populations or race the frozen final AI.", href: "/explore?variant=2" },
] as const;

/** Authentic Variant 2 cohorts, curated into150 display positions; native origins remain in the catalog. */
export const VARIANT_TWO_MILESTONES = [
  {id:"variant-2-initial",generation:1,title:"Random movement",previewSeed:561909326,
    description:"Randomly wired networks meet roads, rivers, and train crossings.",note:"Original scratch population · generation 1"},
  {id:"variant-2-early",generation:5,title:"Forward selection",previewSeed:627233379,
    description:"Early selection starts to favor chickens that keep moving forward.",note:"Original scratch experiment · generation 5"},
  {id:"variant-2-rivers",generation:50,title:"River crossings",previewSeed:346364751,
    description:"Transferred road skills develop alongside observations of moving support.",note:"Archived river-adaptation population"},
  {id:"variant-2-consistent",generation:85,title:"Consistent crossings",previewSeed:27099291,
    description:"Saved populations tackle changing traffic, train warnings, and floating logs.",note:"Archived consistency experiment"},
  {id:"variant-2-longer",generation:100,title:"Longer journeys",previewSeed:27099291,
    description:"Native networks combine nearby hazards and log motion on longer journeys.",note:"Archived native-input experiment"},
  {id:"variant-2-final",generation:150,title:"Final population",previewSeed:561909326,
    description:"The frozen final AI and its original saved population face the full Variant 2 world.",note:"Original native019 · generation 392 · frozen policy 353089"},
] as const;
export const homepageMilestones = (variant:1|2) => variant===1 ? HOMEPAGE_MILESTONES : VARIANT_TWO_MILESTONES;
