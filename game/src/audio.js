// Port Verona — procedural audio.
// Everything is synthesized with WebAudio: no audio files, no network.
// Three radio stations are little step-sequencer loops; engine, siren and
// gunfire are oscillators and noise. Audio starts on the first user gesture
// (browsers block audio before that) and can be muted with M.

(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var musicGain = null;
  var muted = false;
  var radioTimer = null;
  var radioStep = 0;
  var engineOsc = null;
  var engineGain = null;
  var sirenOscA = null;
  var sirenOscB = null;
  var sirenGain = null;

  // Station definitions: name, tempo (steps per minute), a bass line and a
  // lead line as scale-degree patterns, plus the waveform flavour.
  var STATIONS = [
    {
      name: 'Palma FM 98.1',
      tag: 'sunset pop',
      bpm: 112,
      wave: 'triangle',
      bass: [0, 0, 7, 0, 5, 0, 7, 10],
      lead: [12, 0, 14, 12, 10, 12, 14, 17, 15, 14, 12, 10, 12, 0, 7, 10],
      root: 220,
    },
    {
      name: 'Meridian Talk',
      tag: 'talk & news',
      bpm: 90,
      wave: 'sine',
      bass: [0, 0, 0, 0, 5, 0, 3, 0],
      lead: [0, 12, 0, 10, 0, 7, 0, 12, 0, 14, 0, 12, 0, 10, 0, 7],
      root: 196,
    },
    {
      name: 'Sunset Rock',
      tag: 'guitar drive',
      bpm: 132,
      wave: 'sawtooth',
      bass: [0, 0, 12, 0, 10, 0, 7, 0],
      lead: [12, 12, 15, 12, 17, 15, 14, 12, 10, 12, 14, 17, 19, 17, 15, 14],
      root: 164.81,
    },
  ];

  var SEMITONE = Math.pow(2, 1 / 12);

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function noteFreq(root, semitones) {
    return root * Math.pow(SEMITONE, semitones);
  }

  function blip(freq, dur, type, vol, when) {
    if (!ensure()) return;
    var t = when || ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure()) return;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  /** One radio step: bass + lead note for the current station. */
  function radioTick(station) {
    if (!ctx) return;
    var st = STATIONS[station];
    var stepDur = 60 / st.bpm / 2;
    var now = ctx.currentTime;
    var bassNote = st.bass[radioStep % st.bass.length];
    var leadNote = st.lead[radioStep % st.lead.length];
    if (bassNote > 0) blip(noteFreq(st.root / 2, bassNote), stepDur * 1.8, 'sine', 0.5, now);
    if (leadNote > 0) blip(noteFreq(st.root, leadNote), stepDur * 0.9, st.wave, 0.22, now);
    if (radioStep % 4 === 0) noiseBurst(0.05, 0.08, 4000); // hat tick
    radioStep += 1;
    radioTimer = setTimeout(function () {
      radioTick(station);
    }, stepDur * 1000);
  }

  function startRadio(station) {
    if (!ensure()) return;
    stopRadio();
    radioStep = 0;
    radioTick(station);
  }

  function stopRadio() {
    if (radioTimer) {
      clearTimeout(radioTimer);
      radioTimer = null;
    }
  }

  function setEngine(rpm, on) {
    if (!ensure()) return;
    if (!on) {
      if (engineGain) engineGain.gain.value = 0;
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      engineOsc.connect(f);
      f.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.value = 55 + rpm * 140;
    engineGain.gain.value = 0.05 + rpm * 0.05;
  }

  function setSiren(on) {
    if (!ensure()) return;
    if (!on) {
      if (sirenGain) sirenGain.gain.value = 0;
      return;
    }
    if (!sirenOscA) {
      sirenOscA = ctx.createOscillator();
      sirenOscA.type = 'sine';
      sirenOscA.frequency.value = 720;
      sirenOscB = ctx.createOscillator();
      sirenOscB.type = 'sine';
      sirenOscB.frequency.value = 960;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOscA.connect(sirenGain);
      sirenOscB.connect(sirenGain);
      sirenGain.connect(master);
      sirenOscA.start();
      sirenOscB.start();
      // Alternate the two tones like a two-tone siren.
      setInterval(function () {
        if (!sirenGain || sirenGain.gain.value === 0) return;
        var a = sirenOscA.frequency.value;
        sirenOscA.frequency.value = a === 720 ? 520 : 720;
        sirenOscB.frequency.value = a === 720 ? 760 : 960;
      }, 420);
    }
    sirenGain.gain.value = 0.045;
  }

  function shot() {
    noiseBurst(0.16, 0.5, 900);
    blip(160, 0.08, 'square', 0.25);
  }

  function punch() {
    noiseBurst(0.09, 0.35, 500);
  }

  function pickup() {
    blip(660, 0.1, 'sine', 0.25);
    setTimeout(function () { blip(990, 0.14, 'sine', 0.25); }, 90);
  }

  function missionDone() {
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.22, 'triangle', 0.3); }, i * 130);
    });
  }

  function busted() {
    [392, 330, 262].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.3, 'sawtooth', 0.2); }, i * 200);
    });
  }

  function click() {
    blip(880, 0.05, 'square', 0.12);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.55;
    return muted;
  }

  window.PV = window.PV || {};
  window.PV.audio = {
    stations: STATIONS,
    resume: resume,
    startRadio: startRadio,
    stopRadio: stopRadio,
    setEngine: setEngine,
    setSiren: setSiren,
    shot: shot,
    punch: punch,
    pickup: pickup,
    missionDone: missionDone,
    busted: busted,
    click: click,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
  };
})();
