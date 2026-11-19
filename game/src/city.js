// Port Verona — the procedural city.
// A sun-soaked coastal city on a 9x9 block grid: Meridian Tower downtown,
// Sunset Quay and the water on the west edge, Paseo del Mar as the main
// avenue, Calle Loma running north-south. Buildings, palms, lamps and props
// are all generated from a fixed seed, so the layout is stable between runs.
// Day/night and weather (clear / sunset / rain / fog) change the light, the
// sky and the window glow. Colliders are exported for the player and cars.

(function () {
  'use strict';

  var U = window.PV.util;

  var BLOCK = 60; // metres per city block
  var ROAD = 14; // metres of road between blocks
  var GRID = 9; // blocks per side
  var PITCH = BLOCK + ROAD;
  var HALF = (GRID * PITCH + ROAD) / 2;

  var colliders = [];
  var landmarks = {};
  var sceneRef = null;
  var sun = null;
  var hemi = null;
  var skyMesh = null;
  var rain = null;
  var rainVel = null;
  var windowMats = [];
  var lampMats = [];
  var waterMesh = null;

  // Sky palettes: [sky top, sky horizon, fog, sun colour, sun intensity,
  // hemi intensity, ambient windows lit?]
  var SKIES = {
    day: [0x3f8fd2, 0xbfe3f2, 0xcfe5ee, 0xfff2d8, 1.25, 0.85, false],
    sunset: [0x2c3a6e, 0xff9a52, 0xf7b06a, 0xffb347, 1.0, 0.55, true],
    night: [0x060a1c, 0x101c3a, 0x0a1226, 0x9db4ff, 0.12, 0.28, true],
    dawn: [0x35507a, 0xf2b98a, 0xe8c49a, 0xffd9a0, 0.8, 0.6, true],
  };

  function canvasTexture(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** A building facade: lit windows on a warm wall, day and night variants. */
  function facadeTexture(base, lit, night) {
    return canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      var rng = U.makeRng(night ? 77 : 7);
      for (var y = 10; y < h - 10; y += 22) {
        for (var x = 10; x < w - 10; x += 18) {
          if (rng() < 0.18) continue; // some windows dark even at night
          if (night) {
            g.fillStyle = rng() < 0.7 ? '#ffd98a' : '#9fd8ff';
            g.globalAlpha = 0.55 + rng() * 0.45;
          } else {
            g.fillStyle = rng() < 0.5 ? '#2c3e55' : '#54708c';
            g.globalAlpha = 0.9;
          }
          g.fillRect(x, y, 11, 14);
          g.globalAlpha = 1;
        }
      }
      // Ground-floor shops.
      g.fillStyle = night ? '#ffca6a' : '#22303f';
      g.fillRect(0, h - 26, w, 26);
    });
  }

  function makeBuildingMaterials() {
    var palettes = ['#c9a37e', '#b98d6e', '#a8b0b5', '#c2b49a', '#8fa3b0', '#d9c1a3'];
    var out = [];
    palettes.forEach(function (base, i) {
      var day = facadeTexture(base, false, false);
      var night = facadeTexture(base, true, true);
      var mat = new THREE.MeshLambertMaterial({ map: day });
      mat.userData.dayMap = day;
      mat.userData.nightMap = night;
      mat.userData.isFacade = true;
      windowMats.push(mat);
      out.push(mat);
    });
    return out;
  }

  function box(w, h, d, mat, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || sceneRef).add(m);
    return m;
  }

  function addCollider(cx, cz, hw, hd) {
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }

  function buildPalm(x, z, s) {
    var g = new THREE.Group();
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.rotation.z = 0.06;
    g.add(trunk);
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    for (var i = 0; i < 6; i++) {
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 4.2 * s, 4), leafMat);
      var a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.5 * s, 7.2 * s, Math.sin(a) * 1.5 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    sceneRef.add(g);
  }

  function buildLamp(x, z) {
    var g = new THREE.Group();
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), poleMat);
    pole.position.y = 3.2;
    g.add(pole);
    var headMat = new THREE.MeshLambertMaterial({
      color: 0x555555,
      emissive: 0xffd98a,
      emissiveIntensity: 0.25,
    });
    lampMats.push(headMat);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), headMat);
    head.position.set(0.7, 6.4, 0);
    g.add(head);
    g.position.set(x, 0, z);
    sceneRef.add(g);
  }

  function buildCity(scene) {
    sceneRef = scene;
    colliders = [];
    landmarks = {};
    windowMats = [];
    lampMats = [];

    // Sky dome and lights.
    var skyGeo = new THREE.SphereGeometry(900, 16, 12);
    var skyMat = new THREE.MeshBasicMaterial({ color: 0x3f8fd2, side: THREE.BackSide, fog: false });
    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
    sun.position.set(120, 180, 60);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    // Ground and water (west edge).
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x6f7d5a });
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 260, HALF * 2 + 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-60, -0.05, 0);
    scene.add(ground);

    waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0x1f6f9f })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(-HALF - 118, 0.1, 0);
    scene.add(waterMesh);

    // Roads: dark strips along every grid line, plus sidewalks.
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    var walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    for (var i = 0; i <= GRID; i++) {
      var c = -HALF + i * PITCH + ROAD / 2;
      var vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2), roadMat);
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(c, 0.02, 0);
      scene.add(vRoad);
      var hRoad = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, ROAD), roadMat);
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0.02, c);
      scene.add(hRoad);
      // Centre dashes on the two named avenues.
      if (i === 4) {
        for (var d = -HALF + 8; d < HALF - 8; d += 12) {
          var dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), new THREE.MeshBasicMaterial({ color: 0xd8c95a }));
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(d, 0.04, c);
          scene.add(dash);
        }
      }
    }
    // Sidewalk rings around each block.
    for (var bx = 0; bx < GRID; bx++) {
      for (var bz = 0; bz < GRID; bz++) {
        var cx = -HALF + ROAD + bx * PITCH + BLOCK / 2;
        var cz = -HALF + ROAD + bz * PITCH + BLOCK / 2;
        var walk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(cx, 0.01, cz);
        scene.add(walk);
      }
    }

    var mats = makeBuildingMaterials();
    var rng = U.makeRng(20261119);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x2b4a66, emissive: 0x0a2033, emissiveIntensity: 0.6 });

    for (var x = 0; x < GRID; x++) {
      for (var z = 0; z < GRID; z++) {
        var bcx = -HALF + ROAD + x * PITCH + BLOCK / 2;
        var bcz = -HALF + ROAD + z * PITCH + BLOCK / 2;
        // The quay block on the west edge stays open (boardwalk, no buildings).
        if (x === 0 && z >= 3 && z <= 5) continue;
        // The central plaza stays open too.
        if (x === 4 && z === 4) {
          var plaza = new THREE.Mesh(
            new THREE.CylinderGeometry(14, 14, 0.4, 24),
            new THREE.MeshLambertMaterial({ color: 0xb9a06a })
          );
          plaza.position.set(bcx, 0.2, bcz);
          scene.add(plaza);
          buildPalm(bcx - 18, bcz - 14, 1.2);
          buildPalm(bcx + 18, bcz + 14, 1.2);
          continue;
        }
        var count = 1 + Math.floor(rng() * 3);
        for (var b = 0; b < count; b++) {
          var w = U.range(rng, 12, 22);
          var d = U.range(rng, 12, 22);
          var h = U.range(rng, 9, 34);
          var ox = U.range(rng, -14, 14);
          var oz = U.range(rng, -14, 14);
          // Keep buildings inside their block.
          ox = U.clamp(ox, -BLOCK / 2 + w / 2 + 2, BLOCK / 2 - w / 2 - 2);
          oz = U.clamp(oz, -BLOCK / 2 + d / 2 + 2, BLOCK / 2 - d / 2 - 2);
          var mat = mats[Math.floor(rng() * mats.length)];
          var bld = box(w, h, d, mat, bcx + ox, h / 2, bcz + oz);
          box(w + 0.6, 0.8, d + 0.6, roofMat, bcx + ox, h + 0.4, bcz + oz);
          // Rooftop box on taller towers.
          if (h > 24) box(4, 3, 4, roofMat, bcx + ox + w / 4, h + 2, bcz + oz);
          addCollider(bcx + ox, bcz + oz, w / 2 + 0.3, d / 2 + 0.3);
          void bld;
        }
      }
    }

    // Meridian Tower — the tallest landmark, downtown north.
    var towerX = -HALF + ROAD + 4 * PITCH + BLOCK / 2;
    var towerZ = -HALF + ROAD + 1 * PITCH + BLOCK / 2;
    var tower = box(26, 78, 26, glassMat, towerX, 39, towerZ);
    box(28, 2, 28, roofMat, towerX, 79, towerZ);
    var beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    beacon.position.set(towerX, 81, towerZ);
    scene.add(beacon);
    addCollider(towerX, towerZ, 13.5, 13.5);
    landmarks.tower = { x: towerX, z: towerZ, mesh: tower };

    // Sunset Quay — boardwalk on the west edge.
    var quayX = -HALF + 6;
    var quayZ = 0;
    var boardwalk = box(16, 1.2, 150, new THREE.MeshLambertMaterial({ color: 0x9a7b52 }), quayX, 0.6, quayZ);
    void boardwalk;
    for (var p = 0; p < 8; p++) buildPalm(quayX + 4, -70 + p * 20, 1.1);
    landmarks.quay = { x: quayX, z: quayZ };

    // Garage (south), police station (east), hospital (north-east).
    landmarks.garage = { x: 120, z: 210 };
    landmarks.police = { x: 230, z: -40 };
    landmarks.hospital = { x: 180, z: -210 };
    landmarks.start = { x: 37, z: 240 }; // on the x=37 road, facing north

    // Street lamps along the avenues and palms along Paseo del Mar.
    for (var lx = -HALF + 20; lx < HALF; lx += 74) {
      buildLamp(lx, -HALF + ROAD + 4 * PITCH - 8);
      buildLamp(lx + 30, -HALF + ROAD + 4 * PITCH + 8);
    }
    for (var pz = -HALF + 30; pz < HALF; pz += 44) {
      buildPalm(-HALF + ROAD + 4 * PITCH - 10, pz, 1);
      buildPalm(-HALF + ROAD + 4 * PITCH + 10, pz + 22, 1);
    }

    // Rain points (hidden unless it rains).
    var rainCount = 1600;
    var rainPos = new Float32Array(rainCount * 3);
    rainVel = new Float32Array(rainCount);
    for (var r = 0; r < rainCount; r++) {
      rainPos[r * 3] = U.range(rng, -HALF, HALF);
      rainPos[r * 3 + 1] = U.range(rng, 0, 60);
      rainPos[r * 3 + 2] = U.range(rng, -HALF, HALF);
      rainVel[r] = U.range(rng, 28, 46);
    }
    var rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: 0xaaccee, size: 0.35, transparent: true, opacity: 0.6 })
    );
    rain.visible = false;
    scene.add(rain);

    return { colliders: colliders, landmarks: landmarks, half: HALF, pitch: PITCH, block: BLOCK, road: ROAD };
  }

  /** Pick the sky palette for a time of day (hours 0..24). */
  function skyFor(hour) {
    if (hour >= 6 && hour < 9) return SKIES.dawn;
    if (hour >= 9 && hour < 17) return SKIES.day;
    if (hour >= 17 && hour < 19.5) return SKIES.sunset;
    return SKIES.night;
  }

  /** Blend two palettes by t and apply to the scene. */
  function applySky(hour, weather) {
    if (!sceneRef) return;
    var a = skyFor(hour);
    var b = skyFor((hour + 1.5) % 24);
    var f = (hour % 1.5) / 1.5;
    var mix = function (i) {
      if (typeof a[i] === 'boolean') return a[i];
      var ca = new THREE.Color(a[i]);
      var cb = new THREE.Color(b[i]);
      return ca.lerp(cb, f);
    };
    var top = mix(0);
    var horizon = mix(1);
    var fogCol = mix(2);
    var sunCol = mix(3);
    // The dome reads as the sky: mostly the top colour, warmed by the horizon.
    skyMesh.material.color.copy(top).lerp(horizon, 0.45);
    sceneRef.fog = new THREE.Fog(fogCol, weather === 'fog' ? 40 : 120, weather === 'fog' ? 260 : 900);
    sceneRef.background = fogCol;
    sun.color.copy(sunCol);
    var elev = Math.sin(((hour - 6) / 12) * Math.PI);
    sun.position.set(160 * Math.cos(hour * 0.3), Math.max(20, 220 * Math.max(0, elev)), 80);
    sun.intensity = U.lerp(a[4], b[4], f) * (weather === 'rain' ? 0.45 : 1);
    hemi.intensity = U.lerp(a[5], b[5], f);
    var lit = a[6] || b[6];
    windowMats.forEach(function (m) {
      m.map = lit ? m.userData.nightMap : m.userData.dayMap;
      m.needsUpdate = false;
    });
    lampMats.forEach(function (m) {
      m.emissiveIntensity = lit ? 1.4 : 0.25;
    });
    rain.visible = weather === 'rain';
  }

  function update(dt, hour, weather, playerPos) {
    if (!sceneRef) return;
    applySky(hour, weather);
    if (rain && rain.visible && playerPos) {
      var pos = rain.geometry.attributes.position;
      for (var i = 0; i < rainVel.length; i++) {
        var y = pos.getY(i) - rainVel[i] * dt;
        if (y < 0) {
          y = 55;
          pos.setX(i, playerPos.x + (Math.random() - 0.5) * 120);
          pos.setZ(i, playerPos.z + (Math.random() - 0.5) * 120);
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    if (waterMesh) waterMesh.position.y = 0.1 + Math.sin(performance.now() * 0.0004) * 0.08;
  }

  /** True when point (x,z) with radius r hits any building. */
  function hitsBuilding(x, z, r) {
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
    }
    return null;
  }

  /** Push a circle out of a building collider; returns corrected {x, z}. */
  function resolveCollision(x, z, r) {
    var c = hitsBuilding(x, z, r);
    if (!c) return { x: x, z: z, hit: false };
    var pushL = x + r - c.minX;
    var pushR = c.maxX - (x - r);
    var pushT = z + r - c.minZ;
    var pushB = c.maxZ - (z - r);
    var m = Math.min(pushL, pushR, pushT, pushB);
    if (m === pushL) x = c.minX - r;
    else if (m === pushR) x = c.maxX + r;
    else if (m === pushT) z = c.minZ - r;
    else z = c.maxZ + r;
    return { x: x, z: z, hit: true };
  }

  window.PV = window.PV || {};
  window.PV.city = {
    build: buildCity,
    update: update,
    hitsBuilding: hitsBuilding,
    resolveCollision: resolveCollision,
    half: HALF,
    grid: GRID,
  };
})();
