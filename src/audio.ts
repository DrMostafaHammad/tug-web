type AudioMode = "off" | "setup" | "game" | "victory";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export class GameAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private backgroundTimer: number | null = null;
  private enabled = true;

  setEnabled(next: boolean) {
    this.enabled = next;
    if (!next) {
      this.stopBackground();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async prime() {
    if (!this.enabled) {
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    if (!this.context) {
      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    startOffset = 0,
    type: OscillatorType = "sine",
    sweepTo?: number,
  ) {
    if (!this.context || !this.masterGain || !this.enabled) {
      return;
    }

    const startTime = this.context.currentTime + startOffset;
    const gain = this.context.createGain();
    const oscillator = this.context.createOscillator();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (sweepTo) {
      oscillator.frequency.exponentialRampToValueAtTime(
        clamp(sweepTo, 40, 3000),
        startTime + duration,
      );
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  }

  private burst(startOffset = 0, duration = 0.14, volume = 0.04) {
    if (!this.context || !this.masterGain || !this.enabled) {
      return;
    }

    const bufferSize = this.context.sampleRate * duration;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let index = 0; index < bufferSize; index += 1) {
      output[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const startTime = this.context.currentTime + startOffset;

    filter.type = "bandpass";
    filter.frequency.value = 620;
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.buffer = noiseBuffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(startTime);
  }

  startBackground(mode: AudioMode) {
    if (mode !== "game" || !this.enabled) {
      this.stopBackground();
      return;
    }

    this.stopBackground();
    this.playStruggleLoop();
    this.backgroundTimer = window.setInterval(() => {
      this.playStruggleLoop();
    }, 1800);
  }

  stopBackground() {
    if (this.backgroundTimer !== null) {
      window.clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  private playStruggleLoop() {
    this.tone(175, 0.22, 0.02, 0, "triangle", 150);
    this.tone(210, 0.24, 0.018, 0.28, "triangle", 180);
    this.burst(0.48, 0.12, 0.02);
    this.tone(320, 0.09, 0.016, 0.62, "square", 280);
  }

  playRoundWin(team: "blue" | "red") {
    const base = team === "blue" ? 520 : 430;
    this.tone(base, 0.16, 0.08, 0, "square");
    this.tone(base * 1.25, 0.14, 0.07, 0.07, "triangle");
    this.tone(base * 1.5, 0.18, 0.06, 0.15, "sine");
  }

  playReveal() {
    this.tone(390, 0.09, 0.04, 0, "triangle");
    this.tone(520, 0.11, 0.035, 0.08, "triangle");
  }

  playVictory(team: "blue" | "red") {
    const root = team === "blue" ? 392 : 349;
    this.stopBackground();
    this.tone(root, 0.18, 0.09, 0, "square");
    this.tone(root * 1.25, 0.18, 0.085, 0.12, "square");
    this.tone(root * 1.5, 0.22, 0.08, 0.24, "triangle");
    this.tone(root * 2, 0.4, 0.07, 0.4, "sine");
    this.burst(0.1, 0.18, 0.05);
    this.burst(0.28, 0.18, 0.04);
    this.burst(0.46, 0.22, 0.045);
  }
}
