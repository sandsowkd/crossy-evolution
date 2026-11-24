/** Projected coordinates from the actual camera, including camera follow easing. */
export function insideCamera(point: {x: number; y: number; z: number}, padding = .08) {
  return point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 - padding && Math.abs(point.y) <= 1 - padding;
}

/** Race inset: avoid flickering at the main camera's edges. Times are in milliseconds. */
export class RaceCameraVisibility {
  private shownAt?: number;
  private onScreenSince?: number;
  reset() { this.shownAt = undefined; this.onScreenSince = undefined; }
  update(onScreen: boolean, now: number) {
    if (!onScreen) {
      this.onScreenSince = undefined;
      this.shownAt ??= now;
    } else if (this.shownAt !== undefined) {
      this.onScreenSince ??= now;
      if (now - this.shownAt >= 5000 && now - this.onScreenSince >= 2000) this.reset();
    }
    return this.shownAt !== undefined;
  }
}
