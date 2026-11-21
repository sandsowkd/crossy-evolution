/** Mulberry32; all stochastic gameplay/evolution uses explicit, serializable streams. */
export class RNG {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  pick<T>(items: readonly T[]) {
    return items[this.int(items.length)];
  }
  normal() {
    return (
      Math.sqrt(-2 * Math.log(Math.max(1e-10, this.next()))) *
      Math.cos(2 * Math.PI * this.next())
    );
  }
}
export function hash(seed: number, index: number, stream = 0) {
  let h =
    (seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(stream, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}
export const modulo = (x: number, n: number) => ((x % n) + n) % n;
