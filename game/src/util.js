// Port Verona — shared utilities.
// Plain helpers every other module uses. No dependencies, no DOM access here
// except the tiny $ / el helpers for the HUD.

(function () {
  'use strict';

  /** Clamp a number into [lo, hi]. */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Linear interpolation between a and b. */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Shortest signed angle difference from a to b (radians). */
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** Move angle a toward b by at most step radians. */
  function angleLerp(a, b, step) {
    const d = angleDiff(a, b);
    if (Math.abs(d) <= step) return b;
    return a + Math.sign(d) * step;
  }

  /** 2D distance between two {x, z} points. */
  function dist2(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** A small deterministic RNG (mulberry32) so the city layout is stable. */
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Random float in [lo, hi) from a rng. */
  function range(rng, lo, hi) {
    return lo + rng() * (hi - lo);
  }

  /** Pick one element of an array with a rng. */
  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  /** Format a money amount as $1,234. */
  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  /** Format game-clock hours (0..24) as "18:40". */
  function clock(h) {
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  /** Format seconds as M:SS. */
  function mmss(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** document.querySelector shorthand. */
  function $(sel) {
    return document.querySelector(sel);
  }

  /** Create an element with an optional class and text. */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  window.PV = window.PV || {};
  window.PV.util = {
    clamp: clamp,
    lerp: lerp,
    angleDiff: angleDiff,
    angleLerp: angleLerp,
    dist2: dist2,
    makeRng: makeRng,
    range: range,
    pick: pick,
    money: money,
    clock: clock,
    mmss: mmss,
    $: $,
    el: el,
  };
})();
