// Szintetizált hangok (Web Audio) – külső hangfájl nélkül.
let ac: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
export const audio = { on: true, vol: 0.5 };
const last: Record<string, number> = {};

function ctx(): AudioContext | null {
  if (!audio.on) return null;
  if (!ac) {
    try { ac = new AudioContext(); } catch { return null; }
    master = ac.createGain(); master.gain.value = audio.vol; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
export function setVolume(v: number): void { audio.vol = v; if (master) master.gain.value = v; }

function noise(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', slide = 0): void {
  const a = ctx(); if (!a) return;
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.6 + Math.random() * 0.8;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), a.currentTime + dur);
  const g = a.createGain(); g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(master!); s.start(); s.stop(a.currentTime + dur);
}
function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 1, delay = 0): void {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + delay);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, a.currentTime + delay + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime + delay); g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + delay + dur);
  o.connect(g); g.connect(master!); o.start(a.currentTime + delay); o.stop(a.currentTime + delay + dur + 0.02);
}

/** Hang lejátszása; vol 0..1 a távolság szerinti halkítással. */
export function sfx(name: string, vol = 1): void {
  const now = performance.now();
  const gap = name === 'loves' || name === 'kard' ? 45 : 90;
  if (now - (last[name] ?? 0) < gap) return;
  last[name] = now;
  switch (name) {
    case 'loves': noise(0.16, 1400, 0.7, 0.5 * vol, 'bandpass', 0.3); tone(160, 0.08, 0.25 * vol, 'square', 0.4); break;
    case 'agyu': noise(0.7, 300, 0.5, 0.9 * vol, 'lowpass', 0.2); tone(70, 0.5, 0.7 * vol, 'sine', 0.4); break;
    case 'robbanas': noise(0.8, 500, 0.4, 0.8 * vol, 'lowpass', 0.15); tone(55, 0.6, 0.6 * vol, 'sine', 0.5); break;
    case 'kard': tone(1800 + Math.random() * 900, 0.09, 0.12 * vol, 'triangle', 0.8); noise(0.05, 5000, 2, 0.12 * vol); break;
    case 'csobbanas': noise(0.5, 900, 0.6, 0.4 * vol, 'bandpass', 0.4); break;
    case 'fa': noise(0.07, 700, 1.5, 0.3 * vol); tone(190, 0.05, 0.15 * vol, 'square', 0.6); break;
    case 'omlas': noise(1.1, 220, 0.4, 0.8 * vol, 'lowpass', 0.3); break;
    case 'kesz': tone(660, 0.12, 0.18 * vol, 'triangle'); tone(880, 0.2, 0.18 * vol, 'triangle', 1, 0.1); break;
    case 'katt': tone(900, 0.03, 0.08 * vol, 'square'); break;
    case 'tilos': tone(180, 0.12, 0.15 * vol, 'sawtooth', 0.8); break;
    case 'parancs': tone(520, 0.05, 0.08 * vol, 'triangle', 1.2); break;
    case 'riado': tone(330, 0.35, 0.22 * vol, 'sawtooth', 1); tone(392, 0.45, 0.22 * vol, 'sawtooth', 1, 0.3); break; // kürt
    case 'harang': for (let k = 0; k < 3; k++) { tone(523, 0.9, 0.16 * vol, 'sine', 1, k * 0.5); tone(1046, 0.5, 0.06 * vol, 'sine', 1, k * 0.5); } break;
    case 'evszak': tone(392, 0.4, 0.12 * vol, 'triangle'); tone(494, 0.4, 0.12 * vol, 'triangle', 1, 0.18); tone(587, 0.7, 0.12 * vol, 'triangle', 1, 0.36); break;
    case 'gyozelem': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 0.2 * vol, 'triangle', 1, i * 0.16)); break;
    case 'vereseg': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.7, 0.2 * vol, 'sawtooth', 1, i * 0.3)); break;
    case 'roham': noise(0.5, 250, 1, 0.3 * vol, 'lowpass'); break;
  }
}
