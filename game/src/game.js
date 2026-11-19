// Port Verona — the game itself.
// Third-person open world: on foot or by car, one city, one story. This file
// owns the main loop, the player, the camera, pedestrians, collectibles,
// taxi fares, the garage, the weather and clock, and the state machine
// (menu → playing → paused / busted / wasted / complete). Every other module
// plugs in here; nothing in this file reaches into another module's internals
// except through its public surface.

(function () {
  'use strict';

  var U = window.PV.util;

  var scene = null;
  var camera = null;
  var renderer = null;
  var clock = null;
  var running = false;
  var lastT = 0;

  var playerMesh = null;
  var player = {
    x: 0, z: 0, heading: 0, speed: 0, onFoot: true,
  };
  var cameraYaw = 0;
  var cameraPitch = 0.42;
  var cameraDist = 9;

  var keys = {};
  var mouseDown = false;
  var mouseDX = 0;
  var mouseDY = 0;

  var state = {
    mode: 'menu', // menu | playing | paused | busted | wasted | complete
    cash: 1200,
    respect: 0,
    health: 100,
    armor: 0,
    wanted: 0,
    hour: 17.4, // golden hour at the start
    weather: 'sunset',
    radio: 0,
    upgrades: { engine: 0, armor: 0 },
    inCar: false,
    carName: '',
    x: 0,
    z: 0,
    heading: 0,
  };

  var peds = [];
  var collectibles = [];
  var taxiFare = null;
  var taxiPassenger = null;
  var weatherTimer = 90;
  var missionBannerTimer = 0;
  var garagePanel = null;
  var playerCar = null;
  var carSpawnedFalcon = false;

  var WEATHERS = ['clear', 'clear', 'sunset', 'rain', 'fog'];

  function makePlayerMesh() {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    var shirt = new THREE.MeshLambertMaterial({ color: 0x2e5f8a });
    var pants = new THREE.MeshLambertMaterial({ color: 0x22242a });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), shirt);
    body.position.y = 1.08;
    g.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
    head.position.y = 1.82;
    g.add(head);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
    hair.position.y = 2.08;
    g.add(hair);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.3), pants);
    legL.position.set(-0.19, 0.31, 0);
    g.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.19;
    g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), shirt);
    armL.position.set(-0.48, 1.15, 0);
    g.add(armL);
    var armR = armL.clone();
    armR.position.x = 0.48;
    g.add(armR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.armL = armL;
    g.userData.armR = armR;
    return g;
  }

  function makePedMesh(color) {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
    var shirt = new THREE.MeshLambertMaterial({ color: color });
    var pants = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.4), shirt);
    body.position.y = 1.02;
    g.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 1.72;
    g.add(head);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.58, 0.28), pants);
    legL.position.set(-0.17, 0.29, 0);
    g.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.17;
    g.add(legR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    return g;
  }

  function spawnPeds(count) {
    var rng = U.makeRng(99);
    var colors = [0xd95f4b, 0x4b8ad9, 0x6abf6a, 0xd9b84b, 0x9b59b6, 0xe0e0e0];
    // Pedestrians walk the sidewalks: on a road line, offset to the kerb.
    var half = window.PV.city.half;
    var pitch = (half * 2 - 14) / 9;
    for (var i = 0; i < count; i++) {
      var mesh = makePedMesh(colors[i % colors.length]);
      var line = -half + Math.floor(rng() * 10) * pitch + 7;
      var along = U.range(rng, -half + 20, half - 20);
      var side = rng() < 0.5 ? -1 : 1;
      var x, z;
      if (rng() < 0.5) {
        x = line + side * 10;
        z = along;
      } else {
        x = along;
        z = line + side * 10;
      }
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      peds.push({
        mesh: mesh, x: x, z: z,
        heading: rng() * Math.PI * 2,
        speed: 1.2 + rng() * 0.8,
        target: null,
        panic: 0,
        phase: rng() * 10,
      });
    }
  }

  function pedTarget(p) {
    // NPC schedules: days at the plaza and shops, nights down at the quay.
    var night = state.hour < 6 || state.hour >= 19;
    var cx = night ? -300 + Math.random() * 40 : (Math.random() - 0.5) * 240;
    var cz = night ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 240;
    return { x: cx, z: cz };
  }

  function updatePeds(dt) {
    peds.forEach(function (p) {
      if (p.panic > 0) {
        p.panic -= dt;
        // Run away from the player.
        var dx = p.x - player.x;
        var dz = p.z - player.z;
        var d = Math.sqrt(dx * dx + dz * dz) || 1;
        p.x += (dx / d) * 4.5 * dt;
        p.z += (dz / d) * 4.5 * dt;
        p.heading = Math.atan2(dx, dz);
      } else {
        if (!p.target) p.target = pedTarget(p);
        var tx = p.target.x - p.x;
        var tz = p.target.z - p.z;
        var td = Math.sqrt(tx * tx + tz * tz);
        if (td < 2) {
          p.target = null;
        } else {
          p.x += (tx / td) * p.speed * dt;
          p.z += (tz / td) * p.speed * dt;
          p.heading = U.angleLerp(p.heading, Math.atan2(tx, tz), dt * 4);
        }
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      var bob = Math.abs(Math.sin(performance.now() * 0.009 + p.phase)) * 0.05;
      p.mesh.position.y = bob;
      p.mesh.userData.legL.rotation.x = Math.sin(performance.now() * 0.009 + p.phase) * 0.5;
      p.mesh.userData.legR.rotation.x = -Math.sin(performance.now() * 0.009 + p.phase) * 0.5;
    });
  }

  function panicNearby(x, z, radius) {
    peds.forEach(function (p) {
      if (U.dist2(p.x, p.z, x, z) < radius) p.panic = 3 + Math.random() * 2;
    });
  }

  function spawnCollectibles(points) {
    clearCollectibles();
    points.forEach(function (pt) {
      var mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x8a6d00, emissiveIntensity: 0.7 })
      );
      mesh.position.set(pt.x, 1.2, pt.z);
      scene.add(mesh);
      collectibles.push({ mesh: mesh, x: pt.x, z: pt.z, taken: false });
    });
  }

  function clearCollectibles() {
    collectibles.forEach(function (c) { scene.remove(c.mesh); });
    collectibles = [];
  }

  function spawnTaxiFare() {
    var rng = Math.random;
    var px = U.clamp(player.x + (rng() - 0.5) * 160, -300, 300);
    var pz = U.clamp(player.z + (rng() - 0.5) * 160, -300, 300);
    var dest = { x: U.clamp(player.x + (rng() - 0.5) * 400, -300, 300), z: U.clamp(player.z + (rng() - 0.5) * 400, -300, 300) };
    taxiFare = { px: px, pz: pz, dx: dest.x, dz: dest.z, picked: false, marker: null };
    var mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16),
      new THREE.MeshBasicMaterial({ color: 0xf7dc3a, transparent: true, opacity: 0.7 })
    );
    mesh.position.set(px, 0.4, pz);
    scene.add(mesh);
    taxiFare.marker = mesh;
    window.PV.hud.message('Taxi fare waiting — drive over the yellow marker');
  }

  function updateTaxi(dt) {
    if (!taxiFare) return;
    if (!taxiFare.picked) {
      if (state.inCar && U.dist2(player.x, player.z, taxiFare.px, taxiFare.pz) < 4) {
        taxiFare.picked = true;
        scene.remove(taxiFare.marker);
        var mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16),
          new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.7 })
        );
        mesh.position.set(taxiFare.dx, 0.4, taxiFare.dz);
        scene.add(mesh);
        taxiFare.marker = mesh;
        window.PV.hud.message('Passenger aboard — take them to the green marker');
      }
    } else if (U.dist2(player.x, player.z, taxiFare.dx, taxiFare.dz) < 4) {
      scene.remove(taxiFare.marker);
      taxiFare = null;
      state.cash += 220;
      window.PV.hud.flash('Fare complete +$220');
      window.PV.audio.pickup();
      state.taxiDrops = (state.taxiDrops || 0) + 1;
      var m = window.PV.missions.step();
      if (m && m.type === 'taxi' && (state.taxiDrops || 0) < m.count) spawnTaxiFare();
    }
  }

  function damage(amount) {
    var absorbed = Math.min(state.armor, amount * 0.6);
    state.armor -= absorbed;
    state.health -= (amount - absorbed);
    if (state.health <= 0) {
      state.health = 0;
      onWasted();
    }
  }

  function onWasted() {
    if (state.mode !== 'playing') return;
    state.mode = 'wasted';
    window.PV.police.clearAll();
    window.PV.audio.busted();
    var lost = Math.min(state.cash, 300);
    state.cash -= lost;
    window.PV.hud.showEnd('WASTED', 'You lost $' + lost + ' at the hospital. Port Verona is still yours to take.', respawn);
  }

  function onBusted() {
    if (state.mode !== 'playing') return;
    state.mode = 'busted';
    var fine = window.PV.police.onBusted();
    state.cash = Math.max(0, state.cash - fine);
    exitCar();
    teleport(180, -210); // hospital
    window.PV.hud.showEnd('BUSTED', 'The VCPD took $' + fine + ' in fines. You walk out of the hospital a free person.', function () {
      state.mode = 'playing';
    });
  }

  function respawn() {
    state.health = 100;
    state.armor = state.upgrades.armor * 25;
    teleport(180, -210);
    state.mode = 'playing';
  }

  function teleport(x, z) {
    player.x = x;
    player.z = z;
    state.x = x;
    state.z = z;
    playerMesh.position.set(x, 0, z);
    cameraYaw = player.heading;
  }

  function enterCar(car) {
    var wasOccupied = car.driver !== 'none';
    if (wasOccupied) {
      window.PV.police.addHeat('carjack');
      panicNearby(car.x, car.z, 20);
      window.PV.hud.flash('Carjacked! The owner ran for it.');
    }
    car.driver = 'player';
    playerCar = car;
    state.inCar = true;
    state.carName = car.kind === 'coupe' ? 'Falcon Astra GT' : car.kind === 'police' ? 'VCPD Interceptor' : car.kind + '';
    playerMesh.visible = false;
    window.PV.audio.setEngine(0.1, true);
    return true;
  }

  function exitCar() {
    if (!playerCar) return;
    playerCar.driver = 'none';
    var bx = playerCar.x - Math.sin(playerCar.heading + Math.PI / 2) * 3;
    var bz = playerCar.z - Math.cos(playerCar.heading + Math.PI / 2) * 3;
    player.x = bx;
    player.z = bz;
    player.heading = playerCar.heading;
    playerMesh.visible = true;
    playerMesh.position.set(bx, 0, bz);
    playerCar = null;
    state.inCar = false;
    state.carName = '';
    window.PV.audio.setEngine(0, false);
  }

  function tryEnterCar() {
    if (state.inCar) {
      exitCar();
      return;
    }
    var car = window.PV.vehicles.nearestCar(player.x, player.z, 4.5, true);
    if (car) enterCar(car);
  }

  /** Staging helper for screenshots: put the player in a fresh car. */
  function stageCar(kind, color, x, z, heading, speed) {
    var car = window.PV.vehicles.spawnCar(kind, color, x, z, heading, 'none');
    player.x = x;
    player.z = z;
    player.heading = heading;
    enterCar(car);
    car.speed = speed || 0;
    return car;
  }

  function garageMenu(open) {
    if (!garagePanel) {
      garagePanel = document.createElement('div');
      garagePanel.id = 'garage-panel';
      garagePanel.className = 'garage-panel';
      document.getElementById('game-root').appendChild(garagePanel);
    }
    if (!open) {
      garagePanel.style.display = 'none';
      return;
    }
    var items = [
      { key: 'engine', name: 'Engine tune', cost: 1500, level: state.upgrades.engine, max: 3, desc: '+22% top speed each' },
      { key: 'armor', name: 'Armour plating', cost: 1200, level: state.upgrades.armor, max: 3, desc: '+25 armour each' },
    ];
    var html = '<div class="garage-title">SUNSET QUAY GARAGE — Rico\'s shop</div>';
    items.forEach(function (it) {
      var maxed = it.level >= it.max;
      var afford = state.cash >= it.cost;
      html += '<div class="garage-item"><span>' + it.name + ' Lv ' + it.level + '/' + it.max + ' — ' + it.desc + '</span>' +
        '<button data-buy="' + it.key + '" ' + (maxed || !afford ? 'disabled' : '') + '>' +
        (maxed ? 'MAXED' : 'Buy $' + it.cost) + '</button></div>';
    });
    html += '<div class="garage-item"><span>Paint job — Falcon red</span><button data-buy="paint" ' + (state.cash < 400 ? 'disabled' : '') + '>Buy $400</button></div>';
    html += '<button class="garage-close" data-close="1">Close [G]</button>';
    garagePanel.innerHTML = html;
    garagePanel.style.display = 'block';
    garagePanel.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute('data-buy');
        if (key === 'paint') {
          if (state.cash >= 400 && playerCar) {
            state.cash -= 400;
            playerCar.mesh.children[0].material.color.setHex(0xc0392b);
            window.PV.audio.pickup();
          }
          garageMenu(true);
          return;
        }
        var cost = key === 'engine' ? 1500 : 1200;
        if (state.cash >= cost && state.upgrades[key] < 3) {
          state.cash -= cost;
          state.upgrades[key] += 1;
          if (key === 'armor') state.armor = state.upgrades.armor * 25;
          window.PV.audio.pickup();
          window.PV.hud.flash('Upgrade installed — ' + key + ' Lv ' + state.upgrades[key]);
        }
        garageMenu(true);
      };
    });
    var closeBtn = garagePanel.querySelector('[data-close]');
    if (closeBtn) closeBtn.onclick = function () { garageMenu(false); };
  }

  function nearGarage() {
    var g = window.PV.game.landmarks.garage;
    return U.dist2(player.x, player.z, g.x, g.z) < 14;
  }

  function updatePlayer(dt) {
    var input = {
      forward: keys['KeyW'] || keys['ArrowUp'],
      back: keys['KeyS'] || keys['ArrowDown'],
      left: keys['KeyA'] || keys['ArrowLeft'],
      right: keys['KeyD'] || keys['ArrowRight'],
    };
    if (state.inCar && playerCar) {
      window.PV.vehicles.driveStep(playerCar, input, dt, state.upgrades);
      player.x = playerCar.x;
      player.z = playerCar.z;
      player.heading = playerCar.heading;
      window.PV.audio.setEngine(U.clamp(Math.abs(playerCar.speed) / 40, 0, 1), true);
      if (Math.abs(playerCar.speed) > 30) window.PV.police.addHeat('speeding', 0.6 * dt);
      if (playerCar.health <= 0) {
        window.PV.hud.flash('Your car is wrecked — get out!');
        var wreck = playerCar;
        exitCar();
        window.PV.vehicles.removeCar(wreck);
      }
    } else {
      // On foot: camera-relative movement, walk speed 6 m/s, sprint 9 with Shift.
      var speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 9 : 6;
      var mx = 0;
      var mz = 0;
      if (input.forward) { mx += Math.sin(cameraYaw); mz += Math.cos(cameraYaw); }
      if (input.back) { mx -= Math.sin(cameraYaw); mz -= Math.cos(cameraYaw); }
      if (input.left) { mx -= Math.cos(cameraYaw); mz += Math.sin(cameraYaw); }
      if (input.right) { mx += Math.cos(cameraYaw); mz -= Math.sin(cameraYaw); }
      var len = Math.sqrt(mx * mx + mz * mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        var nx = player.x + mx * speed * dt;
        var nz = player.z + mz * speed * dt;
        var fixed = window.PV.city.resolveCollision(nx, nz, 0.6);
        player.x = fixed.x;
        player.z = fixed.z;
        player.heading = U.angleLerp(player.heading, Math.atan2(mx, mz), dt * 10);
        player.speed = speed;
        var bob = Math.sin(performance.now() * 0.012) * 0.5;
        playerMesh.userData.legL.rotation.x = bob;
        playerMesh.userData.legR.rotation.x = -bob;
        playerMesh.userData.armL.rotation.x = -bob * 0.6;
        playerMesh.userData.armR.rotation.x = bob * 0.6;
      } else {
        player.speed = 0;
        playerMesh.userData.legL.rotation.x = 0;
        playerMesh.userData.legR.rotation.x = 0;
        playerMesh.userData.armL.rotation.x = 0;
        playerMesh.userData.armR.rotation.x = 0;
      }
      playerMesh.position.set(player.x, 0, player.z);
      playerMesh.rotation.y = player.heading;
    }
    state.x = player.x;
    state.z = player.z;
    state.heading = player.heading;
  }

  /** Snap the camera to its exact follow position (no lerp) — used by
   *  screenshot staging so the frame is composed the moment it is taken. */
  function snapCamera() {
    var target = state.inCar && playerCar
      ? { x: playerCar.x, y: 1.4, z: playerCar.z, heading: playerCar.heading }
      : { x: player.x, y: 1.6, z: player.z, heading: player.heading };
    var yaw = state.inCar ? player.heading : cameraYaw;
    var dist = state.inCar ? cameraDist + 3 : cameraDist;
    camera.position.set(
      target.x - Math.sin(yaw) * dist,
      target.y + Math.sin(cameraPitch) * dist * 0.9 + 2.2,
      target.z - Math.cos(yaw) * dist
    );
    camera.lookAt(target.x, target.y + 0.6, target.z);
  }

  function updateCamera(dt) {
    var target = state.inCar && playerCar
      ? { x: playerCar.x, y: 1.4, z: playerCar.z, heading: playerCar.heading }
      : { x: player.x, y: 1.6, z: player.z, heading: player.heading };
    var yaw = state.inCar ? player.heading : cameraYaw;
    var dist = state.inCar ? cameraDist + 3 : cameraDist;
    var cx = target.x - Math.sin(yaw) * dist;
    var cz = target.z - Math.cos(yaw) * dist;
    var cy = target.y + Math.sin(cameraPitch) * dist * 0.9 + 2.2;
    camera.position.x = U.lerp(camera.position.x, cx, Math.min(1, dt * 6));
    camera.position.y = U.lerp(camera.position.y, cy, Math.min(1, dt * 6));
    camera.position.z = U.lerp(camera.position.z, cz, Math.min(1, dt * 6));
    camera.lookAt(target.x, target.y + 0.6, target.z);
  }

  function spawnFalcon() {
    if (carSpawnedFalcon) return;
    carSpawnedFalcon = true;
    var g = window.PV.game.landmarks.tower;
    window.PV.vehicles.spawnCar('coupe', 0xd8a020, g.x + 20, g.z + 30, Math.PI / 2, 'none');
  }

  function missionCtx() {
    return {
      x: player.x,
      z: player.z,
      inCar: state.inCar,
      carKind: playerCar ? playerCar.kind : null,
      wanted: window.PV.police.state.stars,
      kills: window.PV.combat.state.kills,
      collected: state.collected || 0,
      taxiDrops: state.taxiDrops || 0,
      spawnEnemies: function (x, z, n) { window.PV.combat.spawnEnemies(x, z, n); },
      spawnCollectibles: function (pts) { spawnCollectibles(pts); },
      spawnTaxiFare: function () { spawnTaxiFare(); },
    };
  }

  function tickMission(dt) {
    var res = window.PV.missions.update(dt, missionCtx());
    if (res === 'advanced') {
      window.PV.audio.pickup();
      window.PV.hud.message(window.PV.missions.objectiveText());
    } else if (res === 'complete') {
      var m = window.PV.missions.state.done.length
        ? window.PV.missions.list[window.PV.missions.state.done.length - 1]
        : null;
      if (m) {
        state.cash += m.reward;
        state.respect += m.respect;
        window.PV.audio.missionDone();
        window.PV.hud.flash('MISSION COMPLETE — ' + m.title + '  +$' + m.reward + '  +' + m.respect + ' respect');
        window.PV.save.save(state);
      }
      window.PV.combat.clearEnemies();
      clearCollectibles();
      if (taxiFare) { scene.remove(taxiFare.marker); taxiFare = null; }
      state.killsBase = window.PV.combat.state.kills;
      if (window.PV.missions.state.index >= window.PV.missions.list.length) {
        state.mode = 'complete';
        window.PV.hud.showEnd('PORT VERONA IS YOURS', 'All 10 missions complete. Respect ' + state.respect + ', cash ' + U.money(state.cash) + '. The city is yours — keep playing in free roam.', function () {
          state.mode = 'playing';
        });
      } else {
        setTimeout(function () {
          if (state.mode === 'playing') {
            var next = window.PV.missions.startNext();
            if (next) {
              var giver = window.PV.characters.byId(next.mission.giver);
              window.PV.hud.message(giver.name + ': ' + window.PV.characters.randomLine(giver));
            }
          }
        }, 2200);
      }
    } else if (res === 'failed') {
      window.PV.hud.flash('Mission failed — try again');
      window.PV.missions.start(window.PV.missions.state.index);
    }
  }

  function updateCollectibles(dt) {
    collectibles.forEach(function (c) {
      if (c.taken) return;
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = 1.2 + Math.sin(performance.now() * 0.004) * 0.25;
      if (U.dist2(player.x, player.z, c.x, c.z) < 2.6) {
        c.taken = true;
        scene.remove(c.mesh);
        state.collected = (state.collected || 0) + 1;
        window.PV.audio.pickup();
        window.PV.hud.flash('Data drop collected (' + state.collected + ')');
      }
    });
  }

  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (state.mode !== 'playing') {
      renderer.render(scene, camera);
      return;
    }
    // Clock and weather.
    state.hour = (state.hour + dt / 60) % 24;
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      weatherTimer = 90 + Math.random() * 60;
      state.weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
    }
    state.wanted = window.PV.police.state.stars;

    updatePlayer(dt);
    window.PV.vehicles.update(dt, {}, playerCar, state.upgrades);
    var policeRes = window.PV.police.update(dt, {
      x: player.x, z: player.z, inCar: state.inCar, playerCar: playerCar, speed: playerCar ? playerCar.speed : player.speed,
    });
    if (policeRes === 'busted') onBusted();
    window.PV.combat.update(dt, { x: player.x, z: player.z, damage: damage });
    window.PV.city.update(dt, state.hour, state.weather, player);
    updatePeds(dt);
    updateCollectibles(dt);
    updateTaxi(dt);
    tickMission(dt);
    updateCamera(dt);
    window.PV.hud.update(state);
    renderer.render(scene, camera);
    state.taxiDrops = state.taxiDrops || 0;
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      keys[e.code] = true;
      if (state.mode !== 'playing') return;
      if (e.code === 'KeyE') tryEnterCar();
      if (e.code === 'KeyF') {
        window.PV.combat.attack({ x: player.x, z: player.z, heading: player.heading, y: 1.4 });
        if (state.inCar && playerCar) window.PV.combat.attack({ x: playerCar.x, z: playerCar.z, heading: playerCar.heading, y: 1.4 });
      }
      if (e.code === 'KeyQ') {
        window.PV.hud.setWheel(true);
        window.PV.combat.cycleWeapon(1);
        setTimeout(function () { window.PV.hud.setWheel(false); }, 1400);
      }
      if (e.code === 'Digit1') window.PV.combat.setWeapon(0);
      if (e.code === 'Digit2') window.PV.combat.setWeapon(1);
      if (e.code === 'Digit3') window.PV.combat.setWeapon(2);
      if (e.code === 'Digit4') window.PV.combat.setWeapon(3);
      if (e.code === 'Digit5') window.PV.combat.setWeapon(4);
      if (e.code === 'KeyR') {
        state.radio = (state.radio + 1) % window.PV.audio.stations.length;
        window.PV.audio.startRadio(state.radio);
        window.PV.hud.flash('Radio: ' + window.PV.audio.stations[state.radio].name);
      }
      if (e.code === 'KeyM') {
        var muted = window.PV.audio.toggleMute();
        window.PV.hud.flash(muted ? 'Muted' : 'Sound on');
      }
      if (e.code === 'KeyG' && nearGarage()) garageMenu(true);
      if (e.code === 'KeyP') {
        state.mode = 'paused';
        window.PV.save.save(state);
        window.PV.hud.showEnd('PAUSED', 'Progress saved. Press the button to keep playing.', function () {
          state.mode = 'playing';
        });
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    var canvasHolder = document.getElementById('game-canvas');
    if (canvasHolder) {
      canvasHolder.addEventListener('mousedown', function (e) {
        mouseDown = true;
        mouseDX = e.clientX;
        mouseDY = e.clientY;
      });
      window.addEventListener('mousemove', function (e) {
        if (!mouseDown) return;
        cameraYaw -= (e.clientX - mouseDX) * 0.005;
        cameraPitch = U.clamp(cameraPitch + (e.clientY - mouseDY) * 0.003, 0.15, 1.1);
        mouseDX = e.clientX;
        mouseDY = e.clientY;
      });
      window.addEventListener('mouseup', function () { mouseDown = false; });
      canvasHolder.addEventListener('click', function () {
        if (state.mode !== 'playing') return;
        window.PV.audio.resume();
        window.PV.combat.attack({ x: player.x, z: player.z, heading: player.heading, y: 1.4 });
      });
    }
    window.addEventListener('resize', function () {
      if (!renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function init() {
    var holder = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    holder.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf7b06a, 120, 900);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 14, -18);
    clock = new THREE.Clock();

    var cityInfo = window.PV.city.build(scene);
    window.PV.game.landmarks = cityInfo.landmarks;
    window.PV.vehicles.init(scene);
    window.PV.police.init(scene);
    window.PV.combat.init(scene);
    window.PV.hud.build();

    playerMesh = makePlayerMesh();
    var start = cityInfo.landmarks.start;
    player.x = start.x;
    player.z = start.z;
    player.heading = Math.PI;
    cameraYaw = Math.PI;
    playerMesh.position.set(player.x, 0, player.z);
    scene.add(playerMesh);
    state.x = player.x;
    state.z = player.z;

    spawnPeds(26);
    spawnFalcon();
    // A couple of parked cars near the start for the first mission.
    window.PV.vehicles.spawnCar('sedan', 0x2e86c1, 33, 222, 0, 'none');
    window.PV.vehicles.spawnCar('suv', 0x27ae60, 41, 258, Math.PI, 'none');

    bindInput();
    window.PV.city.update(0, state.hour, state.weather, player);
    window.PV.hud.update(state);
    renderer.render(scene, camera);
  }

  function startGame(fromSave) {
    // Starting the game always hides the start screen, however it started
    // (button, continue, or a scripted screenshot scene).
    var startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    var save = fromSave ? window.PV.save.load() : null;
    if (save) {
      state.cash = save.cash;
      state.respect = save.respect;
      state.health = save.health;
      state.armor = save.armor;
      state.upgrades = save.upgrades || { engine: 0, armor: 0 };
      state.radio = save.radio || 0;
      state.hour = save.hour || 17.4;
      if (save.ammo) window.PV.combat.state.ammo = save.ammo;
      if (save.weaponIndex !== undefined) window.PV.combat.setWeapon(save.weaponIndex);
      window.PV.missions.state.index = save.missionIndex || 0;
      window.PV.missions.state.done = save.missionsDone || [];
      teleport(save.x || 0, save.z || 240);
    }
    state.mode = 'playing';
    window.PV.audio.startRadio(state.radio);
    var first = window.PV.missions.startNext();
    if (first) {
      var giver = window.PV.characters.byId(first.mission.giver);
      window.PV.hud.message(giver.name + ': ' + first.mission.brief);
    }
    if (!running) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
  }

  window.PV = window.PV || {};
  window.PV.game = {
    state: state,
    player: player,
    landmarks: {},
    init: init,
    startGame: startGame,
    damage: damage,
    teleport: teleport,
    stageCar: stageCar,
    snapCamera: snapCamera,
    spawnCollectibles: spawnCollectibles,
    spawnTaxiFare: spawnTaxiFare,
    panicNearby: panicNearby,
    scene: function () { return scene; },
    camera: function () { return camera; },
    renderer: function () { return renderer; },
  };
})();
