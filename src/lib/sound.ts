// little sounds made on the spot with web audio: no files, no third party. a
// soft plop for a drop, a bloop for every merge, each size its own: the small
// ones light, high and quick, the big ones lower and rounder, and the biggest a
// deep glumph, like two huge bubbles becoming one. quick merges in a row step up
// a little. everything runs through a gentle limiter, and only a few play at once.

export type Cue = "drop" | "merge" | "new" | "vanish";

/** one sound, as numbers: what tone() picks and play() makes */
export interface Tone {
  /** the pitch it starts on, and the pitch it glides to, Hz */
  from: number;
  to: number;
  /** seconds */
  length: number;
  /** wobble: how deep (a share of the pitch) and how fast (Hz) */
  wobble: number;
  rate: number;
  /** a soft sine an octave down, the body of a big bubble, 0..1 */
  body: number;
  /** a soft pop at the end, 0..1 */
  pop: number;
  /** tiny bubbles trailing after it */
  blubs: number;
  /** an overtone for sparkle, 0..1 */
  bright: number;
  /** how loud at its peak, 0..1, before the master */
  level: number;
  /** a little twinkle after it: a new biggest made, or two of the biggest gone */
  sparkle: boolean;
}

/** a merge this soon after the last one is the next step of a chain, seconds */
export const CHAIN_GAP = 0.7;
/** a chain steps up at most this many times, two semitones a step */
export const CHAIN_CAP = 4;
/** at most this many sounds at once; another waits its turn by not playing */
export const MAX_VOICES = 8;
const TOP = 10;

/** the sound for a cue: a drop of a tier, or a merge into a tier, n steps into a chain */
export function tone(cue: Cue, tier: number, chain = 0): Tone {
  const k = Math.min(TOP, Math.max(0, Math.round(tier)));
  if (cue === "drop") {
    // a soft plop: a short dip in pitch, a touch lower for a bigger piece
    const from = 620 * 2 ** (-k * 0.2);
    return { from, to: from * 0.55, length: 0.075 + 0.012 * k, wobble: 0, rate: 0, body: 0, pop: 0, blubs: 0, bright: 0.18, level: 0.3, sparkle: false };
  }
  const vanish = cue === "vanish";
  const c = Math.min(CHAIN_CAP, Math.max(0, Math.floor(chain) || 0));
  const step = 2 ** ((2 * c) / 12);
  // a bloop rises: small ones high and far, big ones low and only a little
  const from = 1100 * 2 ** (-k * 0.33) * step * (vanish ? 0.9 : 1);
  return {
    from,
    to: from * (1.85 - 0.05 * k),
    length: (0.11 + 0.045 * k) * (vanish ? 1.35 : 1),
    wobble: k < 4 ? 0 : (k - 3) * 0.018,
    rate: 16 - k,
    body: k < 6 ? 0 : (k - 5) * 0.16,
    pop: k < 8 ? 0 : 0.15 + (k - 8) * 0.1,
    blubs: (k < 6 ? 0 : 1 + Math.floor((k - 6) / 2)) + (vanish ? 1 : 0),
    bright: Math.min(0.6, 0.45 - 0.03 * k + 0.04 * c),
    level: Math.min(0.8, 0.5 + 0.025 * k + (vanish ? 0.05 : 0)),
    sparkle: vanish || cue === "new",
  };
}

const SPARKLE = [1568, 1760, 2093, 2637];
const QUIET = 0.0001;

/** one tone with a soft start (nothing clicks) and a round fade */
function osc(c: BaseAudioContext, out: AudioNode, type: OscillatorType, at: number, length: number, from: number, to: number, glide: number, level: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + glide);
  g.gain.setValueAtTime(QUIET, at);
  g.gain.exponentialRampToValueAtTime(level, at + Math.min(0.012, length / 4));
  g.gain.exponentialRampToValueAtTime(QUIET, at + length);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + length + 0.03);
  return o;
}

/** a little noise, for the pop */
export function hiss(c: BaseAudioContext): AudioBuffer {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * 0.1), c.sampleRate);
  const data = b.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return b;
}

