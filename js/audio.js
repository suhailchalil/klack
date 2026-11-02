/**
 * AudioEngine — synthesizes a mechanical "thock" keystroke with the Web Audio API.
 *
 * Graph: triangle oscillator sweeping 150Hz -> 35Hz over 70ms, through a
 * lowpass biquad filter (cutoff 380Hz), into a fast exponential-decay gain.
 * The lowpass is what reads as "thock" rather than "clack" — it rolls off
 * the dry high-frequency snap of an unlubed switch.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
  }

  _getContext() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * One keystroke. `variation` (roughly -1..1) detunes pitch and filter
   * slightly so repeated strokes in a cadence don't sound looped.
   */
  playThock(variation = 0) {
    const ctx = this._getContext();
    const t = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150 + variation * 12, t);
    osc.frequency.exponentialRampToValueAtTime(35 + Math.max(variation, -0.9) * 4, t + 0.07);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 380 + variation * 40;
    lowpass.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(1, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(out);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** A short burst of keystrokes, lightly varied so it reads as a cadence. */
  playCadence(count = 3, spacingMs = 95) {
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => this.playThock((i % 3) - 1), i * spacingMs);
    }
  }
}
