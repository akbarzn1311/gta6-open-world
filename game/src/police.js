// Port Verona — the wanted system and police dispatch.
// Stars 1–5. Heat rises with crimes (carjacking, assault, speeding through a
// chase) and falls when the player stays out of sight. Dispatch escalates:
// 1–2 stars: patrol cars chase. 3 stars: roadblocks join in. 4–5 stars: the
// helicopter (SKY-1) tracks from above. Get busted (a cop touches you on
// foot, or your car is boxed in at low speed) and you lose cash and the
// mission step resets.

(function () {
  'use strict';

  var U = window.PV.util;

  var UNITS = ['OSPREY-11', 'COBRA-25', 'MAKO-18', 'RHINO-45', 'EAGLE-07'];
  var HELI_UNIT = 'SKY-1';

  var state = {
    stars: 0,
    heat: 0, // 0..100 within the current star level
    hiddenTimer: 0,
    bustedTimer: 0,
  };

  var policeCars = [];
  var heli = null;
  var heliMesh = null;
  var roadblocks = [];
  var sceneRef = null;
  var spawnTimer = 0;
  var sirenOn = false;

  /** Heat added per crime. */
  var CRIME_HEAT = {
    carjack: 34,
    assault: 22,
    shooting: 40,
    kill: 30,
    speeding: 4,
    hitPed: 26,
  };

  function addHeat(kind, amount) {
    var add = amount !== undefined ? amount : CRIME_HEAT[kind] || 10;
    state.heat += add;
    while (state.heat >= 100 && state.stars < 5) {
      state.heat -= 100;
      state.stars += 1;
      onStarUp();
    }
    if (state.stars >= 5) state.heat = Math.min(state.heat, 99);
  }

  function setStars(n) {
    var target = U.clamp(n, 0, 5);
    while (state.stars < target) {
      state.stars += 1;
      onStarUp();
    }
    if (target < state.stars) {
      state.stars = target;
      state.heat = 0;
    }
  }

  function onStarUp() {
    if (window.PV.hud) window.PV.hud.flash('WANTED LEVEL ' + state.stars + ' — ' + dispatchLine());
  }

  function dispatchLine() {
    if (state.stars <= 2) return 'patrol units responding';
    if (state.stars === 3) return 'roadblocks on Paseo del Mar';
    return HELI_UNIT + ' overhead — nowhere to hide';
  }

  function wantedCarCount() {
    return state.stars <= 1 ? 1 : state.stars === 2 ? 2 : state.stars === 3 ? 3 : 4;
  }

  function spawnPoliceCar(playerPos, dist) {
    var a = Math.random() * Math.PI * 2;
    var d = dist !== undefined ? dist + Math.random() * 10 : 55 + Math.random() * 30;
    var x = U.clamp(playerPos.x + Math.cos(a) * d, -330, 330);
    var z = U.clamp(playerPos.z + Math.sin(a) * d, -330, 330);
    var unit = UNITS[policeCars.length % UNITS.length];
    var car = window.PV.vehicles.spawnCar('police', 0x1c2733, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 'police');
    car.unit = unit;
    car.policeInput = { forward: true };
    policeCars.push(car);
    return car;
  }

  function spawnHeli(scene, playerPos) {
    if (heliMesh) return;
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.4), bodyMat);
    g.add(body);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5), bodyMat);
    tail.position.set(0, 0.3, -5.2);
    g.add(tail);
    var rotorMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), rotorMat);
    rotor.position.y = 1.1;
    g.add(rotor);
    g.userData.rotor = rotor;
    var light = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    light.position.y = -0.9;
    g.add(light);
    g.position.set(playerPos.x + 20, 42, playerPos.z - 20);
    scene.add(g);
    heliMesh = g;
    heli = { mesh: g, x: g.position.x, z: g.position.z, y: 42, angle: 0 };
  }

  function removeHeli() {
    if (heliMesh && sceneRef) sceneRef.remove(heliMesh);
    heliMesh = null;
    heli = null;
  }

  function spawnRoadblock(playerPos) {
    // A line of two police cars across the road ahead of the player.
    var ahead = { x: playerPos.x, z: playerPos.z };
    for (var i = 0; i < 2; i++) {
      var car = window.PV.vehicles.spawnCar('police', 0x1c2733, ahead.x + (i === 0 ? -4 : 4), ahead.z + 18, 0, 'police');
      car.unit = 'ROADBLOCK';
      car.roadblock = true;
      car.policeInput = { forward: false };
      roadblocks.push(car);
    }
  }

  function clearRoadblocks() {
    roadblocks.forEach(function (c) {
      window.PV.vehicles.removeCar(c);
      var i = policeCars.indexOf(c);
      if (i >= 0) policeCars.splice(i, 1);
    });
    roadblocks = [];
  }

  /** Staging helper for screenshots: spawn the full dispatch at once. */
  function stage(playerPos, dist) {
    var want = wantedCarCount();
    for (var i = 0; i < want; i++) spawnPoliceCar(playerPos, dist);
    if (state.stars >= 4) spawnHeli(sceneRef, playerPos);
  }

  function init(scene) {
    sceneRef = scene;
    policeCars = [];
    roadblocks = [];
    state.stars = 0;
    state.heat = 0;
    state.hiddenTimer = 0;
  }

  /**
   * Chase steering: point a police car at the player, ram when close.
   * Returns the drive input for the car.
   */
  function chaseInput(car, target, dt) {
    var dx = target.x - car.x;
    var dz = target.z - car.z;
    var want = Math.atan2(dx, dz);
    var diff = U.angleDiff(car.heading, want);
    var input = { forward: true, back: false, left: false, right: false };
    if (Math.abs(diff) > 0.35) {
      if (diff > 0) input.left = true;
      else input.right = true;
    }
    if (Math.abs(diff) > 2.4) input.back = true;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3.2) input.forward = false; // ram: stop pushing, we are on them
    return input;
  }

  /**
   * Tick the wanted system.
   * ctx: { x, z, inCar, speed, onFoot, dt, wantedVisible (police can see player) }
   * Returns 'busted' when the player is caught, else null.
   */
  function update(dt, ctx) {
    if (state.stars === 0 && state.heat === 0) {
      window.PV.audio.setSiren(false);
      sirenOn = false;
      return null;
    }
    spawnTimer -= dt;

    // Keep the right number of patrol cars.
    var want = state.stars > 0 ? wantedCarCount() : 0;
    var active = policeCars.filter(function (c) { return !c.roadblock; });
    if (active.length < want && spawnTimer <= 0) {
      spawnPoliceCar(ctx);
      spawnTimer = 2.5;
    }
    if (active.length > want) {
      var extra = active[active.length - 1];
      window.PV.vehicles.removeCar(extra);
      policeCars.splice(policeCars.indexOf(extra), 1);
    }

    // Roadblocks at 3+ stars, helicopter at 4+.
    if (state.stars >= 3 && roadblocks.length === 0 && spawnTimer <= -4) {
      spawnRoadblock(ctx);
      spawnTimer = 2.5;
    }
    if (state.stars >= 4 && !heli) spawnHeli(sceneRef, ctx);
    if (state.stars < 4 && heli) removeHeli();

    // Siren while any unit is out.
    var shouldSiren = policeCars.length > 0 || !!heli;
    if (shouldSiren !== sirenOn) {
      window.PV.audio.setSiren(shouldSiren);
      sirenOn = shouldSiren;
    }

    // Chase.
    policeCars.forEach(function (car) {
      if (car.roadblock) return;
      car.policeInput = chaseInput(car, ctx, dt);
      // Ram damage: touching the player car slows and damages it.
      var d = U.dist2(car.x, car.z, ctx.x, ctx.z);
      if (d < 3.4 && ctx.inCar && ctx.playerCar) {
        ctx.playerCar.health -= 14 * dt;
        ctx.playerCar.speed *= 1 - 0.4 * dt;
      }
    });

    // Helicopter circles and keeps the player lit.
    if (heli) {
      heli.angle += dt * 0.5;
      heli.x = ctx.x + Math.cos(heli.angle) * 26;
      heli.z = ctx.z + Math.sin(heli.angle) * 26;
      heli.mesh.position.set(heli.x, heli.y + Math.sin(performance.now() * 0.002) * 1.5, heli.z);
      heli.mesh.rotation.y = Math.atan2(ctx.x - heli.x, ctx.z - heli.z);
      heli.mesh.userData.rotor.rotation.y += dt * 22;
      state.hiddenTimer = 0; // the heli never loses you
    }

    // Heat decay: hidden from every unit, the trail goes cold.
    var nearest = 999;
    policeCars.forEach(function (car) {
      nearest = Math.min(nearest, U.dist2(car.x, car.z, ctx.x, ctx.z));
    });
    if (nearest > 70 && !heli) {
      state.hiddenTimer += dt;
      if (state.hiddenTimer > 6) {
        state.stars = Math.max(0, state.stars - 1);
        state.heat = 0;
        state.hiddenTimer = 0;
        clearRoadblocks();
        if (state.stars === 0) {
          window.PV.audio.setSiren(false);
          sirenOn = false;
        }
      }
    } else {
      state.hiddenTimer = 0;
    }

    // Busted on foot: a cop car within 2.2m catches you.
    if (!ctx.inCar) {
      for (var i = 0; i < policeCars.length; i++) {
        if (U.dist2(policeCars[i].x, policeCars[i].z, ctx.x, ctx.z) < 2.2) {
          return 'busted';
        }
      }
    }
    // Busted in a boxed-in car: speed near zero with a cop touching for 3s.
    if (ctx.inCar && ctx.playerCar) {
      var touching = policeCars.some(function (c) { return U.dist2(c.x, c.z, ctx.x, ctx.z) < 3.4; });
      if (touching && Math.abs(ctx.playerCar.speed) < 1) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 3) return 'busted';
      } else {
        state.bustedTimer = 0;
      }
    }
    return null;
  }

  function onBusted() {
    var fine = Math.min(500, 200 + state.stars * 100);
    state.stars = 0;
    state.heat = 0;
    state.hiddenTimer = 0;
    state.bustedTimer = 0;
    clearRoadblocks();
    policeCars.slice().forEach(function (c) { window.PV.vehicles.removeCar(c); });
    policeCars = [];
    removeHeli();
    window.PV.audio.setSiren(false);
    sirenOn = false;
    window.PV.audio.busted();
    return fine;
  }

  function clearAll() {
    policeCars.slice().forEach(function (c) { window.PV.vehicles.removeCar(c); });
    policeCars = [];
    clearRoadblocks();
    removeHeli();
    state.stars = 0;
    state.heat = 0;
    window.PV.audio.setSiren(false);
    sirenOn = false;
  }

  window.PV = window.PV || {};
  window.PV.police = {
    state: state,
    init: init,
    update: update,
    addHeat: addHeat,
    setStars: setStars,
    onBusted: onBusted,
    clearAll: clearAll,
    stage: stage,
    units: UNITS,
    heliUnit: HELI_UNIT,
    policeCars: function () { return policeCars; },
  };
})();
