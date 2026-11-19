// Port Verona — the story: 10 missions, one arc.
// Dana Cole pulls the strings; Rico, Lena, Gus and Vex each open their own
// door. Missions are data: a list of steps (go to, pick up, deliver, chase,
// eliminate, race, escape, collect) that the runner checks against the live
// game state. Completing one pays cash and respect; respect gates the later
// missions and the garage's better cars.

(function () {
  'use strict';

  var U = window.PV.util;

  var MISSIONS = [
    {
      id: 'm01',
      title: 'First Wheels',
      giver: 'dana',
      brief: 'Every legend in Port Verona starts with a stolen car. Take any car on the street and bring it to Sunset Quay.',
      reward: 500,
      respect: 10,
      steps: [
        { type: 'inCar', label: 'Steal a car (press E near one)' },
        { type: 'goto', x: -320, z: 0, radius: 14, label: 'Drive to Sunset Quay' },
      ],
    },
    {
      id: 'm02',
      title: 'Quay Pickup',
      giver: 'rico',
      brief: 'A package is waiting at the quay. Grab it and deliver it to Meridian Tower. No scratches on the paint.',
      reward: 800,
      respect: 10,
      steps: [
        { type: 'goto', x: -320, z: 0, radius: 10, label: 'Pick up the package at the quay' },
        { type: 'goto', x: 0, z: -220, radius: 14, label: 'Deliver to Meridian Tower' },
      ],
    },
    {
      id: 'm03',
      title: 'Loud Neighbours',
      giver: 'gus',
      brief: 'Three rivals are muscling in on the plaza. Go remind them who runs this block. Fists or the Tempest — your call.',
      reward: 1200,
      respect: 15,
      steps: [
        { type: 'goto', x: 0, z: 0, radius: 16, label: 'Reach the central plaza' },
        { type: 'eliminate', count: 3, x: 0, z: 0, radius: 26, label: 'Deal with the rivals (0/3)' },
      ],
    },
    {
      id: 'm04',
      title: 'Midnight Circuit',
      giver: 'vex',
      brief: 'Vex wants to see if you can actually drive. Four checkpoints, two and a half minutes. Beat the clock.',
      reward: 1500,
      respect: 15,
      steps: [
        { type: 'race', time: 150, points: [
          { x: -320, z: -200 }, { x: 240, z: -200 }, { x: 240, z: 200 }, { x: -320, z: 200 },
        ], label: 'Hit every checkpoint' },
      ],
    },
    {
      id: 'm05',
      title: 'Sunset Heist',
      giver: 'dana',
      brief: 'The Falcon Astra GT is parked in the tower garage. Take it. The cops will notice — make sure they don\'t catch you.',
      reward: 2500,
      respect: 20,
      steps: [
        { type: 'goto', x: 0, z: -220, radius: 16, label: 'Reach the tower garage' },
        { type: 'inCar', kind: 'coupe', label: 'Take the Falcon Astra GT' },
        { type: 'escape', x: -320, z: 120, radius: 16, label: 'Lose the cops, get to the quay' },
      ],
    },
    {
      id: 'm06',
      title: 'Eyes on the Grid',
      giver: 'lena',
      brief: 'Lena hid four data drops around the city. Collect them all — the cameras are watching, so keep moving.',
      reward: 1800,
      respect: 15,
      steps: [
        { type: 'collect', count: 4, points: [
          { x: -240, z: 160 }, { x: 160, z: -120 }, { x: 240, z: 120 }, { x: -80, z: -260 },
        ], label: 'Collect the data drops (0/4)' },
      ],
    },
    {
      id: 'm07',
      title: 'Taxi for Trouble',
      giver: 'rico',
      brief: 'Rico\'s taxi is short a driver and the fares are piling up. Three passengers, four minutes, no complaints.',
      reward: 1600,
      respect: 15,
      steps: [
        { type: 'taxi', count: 3, time: 240, label: 'Drop off 3 passengers (0/3)' },
      ],
    },
    {
      id: 'm08',
      title: 'Roadblock Run',
      giver: 'lena',
      brief: 'Lena tripped every alarm in the district. Three stars and counting. Get to the hospital and shake the tail.',
      reward: 2200,
      respect: 20,
      steps: [
        { type: 'wanted', stars: 3, label: 'Get the heat up (cause some trouble)' },
        { type: 'escape', x: 180, z: -210, radius: 16, label: 'Reach the hospital and lose the cops' },
      ],
    },
    {
      id: 'm09',
      title: 'The Hawk Deal',
      giver: 'gus',
      brief: 'Gus is moving hardware at the docks and someone wants to crash the party. Five of them. Hold the line.',
      reward: 3000,
      respect: 20,
      steps: [
        { type: 'goto', x: -320, z: -60, radius: 16, label: 'Reach the docks' },
        { type: 'eliminate', count: 5, x: -320, z: -60, radius: 30, label: 'Hold the docks (0/5)' },
      ],
    },
    {
      id: 'm10',
      title: 'The Big One',
      giver: 'dana',
      brief: 'Meridian Tower. The vault. Four stars on your tail and the whole city watching. Get in, get out, and meet me at the quay. This is the one they\'ll talk about.',
      reward: 8000,
      respect: 40,
      steps: [
        { type: 'goto', x: 0, z: -220, radius: 14, label: 'Break into Meridian Tower' },
        { type: 'wanted', stars: 4, label: 'The alarm is up — heat is on' },
        { type: 'escape', x: -320, z: 0, radius: 16, label: 'Escape to Sunset Quay' },
      ],
    },
  ];

  var state = {
    index: 0, // next mission to start
    active: null, // { mission, step, stepState }
    done: [],
  };

  function current() {
    return state.active ? state.active.mission : null;
  }

  function start(index) {
    var m = MISSIONS[index];
    if (!m) return null;
    state.active = { mission: m, step: 0, stepState: {}, startedAt: Date.now() };
    state.index = index;
    return state.active;
  }

  function startNext() {
    if (state.index >= MISSIONS.length) return null;
    return start(state.index);
  }

  function step() {
    if (!state.active) return null;
    return state.active.mission.steps[state.active.step];
  }

  function advance() {
    state.active.step += 1;
    state.active.stepState = {};
    if (state.active.step >= state.active.mission.steps.length) {
      var done = state.active.mission;
      state.done.push(done.id);
      state.active = null;
      state.index += 1;
      return { complete: done };
    }
    return { next: step() };
  }

  /** Human-readable objective line for the HUD. */
  function objectiveText() {
    var s = step();
    if (!s) return state.index >= MISSIONS.length ? 'All missions complete — Port Verona is yours.' : 'No active mission.';
    var st = state.active.stepState;
    var label = s.label || '';
    if (s.type === 'eliminate' && st.kills !== undefined) label = label.replace(/\(\d+\/\d+\)/, '(' + st.kills + '/' + s.count + ')');
    if (s.type === 'collect' && st.got !== undefined) label = label.replace(/\(\d+\/\d+\)/, '(' + st.got + '/' + s.count + ')');
    if (s.type === 'taxi' && st.drops !== undefined) label = label.replace(/\(\d+\/\d+\)/, '(' + st.drops + '/' + s.count + ')');
    if (s.type === 'race' && st.point !== undefined) label += ' — checkpoint ' + (st.point + 1) + '/' + s.points.length;
    if (s.time && st.left !== undefined) label += ' — ' + U.mmss(st.left);
    return label;
  }

  /**
   * Tick the active mission against the live game snapshot.
   * ctx: { x, z, inCar, carKind, wanted, kills, collected, taxiDrops,
   *        spawnEnemies(x,z,n), spawnCollectibles(points), spawnTaxiFare() }
   * Returns 'advanced' | 'complete' | 'failed' | null.
   */
  function update(dt, ctx) {
    if (!state.active) return null;
    var s = step();
    var st = state.active.stepState;
    if (!s) return null;

    if (s.time && st.left === undefined) st.left = s.time;
    if (s.time) {
      st.left -= dt;
      if (st.left <= 0) {
        state.active = null;
        return 'failed';
      }
    }

    switch (s.type) {
      case 'goto':
      case 'escape':
      case 'pickup':
      case 'deliver': {
        var d = U.dist2(ctx.x, ctx.z, s.x, s.z);
        if (s.type === 'escape' && ctx.wanted > 0) {
          // Must be at the marker AND have lost the heat.
          if (d < s.radius) return null;
        } else if (d < s.radius) {
          if (s.type === 'escape' && ctx.wanted > 0) return null;
          var r = advance();
          return r.complete ? 'complete' : 'advanced';
        }
        break;
      }
      case 'inCar': {
        if (ctx.inCar && (!s.kind || ctx.carKind === s.kind)) {
          var r2 = advance();
          return r2.complete ? 'complete' : 'advanced';
        }
        break;
      }
      case 'eliminate': {
        if (st.spawned === undefined) {
          st.spawned = true;
          st.base = ctx.kills || 0;
          st.kills = 0;
          if (ctx.spawnEnemies) ctx.spawnEnemies(s.x, s.z, s.count);
        }
        st.kills = (ctx.kills || 0) - (st.base || 0);
        if (st.kills >= s.count) {
          var r3 = advance();
          return r3.complete ? 'complete' : 'advanced';
        }
        break;
      }
      case 'collect': {
        if (st.spawned === undefined) {
          st.spawned = true;
          st.got = 0;
          if (ctx.spawnCollectibles) ctx.spawnCollectibles(s.points);
        }
        st.got = ctx.collected || 0;
        if (st.got >= s.count) {
          var r4 = advance();
          return r4.complete ? 'complete' : 'advanced';
        }
        break;
      }
      case 'race': {
        if (st.point === undefined) st.point = 0;
        var p = s.points[st.point];
        if (p && U.dist2(ctx.x, ctx.z, p.x, p.z) < 16) {
          st.point += 1;
          if (st.point >= s.points.length) {
            var r5 = advance();
            return r5.complete ? 'complete' : 'advanced';
          }
        }
        break;
      }
      case 'taxi': {
        if (st.spawned === undefined) {
          st.spawned = true;
          st.drops = 0;
          if (ctx.spawnTaxiFare) ctx.spawnTaxiFare();
        }
        st.drops = ctx.taxiDrops || 0;
        if (st.drops >= s.count) {
          var r6 = advance();
          return r6.complete ? 'complete' : 'advanced';
        }
        break;
      }
      case 'wanted': {
        if (ctx.wanted >= s.stars) {
          var r7 = advance();
          return r7.complete ? 'complete' : 'advanced';
        }
        break;
      }
      default:
        break;
    }
    return null;
  }

  /** Marker position for the current step (for the minimap + beacon). */
  function marker() {
    var s = step();
    if (!s) return null;
    if (s.x !== undefined) return { x: s.x, z: s.z, radius: s.radius || 12 };
    if (s.type === 'race' && s.points) {
      var st = state.active.stepState;
      var p = s.points[st.point || 0];
      return p ? { x: p.x, z: p.z, radius: 16 } : null;
    }
    if (s.type === 'collect' && s.points) {
      return { x: s.points[0].x, z: s.points[0].z, radius: 10 };
    }
    return null;
  }

  function reset() {
    state.index = 0;
    state.active = null;
    state.done = [];
  }

  window.PV = window.PV || {};
  window.PV.missions = {
    list: MISSIONS,
    state: state,
    current: current,
    start: start,
    startNext: startNext,
    step: step,
    update: update,
    marker: marker,
    objectiveText: objectiveText,
    reset: reset,
  };
})();
