/** Race-only top-down swoop, pickup and departure, measured on the race clock. */
export const RACE_EAGLE_GRAB_TICK = 36;
export const RACE_EAGLE_TICKS = 120;
export function raceEaglePose(ticks: number) {
  const approach = Math.max(0, Math.min(1, ticks / RACE_EAGLE_GRAB_TICK));
  const departure = Math.max(0, Math.min(1, (ticks - RACE_EAGLE_GRAB_TICK) / (RACE_EAGLE_TICKS - RACE_EAGLE_GRAB_TICK)));
  const lift = departure * departure * 14;
  return {x: (1 - approach) * .8, row: (1 - approach) * 3,
    height: .9 + (1 - approach) ** 2 * 10 + lift, lift,
    finished: ticks >= RACE_EAGLE_TICKS};
}
