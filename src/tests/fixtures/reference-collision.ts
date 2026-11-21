/** Frozen pre-optimization reference for scalar-slab equivalence tests.
 * Slab intersection of a relative swept point against an expanded hazard AABB.
 * Both axis intervals must overlap at the SAME substep time. Includes hopping. */
export function sweptHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hx0: number,
  hx1: number,
  row: number,
  length: number,
) {
  let lo = 0,
    hi = 1;
  for (const [a, b, extent] of [
    [x0 - hx0, x1 - hx1, length / 2 + 0.22],
    [y0 - row, y1 - row, 0.61],
  ]) {
    const d = b - a;
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(a) > extent) return false;
      continue;
    }
    const s = (-extent - a) / d,
      e = (extent - a) / d;
    lo = Math.max(lo, Math.min(s, e));
    hi = Math.min(hi, Math.max(s, e));
    if (lo > hi) return false;
  }
  return true;
}
