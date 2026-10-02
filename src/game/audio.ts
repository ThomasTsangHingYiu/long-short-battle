let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(next: boolean) {
  muted = next;
}

export function unlockAudio() {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

export function sfx(kind: "play" | "hit" | "heal" | "end" | "win" | "lose" | "click") {
  unlockAudio();
  if (kind === "click") tone(520, 0.05, "square", 0.02);
  else if (kind === "play") {
    tone(330, 0.08, "triangle", 0.04);
    tone(495, 0.12, "sine", 0.03);
  } else if (kind === "hit") {
    tone(140, 0.09, "sawtooth", 0.035);
    tone(90, 0.14, "square", 0.02);
  } else if (kind === "heal") tone(660, 0.12, "sine", 0.03);
  else if (kind === "end") tone(240, 0.07, "triangle", 0.025);
  else if (kind === "win") {
    tone(523, 0.12, "triangle", 0.04);
    tone(659, 0.14, "triangle", 0.035);
    tone(784, 0.2, "sine", 0.03);
  } else if (kind === "lose") {
    tone(220, 0.18, "sawtooth", 0.03);
    tone(110, 0.28, "triangle", 0.03);
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") unlockAudio();
  });
}
