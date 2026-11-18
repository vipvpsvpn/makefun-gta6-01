// Solmar Bay — all sound is synthesized with WebAudio. No audio files.
// Engine hum, police siren, gunshots, punches, pickups and a small
// synthwave bass loop are built from oscillators and filtered noise.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicOn = true;
    this.musicStep = 0;
    this.ready = false;
  }

  // Must be called from a user gesture (the Play button).
  init() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // --- engine: two detuned saws through a low-pass filter ---
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // --- siren: square wave wobbling between two notes ---
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 1.6;
    const sirenDepth = this.ctx.createGain();
    sirenDepth.gain.value = 180;
    this.sirenLfo.connect(sirenDepth);
    sirenDepth.connect(this.sirenOsc.frequency);
    this.sirenOsc.frequency.value = 880;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    this.ready = true;
    this.startMusic();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEngine(speedRatio, on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedRatio * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 55 + speedRatio * 165;
    this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.5 + 3, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + speedRatio * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ready) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.15);
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  gunshot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.17);
    // Low thump underneath.
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    thump.connect(tg);
    tg.connect(this.master);
    thump.start(t);
    thump.stop(t + 0.14);
  }

  punch() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.11);
  }

  blip(freq, dur, type = 'sine', vol = 0.25) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  pickup() {
    this.blip(660, 0.1, 'sine', 0.3);
    setTimeout(() => this.blip(990, 0.16, 'sine', 0.3), 70);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.3), i * 110));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sawtooth', 0.18), i * 130));
  }

  carDoor() {
    this.blip(180, 0.08, 'square', 0.2);
    setTimeout(() => this.blip(120, 0.1, 'square', 0.2), 60);
  }

  // A slow synthwave loop: Am – F – C – G bass, soft pad and a hat tick.
  startMusic() {
    if (!this.ready || this.musicTimer) return;
    const roots = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 261.63, 329.63],
      [196, 246.94, 293.66],
    ];
    this.musicTimer = setInterval(() => {
      if (!this.ready || !this.musicOn) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      const t = this.ctx.currentTime;
      // Bass on beats 0 and 4, hats every step.
      if (step === 0 || step === 4) this.note(roots[bar], 0.45, 'sawtooth', 0.12, 180);
      if (step === 0) chords[bar].forEach((f) => this.note(f, 1.8, 'triangle', 0.045, 900));
      this.note(8000, 0.03, 'square', 0.012, 6000, true);
      this.musicStep++;
    }, 240);
  }

  note(freq, dur, type, vol, cutoff, noise = false) {
    const t = this.ctx.currentTime;
    let src;
    if (noise) {
      src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.05);
    } else {
      src = this.ctx.createOscillator();
      src.type = type;
      src.frequency.value = freq;
    }
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }
}
