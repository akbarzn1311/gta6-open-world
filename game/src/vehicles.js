// Port Verona — vehicles: arcade car physics, traffic AI, carjacking.
// Cars are procedural box models (no imported assets). The player drives with
// W/S for throttle and brake, A/D to steer; traffic follows the road grid and
// stops for the car ahead. E enters the nearest car — if it has a driver,
// that is a carjacking and the wanted level goes up.

(function () {
  'use strict';

  var U = window.PV.util;

  var sceneRef = null;
  var cars = [];
  var trafficTimer = 0;
  var rng = U.makeRng(4242);

  var CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x7f8c8d, 0x16a085];
  var TAXI_COLOR = 0xf7dc3a;

  /** Build a procedural car mesh. kind: sedan | coupe | suv | taxi | police | truck | van. */
  function createCarModel(kind, color) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a38 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
    var len = kind === 'truck' ? 5.6 : kind === 'suv' || kind === 'van' ? 4.9 : 4.3;
    var wid = kind === 'truck' ? 2.3 : 2.0;
    var bodyH = kind === 'suv' || kind === 'van' ? 1.15 : 0.85;

    var body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
    body.position.y = 0.62;
    g.add(body);
    var cabin = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.86, kind === 'van' ? 0.9 : 0.62, len * (kind === 'truck' ? 0.32 : 0.5)),
      glassMat
    );
    cabin.position.set(0, 0.62 + bodyH / 2 + 0.28, kind === 'truck' ? len * 0.28 : -len * 0.05);
    g.add(cabin);
    if (kind === 'truck') {
      var bed = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.95, 0.5, len * 0.5), darkMat);
      bed.position.set(0, 0.62 + bodyH / 2 + 0.1, -len * 0.22);
      g.add(bed);
    }
    // Wheels.
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    var wheelPos = [
      [-wid / 2, len * 0.32],
      [wid / 2, len * 0.32],
      [-wid / 2, -len * 0.32],
      [wid / 2, -len * 0.32],
    ];
    var wheels = [];
    wheelPos.forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(p[0], 0.36, p[1]);
      g.add(w);
      wheels.push(w);
    });
    // Headlights and taillights.
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    [-1, 1].forEach(function (s) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
      h.position.set(s * (wid / 2 - 0.3), 0.72, len / 2 + 0.01);
      g.add(h);
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
      t.position.set(s * (wid / 2 - 0.3), 0.72, -len / 2 - 0.01);
      g.add(t);
    });
    if (kind === 'police') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      bar.position.set(0, 1.62, 0);
      g.add(bar);
      var bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar2.position.set(0, 1.62, 0.32);
      g.add(bar2);
    }
    if (kind === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
      sign.position.set(0, 1.55, 0);
      g.add(sign);
    }
    g.userData.wheels = wheels;
    g.userData.kind = kind;
    return g;
  }

  /** Spawn a car object into the world. */
  function spawnCar(kind, color, x, z, heading, driver) {
    var mesh = createCarModel(kind, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    sceneRef.add(mesh);
    var car = {
      mesh: mesh,
      kind: kind,
      x: x,
      z: z,
      heading: heading,
      speed: 0,
      steer: 0,
      color: color,
      driver: driver || 'none', // player | traffic | police | none
      health: 100,
      // Traffic AI state.
      roadAxis: 'x',
      roadLine: z,
      dir: 1,
      cruise: 8 + rng() * 5,
      stuck: 0,
    };
    cars.push(car);
    return car;
  }

  /** Road centre lines (the grid's road coordinates). */
  function roadLines() {
    var half = window.PV.city.half;
    var pitch = (half * 2 - 14) / 9;
    var lines = [];
    for (var i = 0; i <= 9; i++) lines.push(-half + i * pitch + 7);
    return lines;
  }

  function spawnTraffic(count) {
    var lines = roadLines();
    for (var i = 0; i < count; i++) {
      var horizontal = rng() < 0.5;
      var line = lines[Math.floor(rng() * lines.length)];
      var along = U.range(rng, -window.PV.city.half + 20, window.PV.city.half - 20);
      var kind = U.pick(rng, ['sedan', 'sedan', 'coupe', 'suv', 'taxi', 'van', 'truck']);
      var color = kind === 'taxi' ? TAXI_COLOR : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      var car = spawnCar(kind, color, horizontal ? along : line, horizontal ? line : along, horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
      car.roadAxis = horizontal ? 'x' : 'z';
      car.roadLine = line;
      car.dir = rng() < 0.5 ? 1 : -1;
    }
  }

  function nearestCar(x, z, maxDist, includeOccupied) {
    var best = null;
    var bestD = maxDist;
    cars.forEach(function (c) {
      if (!includeOccupied && c.driver !== 'none') return;
      var d = U.dist2(x, z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    return best;
  }

  function removeCar(car) {
    sceneRef.remove(car.mesh);
    var i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  /** One step of arcade car physics for a driven car. */
  function driveStep(car, input, dt, upgrades) {
    var engine = 1 + (upgrades.engine || 0) * 0.22;
    var topSpeed = (kindTop(car.kind) * engine) / 3.6; // m/s
    var accel = 14 * engine;
    if (input.forward) car.speed += accel * dt;
    if (input.back) car.speed -= (car.speed > 0.5 ? 22 : 9) * dt;
    if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * 6 * dt;
    if (Math.abs(car.speed) < 0.15 && !input.forward && !input.back) car.speed = 0;
    car.speed = U.clamp(car.speed, -9, topSpeed);
    var steerTarget = 0;
    if (input.left) steerTarget = 1;
    if (input.right) steerTarget = -1;
    car.steer = U.lerp(car.steer, steerTarget, Math.min(1, dt * 8));
    var turnRate = car.steer * 1.9 * U.clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1);
    car.heading += turnRate * dt;
    // Slight drift feel at speed.
    var slip = U.clamp(Math.abs(car.speed) / topSpeed, 0, 1) * 0.12;
    var nx = car.x + Math.sin(car.heading) * car.speed * dt + Math.sin(car.heading + Math.PI / 2) * car.steer * slip * car.speed * dt;
    var nz = car.z + Math.cos(car.heading) * car.speed * dt + Math.cos(car.heading + Math.PI / 2) * car.steer * slip * car.speed * dt;
    var fixed = window.PV.city.resolveCollision(nx, nz, 1.6);
    if (fixed.hit) {
      if (Math.abs(car.speed) > 6) car.health -= Math.abs(car.speed) * 0.6;
      car.speed *= 0.35;
    }
    car.x = U.clamp(fixed.x, -window.PV.city.half - 10, window.PV.city.half + 10);
    car.z = U.clamp(fixed.z, -window.PV.city.half - 10, window.PV.city.half + 10);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.mesh.userData.wheels.forEach(function (w, i) {
      w.rotation.x += car.speed * dt * 2.4;
      if (i < 2) w.rotation.y = car.steer * 0.42;
    });
    return car;
  }

  function kindTop(kind) {
    if (kind === 'coupe') return 198;
    if (kind === 'suv') return 165;
    if (kind === 'truck') return 135;
    if (kind === 'police') return 185;
    return 175;
  }

  /** Traffic AI: follow the road grid, stop for the car ahead. */
  function trafficStep(car, dt) {
    var ahead = null;
    var aheadD = 12;
    cars.forEach(function (o) {
      if (o === car) return;
      var d = U.dist2(car.x, car.z, o.x, o.z);
      if (d < aheadD) {
        var dx = o.x - car.x;
        var dz = o.z - car.z;
        var fx = Math.sin(car.heading);
        var fz = Math.cos(car.heading);
        if (dx * fx + dz * fz > 0) ahead = o;
      }
    });
    var target = ahead ? 0 : car.cruise;
    car.speed = U.lerp(car.speed, target, Math.min(1, dt * 1.4));
    var nx = car.x + Math.sin(car.heading) * car.speed * dt;
    var nz = car.z + Math.cos(car.heading) * car.speed * dt;
    var half = window.PV.city.half;
    // At an intersection, sometimes turn onto the cross road.
    var onLine = Math.abs(((car.roadAxis === 'x' ? car.z : car.x) - car.roadLine)) < 1.5;
    var nearEdge = Math.abs(car.x) > half - 12 || Math.abs(car.z) > half - 12;
    if ((onLine && rng() < dt * 0.06) || nearEdge) {
      var lines = roadLines();
      var newLine = lines[Math.floor(rng() * lines.length)];
      if (car.roadAxis === 'x') {
        car.roadAxis = 'z';
        car.roadLine = newLine;
        car.heading = (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * (car.dir > 0 ? 1 : 1);
        car.z = newLine;
      } else {
        car.roadAxis = 'x';
        car.roadLine = newLine;
        car.heading = rng() < 0.5 ? 0 : Math.PI;
        car.x = newLine;
      }
    }
    var fixed = window.PV.city.resolveCollision(nx, nz, 1.6);
    if (fixed.hit) {
      car.speed = 0;
      car.heading += Math.PI / 2;
    }
    car.x = fixed.x;
    car.z = fixed.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.mesh.userData.wheels.forEach(function (w) {
      w.rotation.x += car.speed * dt * 2.4;
    });
  }

  function init(scene) {
    sceneRef = scene;
    cars = [];
    spawnTraffic(16);
  }

  function update(dt, input, playerCar, upgrades) {
    trafficTimer += dt;
    if (trafficTimer > 2.5) {
      trafficTimer = 0;
      var traffic = cars.filter(function (c) { return c.driver === 'traffic'; });
      if (traffic.length < 15) spawnTraffic(1);
    }
    cars.slice().forEach(function (car) {
      if (car.driver === 'player') {
        // The player car is driven by game.js (updatePlayer) — never here.
        return;
      }
      if (car.driver === 'traffic') {
        trafficStep(car, dt);
      } else if (car.driver === 'police') {
        // Police cars are steered by the police module through driveStep.
        driveStep(car, car.policeInput || { forward: true }, dt, { engine: 1 });
      }
    });
  }

  window.PV = window.PV || {};
  window.PV.vehicles = {
    init: init,
    update: update,
    spawnCar: spawnCar,
    nearestCar: nearestCar,
    removeCar: removeCar,
    driveStep: driveStep,
    cars: function () { return cars; },
    kindTop: kindTop,
  };
})();
