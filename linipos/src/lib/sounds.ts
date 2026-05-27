// POS Sound Effects — using Web Audio API (no external files needed)
// Generates short, satisfying sounds for key interactions

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if audio is not available
  }
}

/** Short pop — when adding item to cart */
export function playAddSound() {
  playTone(880, 0.08, 'sine', 0.12);
  setTimeout(() => playTone(1100, 0.06, 'sine', 0.08), 50);
}

/** Soft click — for +/- quantity buttons */
export function playClickSound() {
  playTone(600, 0.04, 'triangle', 0.08);
}

/** Remove sound — when removing item from cart */
export function playRemoveSound() {
  playTone(400, 0.08, 'sine', 0.1);
  setTimeout(() => playTone(300, 0.1, 'sine', 0.06), 60);
}

/** Success chime — checkout complete */
export function playSuccessSound() {
  playTone(523, 0.12, 'sine', 0.12);      // C5
  setTimeout(() => playTone(659, 0.12, 'sine', 0.12), 100); // E5
  setTimeout(() => playTone(784, 0.15, 'sine', 0.14), 200); // G5
  setTimeout(() => playTone(1047, 0.25, 'sine', 0.1), 300);  // C6
}

/** Bill saved chime — save open bill */
export function playSaveSound() {
  playTone(660, 0.1, 'triangle', 0.1);
  setTimeout(() => playTone(880, 0.15, 'triangle', 0.08), 80);
}

/** Scanner beep */
export function playScanSound() {
  playTone(1200, 0.08, 'square', 0.06);
  setTimeout(() => playTone(1500, 0.06, 'square', 0.04), 60);
}
