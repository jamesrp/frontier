// Chunky little sound effects, made on the fly with WebAudio (no sound files).
// Every sound is short and friendly: pops, coins, thuds and booms.

type Wave = OscillatorType;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('frontier-mute') === '1'; } catch { /* no storage */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('frontier-mute', m ? '1' : '0'); } catch { /* no storage */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC() as AudioContext;
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** One tone that slides from f0 to f1. */
function tone(f0: number, f1: number, dur: number, wave: Wave = 'square', vol = 0.25, delay = 0) {
  const a = audio(); if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
/** A burst of noise through a low-pass filter: thuds and booms. */
function noise(dur: number, cutoff: number, vol = 0.4, delay = 0, endCutoff = 120) {
  const a = audio(); if (!a || !master) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + delay;
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(endCutoff, t + dur);
  const gn = a.createGain();
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(gn); gn.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// Stop a burst of the same sound from piling up (a battle can fire many shots in one frame).
const last: Record<string, number> = {};
function gate(name: string, ms: number) {
  const now = Date.now();
  if (now - (last[name] ?? 0) < ms) return false;
  last[name] = now; return true;
}

export const sfx = {
  click() { if (gate('click', 40)) tone(660, 520, 0.05, 'square', 0.08); },
  pop() { if (gate('pop', 60)) { tone(320, 900, 0.09, 'square', 0.18); } },
  coin() { if (gate('coin', 80)) { tone(988, 988, 0.07, 'square', 0.14); tone(1319, 1319, 0.16, 'square', 0.14, 0.07); } },
  build() { if (gate('build', 90)) { noise(0.08, 1800, 0.25); tone(180, 120, 0.1, 'square', 0.15, 0.02); noise(0.08, 1800, 0.2, 0.13); } },
  done() { if (gate('done', 120)) { [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'square', 0.13, i * 0.07)); } },
  grow() { if (gate('grow', 120)) tone(400, 800, 0.14, 'triangle', 0.18); },
  tech() { if (gate('tech', 200)) { [659, 784, 988, 1319].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.16, i * 0.08)); } },
  march() { if (gate('march', 120)) { noise(0.05, 900, 0.18); noise(0.05, 900, 0.14, 0.12); } },
  shoot() { if (gate('shoot', 45)) tone(880, 220, 0.08, 'sawtooth', 0.07); },
  hit() { if (gate('hit', 45)) noise(0.09, 2400, 0.18, 0, 400); },
  crit() { if (gate('crit', 70)) { tone(1200, 300, 0.12, 'square', 0.1); noise(0.12, 3000, 0.22, 0, 300); } },
  boom() { if (gate('boom', 70)) { noise(0.45, 1400, 0.5, 0, 60); tone(110, 40, 0.35, 'sine', 0.35); } },
  sway() { if (gate('sway', 200)) { tone(300, 1200, 0.35, 'sine', 0.15); tone(450, 1800, 0.35, 'sine', 0.08, 0.05); } },
  star() { if (gate('star', 100)) { [784, 1047, 1568].forEach((f, i) => tone(f, f * 1.01, 0.14, 'square', 0.12, i * 0.09)); } },
  win() { if (gate('win', 400)) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'square', 0.14, i * 0.12)); } },
  lose() { if (gate('lose', 400)) { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.22, 'triangle', 0.15, i * 0.16)); } },
  deny() { if (gate('deny', 120)) tone(160, 110, 0.12, 'square', 0.1); },
  turn() { if (gate('turn', 150)) { tone(392, 392, 0.06, 'square', 0.1); tone(523, 523, 0.1, 'square', 0.1, 0.06); } },
  capture() { if (gate('capture', 300)) { noise(0.3, 1600, 0.3); [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.15, 'square', 0.14, 0.1 + i * 0.09)); } },
};
export type Sfx = keyof typeof sfx;
