// Audio engine: everything is synthesized with WebAudio at runtime.
// No audio files are shipped, so the game stays 100% offline and the
// three radio stations are real switchable music, not silence.
//
// Version 1.1: the engine hum's lowpass opens a little wider (900 -> 1200 Hz)
// so the higher gears read, and traffic can honk (horn) when the player
// blocks a lane.
import { RADIO_STATIONS } from './config.js';

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.station = 0;
    this.muted = false;
    this.nextNoteTime = 0;
    this.beat = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  // Browsers only allow audio after a user gesture: call from the first
  // click/keypress, never at page load.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.beat = 0;
  }

  setStation(i) {
    this.station = ((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    this.beat = 0;
    return RADIO_STATIONS[this.station].name;
  }
  stationName() { return RADIO_STATIONS[this.station].name; }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // Radio scheduler: called every frame; schedules one 8th-note ahead
  // so the music never gaps, even when the frame rate dips.
  update() {
    if (!this.ctx || this.muted) return;
    const st = RADIO_STATIONS[this.station];
    const step = 60 / st.tempo / 2;
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      this.scheduleBeat(st, this.beat, this.nextNoteTime);
      this.nextNoteTime += step;
      this.beat += 1;
    }
  }

  scheduleBeat(st, beat, t) {
    const bar = Math.floor(beat / 8) % 4;
    const roots = [0, -4, 5, -2];
    const root = st.root + roots[bar];
    // Bass on beats 0 and 4, a pad chord every bar, a lead note that
    // walks the station's scale with a fixed pseudo-random pattern.
    if (beat % 4 === 0) this.note(midiToFreq(root - 12), t, 0.5, 'triangle', 0.5);
    if (beat % 8 === 0) {
      [0, 3, 7].forEach((iv) => this.note(midiToFreq(root + iv), t, 1.6, st.wave, 0.10));
    }
    const leadPattern = [0, 2, 1, 3, 2, 4, 1, 0];
    const deg = leadPattern[beat % 8];
    if (beat % 2 === 0) this.note(midiToFreq(root + 12 + st.scale[deg % st.scale.length]), t, 0.22, st.wave, 0.12);
    if (beat % 8 === 6) this.note(midiToFreq(root + 24), t, 0.3, 'sine', 0.08);
  }

  note(freq, t, dur, wave, vol) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  blip(freq, dur, wave, vol) {
    if (!this.ctx || this.muted) return;
    this.note(freq, this.ctx.currentTime, dur, wave, vol);
  }

  shoot() { this.blip(880, 0.08, 'square', 0.25); this.blip(220, 0.12, 'sawtooth', 0.2); }
  hit() { this.blip(140, 0.15, 'sawtooth', 0.3); }
  crash() { this.blip(70, 0.3, 'sawtooth', 0.4); this.blip(50, 0.4, 'square', 0.3); }
  pickup() { this.blip(660, 0.1, 'sine', 0.3); setTimeout(() => this.blip(990, 0.15, 'sine', 0.3), 90); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sine', 0.3), i * 110)); }
  denied() { this.blip(160, 0.2, 'square', 0.25); }

  // Two-tone car horn: traffic uses it when the player blocks a lane.
  horn() {
    this.blip(370, 0.18, 'square', 0.12);
    setTimeout(() => this.blip(311, 0.18, 'square', 0.12), 40);
  }

  // Engine hum: one oscillator whose pitch follows the car's speed.
  setEngine(speedRatio, on) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.03;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1200;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 60 + speedRatio * 160;
      this.engineGain.gain.value = on ? 0.03 + speedRatio * 0.04 : 0;
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain.gain.value = 0.04;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.7; lfoGain.gain.value = 250;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null; this.sirenLfo = null;
    }
  }
}