/** make one sound at a time: a sine that glides up, and the parts the tone asks for */
export function synth(c: BaseAudioContext, to: AudioNode, noise: AudioBuffer, t: Tone, at: number) {
  const out = c.createGain();
  out.gain.value = t.level;
  out.connect(to);
  const glide = t.length * 0.45;
  const main = osc(c, out, "sine", at, t.length, t.from, t.to, glide, 1);
  if (t.wobble) {
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = t.rate;
    depth.gain.value = t.from * t.wobble;
    lfo.connect(depth).connect(main.frequency);
    lfo.start(at);
    lfo.stop(at + t.length + 0.03);
  }
  if (t.bright) osc(c, out, "triangle", at, t.length * 0.7, t.from * 2, t.to * 2, glide, t.bright * 0.4);
  if (t.body) osc(c, out, "sine", at, t.length * 1.1, t.from / 2, t.to / 2, glide, t.body * 0.8);
  for (let i = 0; i < t.blubs; i++) {
    const f = t.from * (2.6 + 0.5 * i);
    osc(c, out, "sine", at + t.length * (0.4 + 0.18 * i), 0.06, f, f * 1.6, 0.04, 0.35);
  }
  if (t.pop) {
    const n = c.createBufferSource(), band = c.createBiquadFilter(), g = c.createGain();
    n.buffer = noise;
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 1.2;
    const p = at + t.length * 0.85;
    g.gain.setValueAtTime(QUIET, p);
    g.gain.exponentialRampToValueAtTime(t.pop * 0.5, p + 0.006);
    g.gain.exponentialRampToValueAtTime(QUIET, p + 0.05);
    n.connect(band).connect(g).connect(out);
    n.start(p);
    n.stop(p + 0.07);
  }
  if (t.sparkle) {
    const twinkle = c.createGain();
    twinkle.gain.value = 0.16;
    twinkle.connect(to);
    SPARKLE.forEach((f, i) => osc(c, twinkle, "sine", at + t.length * 0.6 + i * 0.06, 0.12, f, f, 0.01, 1));
  }
}

/** the master: a gentle level into a soft limiter, so nothing ever clips */
export function master(c: BaseAudioContext): GainNode {
  const m = c.createGain();
  m.gain.value = 0.35;
  const limit = c.createDynamicsCompressor();
  limit.threshold.value = -18;
  limit.knee.value = 12;
  limit.ratio.value = 8;
  limit.attack.value = 0.003;
  limit.release.value = 0.2;
  m.connect(limit).connect(c.destination);
  return m;
}

export function createSound(on: boolean) {
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let sound = on;
  let ends: number[] = [];
  let last = -Infinity;
  let chain = 0;
  let played = 0;
  /** a resume asked for inside a tap, not yet done: a sound now plays as it finishes */
  let waking = false;

  // audio may only start inside a tap or a key press; wake() runs in one
  function wake() {
    if (!sound) return;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        out = master(ctx);
        noise = hiss(ctx);
      } catch {
        // no web audio here: the game plays on in silence
        ctx = null;
        return;
      }
    }
    if (ctx.state === "suspended" && !document.hidden && !waking) {
      waking = true;
      ctx.resume().finally(() => (waking = false));
    }
  }

  const ready = () => sound && ctx && out && (ctx.state === "running" || waking);

  /** take a voice, or say no: at most MAX_VOICES at once */
  function voice(at: number, length: number) {
    const now = ctx!.currentTime;
    ends = ends.filter((e) => e > now);
    if (ends.length >= MAX_VOICES) return false;
    ends.push(at + length);
    return true;
  }

  function cue(c: Cue, tier: number, at: number, step = 0) {
    const t = tone(c, tier, step);
    // a sparkle rings on a little after the sound itself
    if (!voice(at, t.length * (t.sparkle ? 1.2 : 1) + 0.1)) return;
    synth(ctx!, out!, noise!, t, at);
    played++;
  }

  return {
    get on() {
      return sound;
    },
    wake,
    /** a piece of this tier was dropped */
    drop(tier: number) {
      if (!ready()) return;
      cue("drop", tier, ctx!.currentTime);
    },
    /** the merges from one frame, in the order they happened */
    merges(list: readonly { tier: number; vanish: boolean; first: boolean; big: boolean }[]) {
      if (!ready() || !list.length) return;
      const now = ctx!.currentTime;
      list.forEach((m, i) => {
        // a few at once are spread a hair apart, so each is heard
        const at = now + i * 0.06;
        chain = at - last < CHAIN_GAP ? chain + 1 : 0;
        last = at;
        cue(m.vanish ? "vanish" : m.first && m.big ? "new" : "merge", m.tier, at, chain);
      });
    },
    setSound(v: boolean) {
      sound = v;
      if (v) wake();
      else if (ctx?.state === "running") void ctx.suspend();
    },
    /** a hidden or departing page goes quiet at once */
    quiet() {
      if (ctx?.state === "running") void ctx.suspend();
    },
    /** back in view: pick up again, if sound is on and it ever started */
    resume() {
      if (sound && ctx?.state === "suspended" && !document.hidden) void ctx.resume();
    },
    /** a plain copy for the test window */
    report: () => ({ on: sound, state: ctx?.state ?? "none", played, voices: ctx ? ends.filter((e) => e > ctx!.currentTime).length : 0 }),
  };
}
export type Sound = ReturnType<typeof createSound>;
