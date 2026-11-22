/** Bounded, time-based tracking keeps the camera over the streamed terrain. */
export const MAX_CAMERA_LAG = 2;
export const CAMERA_CUT_DISTANCE = 10;

export function followCameraAxis(current: number, target: number, seconds: number) {
  // A distant replacement should cut directly to its already loaded terrain.
  if (Math.abs(target - current) > CAMERA_CUT_DISTANCE) return target;
  const amount = 1 - Math.exp(-Math.max(0, seconds) / .08);
  const next = current + (target - current) * amount;
  return Math.max(target - MAX_CAMERA_LAG, Math.min(target + MAX_CAMERA_LAG, next));
}
