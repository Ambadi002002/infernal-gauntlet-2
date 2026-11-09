// Web Audio API Procedural Retro Sound FX Generator (Asset-Free)
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playJump() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playDash() {
    if (!this.enabled || !this.ctx) return;
    // White noise whoosh
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    whiteNoise.start();
  }

  playSlash() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playShoot() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playHit() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playDeath() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playVictory() {
    if (!this.enabled || !this.ctx) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.1);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + idx * 0.1 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.1);
      osc.stop(this.ctx.currentTime + idx * 0.1 + 0.25);
    });
  }
}

window.soundFX = new SoundFX();
