/** Slab intersection of a relative swept point against an expanded hazard AABB.
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
  padding = 0,
) {
  let lo = 0,
    hi = 1;
  const ax = x0 - hx0, bx = x1 - hx1, extentX = length / 2 + 0.22 + padding,
    dx = bx - ax;
  if (Math.abs(dx) < 1e-12) {
    if (Math.abs(ax) > extentX) return false;
  } else {
    const s = (-extentX - ax) / dx, e = (extentX - ax) / dx;
    lo = Math.max(lo, Math.min(s, e));
    hi = Math.min(hi, Math.max(s, e));
    if (lo > hi) return false;
  }
  const ay = y0 - row, by = y1 - row, dy = by - ay, extentY = 0.61 + padding;
  if (Math.abs(dy) < 1e-12) {
    if (Math.abs(ay) > extentY) return false;
  } else {
    const s = (-extentY - ay) / dy, e = (extentY - ay) / dy;
    lo = Math.max(lo, Math.min(s, e));
    hi = Math.min(hi, Math.max(s, e));
    if (lo > hi) return false;
  }
  return true;
}
