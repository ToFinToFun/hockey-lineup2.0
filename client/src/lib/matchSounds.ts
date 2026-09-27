/**
 * Ljud i Score Tracker, syntetiserade med Web Audio (inga ljudfiler att ladda).
 *  - Mål Vita: ljust "pling" (klocka, två toner uppåt)
 *  - Mål Gröna: "tut-tut" (kort signalhorn, två stötar)
 *  - Slutsignal: utdraget horn (ca 2,5 s)
 * En gemensam AudioContext som låses upp vid första tryck, så att slutsignalen
 * (som startas av en timer) också hörs på mobil.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Anropa vid användartryck (t.ex. första gången sidan rörs) så att ljud tillåts senare. */
export function unlockAudio() {
  audio();
}

function master(c: AudioContext, volume: number) {
  const out = c.createGain();
  out.gain.value = volume;
  // Lätt kompressor så att ljuden hörs tydligt utan att spraka
  const comp = c.createDynamicsCompressor();
  out.connect(comp).connect(c.destination);
  return out;
}

/** Klockton: grundton + övertoner som klingar ut. */
function bell(c: AudioContext, out: AudioNode, freq: number, at: number, length = 1.1) {
  const partials: Array<[number, number]> = [[1, 0.6], [2.01, 0.25], [3.02, 0.12], [4.2, 0.06]];
  for (const [mult, amp] of partials) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(amp, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length / mult ** 0.3);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** Hornstöt: två detonerade sågtänder genom lågpassfilter. */
function horn(c: AudioContext, out: AudioNode, freqs: number[], at: number, length: number, attack = 0.03, release = 0.08, vibrato = 0) {
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + attack);
  g.gain.setValueAtTime(0.5, at + length - release);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  filter.connect(g).connect(out);

  // Lätt vibrato (i Hz) för hornets "levande" ton
  let vib: GainNode | null = null;
  if (vibrato > 0) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 5;
    vib = c.createGain();
    vib.gain.value = vibrato;
    lfo.connect(vib);
    lfo.start(at);
    lfo.stop(at + length);
  }

  for (const f of freqs) {
    for (const detune of [-6, 6]) {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = detune;
      if (vib) vib.connect(osc.frequency);
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + length + 0.02);
    }
  }
}

export function playGoalSound(team: "white" | "green") {
  const c = audio();
  if (!c) return;
  const now = c.currentTime + 0.02;
  if (team === "white") {
    const out = master(c, 0.5);
    bell(c, out, 988, now); // B5
    bell(c, out, 1319, now + 0.16, 1.3); // E6
  } else {
    const out = master(c, 0.35);
    horn(c, out, [392, 494], now, 0.22); // G4 + B4
    horn(c, out, [392, 494], now + 0.3, 0.32);
  }
}

export function playEndSignal() {
  const c = audio();
  if (!c) return;
  const now = c.currentTime + 0.02;
  const out = master(c, 0.45);
  // Arenahorn: låg dur-ters, mjuk insats, lätt vibrato, ca 2,5 s
  horn(c, out, [196, 247, 294], now, 2.6, 0.12, 0.5, 2.5);
}
