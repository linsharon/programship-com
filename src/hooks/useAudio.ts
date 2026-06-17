import { useRef, useCallback, useEffect } from 'react';

type Note = { freq: number | null; dur: number };

// Pentatonic G-major phrase inspired by 一剪梅 (雪花飘飘北风萧萧)
// G4=392  A4=440  B4=494  D5=587  E5=659
const MELODY: Note[] = [
  { freq: 587.3, dur: 0.6 },  // D5 — 雪
  { freq: 493.9, dur: 0.4 },  // B4 — 花
  { freq: 440.0, dur: 0.4 },  // A4 — 飘
  { freq: 392.0, dur: 1.0 },  // G4 — 飘
  { freq: null,  dur: 0.5 },
  { freq: 587.3, dur: 0.6 },  // D5 — 北
  { freq: 493.9, dur: 0.4 },  // B4 — 风
  { freq: 440.0, dur: 0.4 },  // A4 — 萧
  { freq: 392.0, dur: 1.0 },  // G4 — 萧
  { freq: null,  dur: 0.5 },
  { freq: 493.9, dur: 0.5 },  // B4 — 天
  { freq: 440.0, dur: 0.5 },  // A4 — 地
  { freq: 392.0, dur: 0.4 },  // G4 — 一片
  { freq: 440.0, dur: 0.4 },  // A4
  { freq: 587.3, dur: 2.5 },  // D5 — 苍茫
  { freq: null,  dur: 2.0 },
];

function playNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  t: number,
  dur: number,
) {
  const vol = 0.16;
  const osc  = ctx.createOscillator();
  const env  = ctx.createGain();
  const osc2 = ctx.createOscillator();
  const env2 = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2; // octave harmonic — piano-like brightness

  // ADSR envelope for fundamental
  env.gain.setValueAtTime(0.001, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.02);
  env.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.1);
  env.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur * 0.92, dur - 0.06));

  // Shorter decay for harmonic
  env2.gain.setValueAtTime(0.001, t);
  env2.gain.linearRampToValueAtTime(vol * 0.28, t + 0.015);
  env2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.35);

  osc.connect(env);   env.connect(dest);
  osc2.connect(env2); env2.connect(dest);

  osc.start(t);  osc.stop(t + dur + 0.15);
  osc2.start(t); osc2.stop(t + dur * 0.4);
}

function schedulePhrase(ctx: AudioContext, dest: AudioNode, from: number): number {
  let t = from;
  for (const note of MELODY) {
    if (note.freq !== null) playNote(ctx, dest, note.freq, t, note.dur);
    t += note.dur;
  }
  return t;
}

// Voss-McCartney pink noise — more natural wind texture than white noise
function createWindNoise(ctx: AudioContext, dest: AudioNode): void {
  const sr  = ctx.sampleRate;
  const buf = ctx.createBuffer(2, sr * 5, sr);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5  - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.loop = true;

  // Shape noise into wind: HPF to remove rumble, LPF to soften harshness
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 80;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 600;

  const windGain = ctx.createGain();
  // Slow fade-in so the wind doesn't startle
  windGain.gain.setValueAtTime(0, ctx.currentTime);
  windGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 4);

  source.connect(hpf);
  hpf.connect(lpf);
  lpf.connect(windGain);
  windGain.connect(dest);
  source.start();
}

export function useAudio() {
  const ctxRef        = useRef<AudioContext | null>(null);
  const masterRef     = useRef<GainNode | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPhraseRef = useRef(0);

  // Declared as a regular function so it can self-reference in setTimeout
  function scheduleMelody() {
    const ctx    = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    const now  = ctx.currentTime;
    const from = Math.max(now + 0.1, nextPhraseRef.current);
    const end  = schedulePhrase(ctx, master, from);
    nextPhraseRef.current = end;

    // Re-schedule 1.5 s before the phrase ends so notes pre-buffer
    const msUntilNext = (end - ctx.currentTime - 1.5) * 1000;
    timerRef.current = setTimeout(scheduleMelody, Math.max(msUntilNext, 500));
  }

  const start = useCallback(() => {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'running') return;
      if (ctxRef.current.state === 'suspended') {
        void ctxRef.current.resume().then(() => scheduleMelody());
        return;
      }
    }

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    masterRef.current = master;

    createWindNoise(ctx, master);

    // Start melody after a short silence
    nextPhraseRef.current = ctx.currentTime + 1.2;
    scheduleMelody();
  // scheduleMelody reads only refs — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void ctxRef.current?.suspend();
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void ctxRef.current?.close();
    },
    [],
  );

  return { start, stop };
}

export function speakNorwegian(text: string, onEnd?: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = 'nb-NO';
  u.rate  = 0.82;
  u.pitch = 1.0;
  if (onEnd) u.onend = onEnd;
  synth.speak(u);
}
