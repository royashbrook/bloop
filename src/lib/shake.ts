// shake the phone to jiggle the jar. a shake is a hard jolt, well past anything
// walking or a bumpy car does, and one counts at most every SHAKE_GAP_MS.

/** how hard a jolt must be, in m/s^2 with gravity taken out (walking peaks near 3 to 5) */
export const SHAKE_AT = 15;
/** at most one jiggle in this long */
export const SHAKE_GAP_MS = 350;

/** the jolt in a motion event, gravity taken out; null when the device gives nothing */
function jolt(e: DeviceMotionEvent): number | null {
  const a = e.acceleration;
  if (a && a.x != null && a.y != null && a.z != null) return Math.hypot(a.x, a.y, a.z);
  const g = e.accelerationIncludingGravity;
  if (g && g.x != null && g.y != null && g.z != null) return Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  return null;
}

/** a devicemotion handler that calls onShake(strength 0.6..1) for each real shake */
export function shaker(onShake: (strength: number) => void, now = () => performance.now()) {
  let last = -Infinity;
  return (e: DeviceMotionEvent) => {
    const m = jolt(e);
    if (m === null || m < SHAKE_AT) return;
    const t = now();
    if (t - last < SHAKE_GAP_MS) return;
    last = t;
    onShake(Math.min(1, 0.6 + (m - SHAKE_AT) / 25));
  };
}

export type MotionAnswer = "granted" | "denied" | "unsupported";

/**
 * ask to read motion. on iOS this must run inside the tap that turns jiggle on:
 * it is the gesture DeviceMotionEvent.requestPermission() needs.
 */
export async function askMotion(): Promise<MotionAnswer> {
  const Motion = (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent;
  if (typeof Motion !== "function") return "unsupported";
  const ask = (Motion as { requestPermission?: () => Promise<string> }).requestPermission;
  if (typeof ask !== "function") return "granted";
  try {
    return (await ask.call(Motion)) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}
