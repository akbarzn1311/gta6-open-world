import * as THREE from 'three';
// Port Verona v2 — the city: procedural buildings, streets, landmarks,
// sky and day/night cycle, weather, and the particle pool.
// All geometry is generated here from the seeded config, so the city is
// the same for a given seed and no art asset is ever loaded.
(function () {
  'use strict';
  var PV = (window.PV = window.PV || {});
  var T = THREE;

  // One shared window texture per variant: dark facade, bright windows.
  function makeFacadeTexture(rng, variant) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    var base = ['#2b3242', '#3a2f2b', '#27333a', '#332f3d'][variant % 4];
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (var y = 12; y < 244; y += 20) {
      for (var x = 10; x < 118; x += 18) {
        var lit = rng() < 0.55;
        g.fillStyle = lit ? (rng() < 0.8 ? '#ffd9a0' : '#9fd8ff') : '#12151d';
        g.fillRect(x, y, 11, 13);
      }
    }
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  function makeNeonTexture(text, color) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#0b0b12'; g.fillRect(0, 0, 256, 64);
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 16;
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  function makePalmMaterials() {
    return {
      trunk: new T.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
      frond: new T.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.9 })
    };
  }

  // A palm: trunk cylinder plus six drooping frond cones.
  function makePalm(mats) {
    var palm = new T.Group();
    var trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.3, 5.2, 6), mats.trunk);
    trunk.position.y = 2.6;
    trunk.rotation.z = 0.08;
    palm.add(trunk);
    for (var i = 0; i < 6; i++) {
      var frond = new T.Mesh(new T.ConeGeometry(0.55, 3.4, 4), mats.frond);
      var a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
      frond.rotation.z = Math.cos(a) * 1.9;
      frond.rotation.x = -Math.sin(a) * 1.9;
      frond.scale.set(1, 1, 0.25);
      palm.add(frond);
    }
    return palm;
  }

  var World = {
    // Build the whole static city into state.scene. Returns a summary the
    // smoke test can assert on.
    build: function (state) {
      var scene = state.scene;
      var rng = PV.mulberry32(state.seed);
      var city = PV.CITY;
      var W = {
        buildings: [], lamps: [], palms: [], signs: [],
        beacons: [], rainDrops: null, particles: null
      };
      state.world = W;

      scene.background = new T.Color(0x87a8d0);
      scene.fog = new T.Fog(0x9db8d8, 140, 520);

      // Ground: one big asphalt plane, plus a sand strip and sea to the south.
      var ground = new T.Mesh(
        new T.PlaneGeometry(city.half * 2 + 260, city.half * 2 + 260),
        new T.MeshStandardMaterial({ color: 0x2e3138, roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      var sand = new T.Mesh(
        new T.PlaneGeometry(city.half * 2, 26),
        new T.MeshStandardMaterial({ color: 0xc2a878, roughness: 1 })
      );
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(0, 0.03, city.half + 8);
      scene.add(sand);

      var sea = new T.Mesh(
        new T.PlaneGeometry(900, 320),
        new T.MeshStandardMaterial({ color: 0x14506e, roughness: 0.35, metalness: 0.25 })
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.01, city.half + 180);
      scene.add(sea);

      // Sidewalk blocks: light pavement squares between the roads.
      var paveMat = new T.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1 });
      var paveGeo = new T.BoxGeometry(city.block, 0.3, city.block);
      var roadLines = [];
      for (var i = -4; i <= 4; i++) roadLines.push(i * city.pitch);
      for (var bx = 0; bx < 9; bx++) {
        for (var bz = 0; bz < 9; bz++) {
          var cx = (bx - 4) * city.pitch;
          var cz = (bz - 4) * city.pitch;
          // The centre block is Fountain Plaza, not buildings.
          if (cx === 0 && cz === 0) continue;
          var pave = new T.Mesh(paveGeo, paveMat);
          pave.position.set(cx, 0.15, cz);
          pave.receiveShadow = true;
          scene.add(pave);
        }
      }

      // Road centre dashes, so the streets read as streets from above.
      var dashMat = new T.MeshBasicMaterial({ color: 0xd8d8c8 });
      var dashGeo = new T.BoxGeometry(0.5, 0.06, 4);
      for (var r = 0; r < roadLines.length; r++) {
        for (var d = -200; d <= 200; d += 16) {
          var dash = new T.Mesh(dashGeo, dashMat);
          dash.position.set(roadLines[r], 0.06, d);
          scene.add(dash);
          var dash2 = new T.Mesh(dashGeo, dashMat);
          dash2.rotation.y = Math.PI / 2;
          dash2.position.set(d, 0.06, roadLines[r]);
          scene.add(dash2);
        }
      }

      // Buildings: one to three boxes per block, heights 8 to 62 metres.
      var facades = [makeFacadeTexture(rng, 0), makeFacadeTexture(rng, 1), makeFacadeTexture(rng, 2)];
      var neonColors = ['#ff5da2', '#22d3ee', '#facc15', '#a3e635', '#fb7185'];
      for (var bx2 = 0; bx2 < 9; bx2++) {
        for (var bz2 = 0; bz2 < 9; bz2++) {
          var cx2 = (bx2 - 4) * city.pitch;
          var cz2 = (bz2 - 4) * city.pitch;
          if (cx2 === 0 && cz2 === 0) continue;
          var n = 1 + Math.floor(rng() * 3);
          for (var k = 0; k < n; k++) {
            var w = 8 + rng() * 14;
            var d = 8 + rng() * 14;
            var h = 8 + Math.pow(rng(), 1.6) * 54;
            var ox = (rng() - 0.5) * (city.block - w - 4);
            var oz = (rng() - 0.5) * (city.block - d - 4);
            var tex = facades[Math.floor(rng() * facades.length)];
            var tint = new T.Color().setHSL(rng(), 0.25, 0.55 + rng() * 0.2);
            var mat = new T.MeshStandardMaterial({
              color: tint, map: tex,
              emissive: 0xffca7a, emissiveMap: tex, emissiveIntensity: 0.18,
              roughness: 0.9
            });
            var b = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
            b.position.set(cx2 + ox, h / 2, cz2 + oz);
            b.castShadow = true; b.receiveShadow = true;
            scene.add(b);
            W.buildings.push(b);
            // A neon sign on some taller buildings.
            if (h > 26 && rng() < 0.5) {
              var signTex = makeNeonTexture(PV.pick(rng, PV.NEON_SIGNS), PV.pick(rng, neonColors));
              var sign = new T.Mesh(
                new T.PlaneGeometry(10, 2.5),
                new T.MeshBasicMaterial({ map: signTex, transparent: true })
              );
              sign.position.set(cx2 + ox, h - 2, cz2 + oz + d / 2 + 0.15);
              scene.add(sign);
              W.signs.push(sign);
            }
          }
        }
      }

      // Palm trees down the central boulevard and around the plaza.
      var palmMats = makePalmMaterials();
      for (var pz = -192; pz <= 192; pz += 24) {
        if (pz > -24 && pz < 24) continue; // keep the plaza open
        var p1 = makePalm(palmMats);
        p1.position.set(-9, 0, pz);
        scene.add(p1); W.palms.push(p1);
        var p2 = makePalm(palmMats);
        p2.position.set(9, 0, pz);
        scene.add(p2); W.palms.push(p2);
      }
      for (var pa = 0; pa < 8; pa++) {
        var ang = (pa / 8) * Math.PI * 2;
        var pp = makePalm(palmMats);
        pp.position.set(Math.cos(ang) * 26, 0, Math.sin(ang) * 26);
        scene.add(pp); W.palms.push(pp);
      }

      // Street lamps along every road.
      var lampPoleMat = new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
      var lampHeadMat = new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 0.4 });
      var poleGeo = new T.CylinderGeometry(0.09, 0.12, 6, 6);
      var headGeo = new T.SphereGeometry(0.35, 8, 6);
      for (var li = 0; li < roadLines.length; li++) {
        for (var ld = -192; ld <= 192; ld += 48) {
          var lamp = new T.Group();
          var pole = new T.Mesh(poleGeo, lampPoleMat);
          pole.position.y = 3;
          lamp.add(pole);
          var head = new T.Mesh(headGeo, lampHeadMat);
          head.position.y = 6.1;
          lamp.add(head);
          lamp.position.set(roadLines[li] + 7.5, 0, ld);
          scene.add(lamp);
          W.lamps.push(head);
        }
      }

      World.buildLandmarks(state, rng);
      World.buildRain(state);
      World.buildParticles(state);

      // Lights: a warm sun and a sky fill, re-aimed every frame by updateSky.
      var sun = new T.DirectionalLight(0xffd9a0, 2.2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
      sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
      sun.shadow.camera.far = 600;
      scene.add(sun);
      scene.add(sun.target);
      var hemi = new T.HemisphereLight(0xbfd8ff, 0x3a2f28, 0.9);
      scene.add(hemi);
      W.sun = sun; W.hemi = hemi;

      // Objective beacon: a light pillar the missions move around.
      var beam = new T.Mesh(
        new T.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
        new T.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false })
      );
      beam.position.y = 30;
      beam.visible = false;
      scene.add(beam);
      var diamond = new T.Mesh(
        new T.OctahedronGeometry(1.6),
        new T.MeshBasicMaterial({ color: 0xffd34d })
      );
      diamond.position.y = 8;
      diamond.visible = false;
      scene.add(diamond);
      W.beam = beam; W.diamond = diamond;

      return { buildings: W.buildings.length, palms: W.palms.length, lamps: W.lamps.length, signs: W.signs.length };
    },

    // The four signature landmarks, each placed where the missions use it.
    buildLandmarks: function (state, rng) {
      var scene = state.scene;
      var W = state.world;

      // Fountain Plaza: pavement disc, basin ring, water, benches.
      var plaza = new T.Mesh(
        new T.CylinderGeometry(30, 30, 0.4, 32),
        new T.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 1 })
      );
      plaza.position.set(0, 0.2, 0);
      scene.add(plaza);
      var basin = new T.Mesh(
        new T.TorusGeometry(7, 1.1, 10, 32),
        new T.MeshStandardMaterial({ color: 0x7d8a96, roughness: 0.6 })
      );
      basin.rotation.x = Math.PI / 2;
      basin.position.set(0, 0.9, 0);
      scene.add(basin);
      var fountainWater = new T.Mesh(
        new T.CircleGeometry(6.6, 24),
        new T.MeshStandardMaterial({ color: 0x2f7fb8, roughness: 0.2, metalness: 0.3 })
      );
      fountainWater.rotation.x = -Math.PI / 2;
      fountainWater.position.set(0, 0.95, 0);
      scene.add(fountainWater);
      var spout = new T.Mesh(
        new T.CylinderGeometry(0.5, 0.8, 3.4, 8),
        new T.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 })
      );
      spout.position.set(0, 2.2, 0);
      scene.add(spout);

      // Sol Arch over the boulevard: two pillars and a half-torus crown.
      var pillarMat = new T.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 });
      [-7, 7].forEach(function (x) {
        var pillar = new T.Mesh(new T.BoxGeometry(2.4, 16, 2.4), pillarMat);
        pillar.position.set(x, 8, -48);
        pillar.castShadow = true;
        scene.add(pillar);
      });
      var archTop = new T.Mesh(
        new T.TorusGeometry(7, 1.2, 10, 24, Math.PI),
        new T.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, emissive: 0x7c2d12, emissiveIntensity: 0.35 })
      );
      archTop.position.set(0, 16, -48);
      scene.add(archTop);

      // The Old Pier: wooden planks running out over the sea.
      var plankMat = new T.MeshStandardMaterial({ color: 0x8a6b45, roughness: 1 });
      for (var pz = 216; pz <= 268; pz += 4) {
        var plank = new T.Mesh(new T.BoxGeometry(10, 0.4, 3.6), plankMat);
        plank.position.set(0, 0.6, pz);
        scene.add(plank);
      }
      [-4.6, 4.6].forEach(function (x) {
        for (var pz2 = 216; pz2 <= 268; pz2 += 13) {
          var post = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 2.4, 6), plankMat);
          post.position.set(x, 0.4, pz2);
          scene.add(post);
        }
      });
      // Lamp heads on the pier posts, so the night pier reads.
      var pierHeadMat = new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 0.4 });
      var pierHeadGeo = new T.SphereGeometry(0.35, 8, 6);
      [-4.6, 4.6].forEach(function (x2) {
        [229, 255].forEach(function (pz3) {
          var ph = new T.Mesh(pierHeadGeo, pierHeadMat);
          ph.position.set(x2, 1.8, pz3);
          scene.add(ph);
          W.lamps.push(ph);
        });
      });
      var boat = new T.Group();
      var hull = new T.Mesh(new T.BoxGeometry(4, 1.6, 10), new T.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 }));
      hull.position.y = 0.6;
      boat.add(hull);
      var cabin = new T.Mesh(new T.BoxGeometry(2.6, 1.4, 4), new T.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.5 }));
      cabin.position.y = 2;
      boat.add(cabin);
      boat.position.set(14, 0.2, 262);
      scene.add(boat);

      // Meridian Tower: a tall cylinder with a pulsing red beacon.
      var tower = new T.Mesh(
        new T.CylinderGeometry(6, 9, 78, 12),
        new T.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.85 })
      );
      tower.position.set(144, 39, -144);
      tower.castShadow = true;
      scene.add(tower);
      var beacon = new T.Mesh(
        new T.SphereGeometry(1.4, 10, 8),
        new T.MeshBasicMaterial({ color: 0xff2222 })
      );
      beacon.position.set(144, 80, -144);
      scene.add(beacon);
      W.beacon = beacon;

      // Gus's garage: a low wide building with a big orange sign.
      var garage = new T.Mesh(
        new T.BoxGeometry(26, 9, 18),
        new T.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.9 })
      );
      garage.position.set(-144, 4.5, 96);
      garage.castShadow = true;
      scene.add(garage);
      var gSign = new T.Mesh(
        new T.PlaneGeometry(18, 3),
        new T.MeshBasicMaterial({ map: makeNeonTexture("GUS'S", '#fb923c'), transparent: true })
      );
      gSign.position.set(-144, 8.2, 96 + 9.2);
      scene.add(gSign);
      W.signs.push(gSign);
    },

    // Rain: a Points cloud of falling streaks around the camera.
    buildRain: function (state) {
      var count = 700;
      var pos = new Float32Array(count * 3);
      var rng = PV.mulberry32(99);
      for (var i = 0; i < count; i++) {
        pos[i * 3] = (rng() - 0.5) * 120;
        pos[i * 3 + 1] = rng() * 40;
        pos[i * 3 + 2] = (rng() - 0.5) * 120;
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      var rain = new T.Points(geo, new T.PointsMaterial({ color: 0xaac4de, size: 0.55, transparent: true, opacity: 0.7 }));
      rain.visible = false;
      rain.frustumCulled = false;
      state.scene.add(rain);
      state.world.rainDrops = rain;
      state.world.rainCount = count;
    },

    // One Points pool reused for exhaust smoke, muzzle sparks and damage smoke.
    buildParticles: function (state) {
      var max = 420;
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(max * 3), 3));
      geo.setAttribute('color', new T.BufferAttribute(new Float32Array(max * 3), 3));
      var pts = new T.Points(geo, new T.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.85 }));
      pts.frustumCulled = false;
      state.scene.add(pts);
      state.world.particles = {
        points: pts, max: max, head: 0,
        vel: new Float32Array(max * 3),
        life: new Float32Array(max),
        ttl: new Float32Array(max)
      };
    },

    spawnBurst: function (state, pos, kind, n) {
      var P = state.world.particles;
      if (!P) return;
      var colors = {
        smoke: [0.45, 0.45, 0.48], exhaust: [0.35, 0.35, 0.36],
        spark: [1.0, 0.8, 0.25], blood: [0.6, 0.05, 0.05]
      };
      var col = colors[kind] || colors.smoke;
      var posAttr = P.points.geometry.getAttribute('position');
      var colAttr = P.points.geometry.getAttribute('color');
      for (var i = 0; i < n; i++) {
        var idx = P.head;
        P.head = (P.head + 1) % P.max;
        posAttr.setXYZ(idx, pos.x + (Math.random() - 0.5) * 0.6, pos.y + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.6);
        colAttr.setXYZ(idx, col[0], col[1], col[2]);
        P.vel[idx * 3] = (Math.random() - 0.5) * 2;
        P.vel[idx * 3 + 1] = kind === 'spark' ? Math.random() * 4 : 1 + Math.random() * 1.5;
        P.vel[idx * 3 + 2] = (Math.random() - 0.5) * 2;
        P.life[idx] = 0;
        P.ttl[idx] = kind === 'spark' ? 0.25 : 0.9 + Math.random() * 0.7;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },

    updateParticles: function (state, dt) {
      var P = state.world.particles;
      if (!P) return;
      var posAttr = P.points.geometry.getAttribute('position');
      for (var i = 0; i < P.max; i++) {
        if (P.ttl[i] <= 0) continue;
        P.life[i] += dt;
        if (P.life[i] >= P.ttl[i]) { P.ttl[i] = 0; posAttr.setXYZ(i, 0, -50, 0); continue; }
        posAttr.setXYZ(i,
          posAttr.getX(i) + P.vel[i * 3] * dt,
          posAttr.getY(i) + P.vel[i * 3 + 1] * dt,
          posAttr.getZ(i) + P.vel[i * 3 + 2] * dt);
      }
      posAttr.needsUpdate = true;
    },

    // Sun, sky and fog from the clock: golden hour is warm and low,
    // midday is bright blue, night is dark with lamps and lit windows.
    updateSky: function (state, dt) {
      var W = state.world;
      var t = state.time; // hours, 0-24
      var day = t > 6 && t < 19.5;
      // Sun elevation: 0 at 6:00, peak at 13:00, 0 at 20:00.
      var elev = Math.sin(((t - 6) / 14) * Math.PI);
      var sunAngle = ((t - 6) / 24) * Math.PI * 2;
      var golden = PV.clamp(1 - Math.abs(t - 18) / 1.6, 0, 1); // golden hour ~18:00
      var night = day ? 0 : 1;
      var nightBlend = PV.clamp(day ? 0 : Math.min(Math.abs(t - 19.5), Math.abs(t - 6)) / 1.5, 0, 1);

      var sunColor = new T.Color(0xffd9a0).lerp(new T.Color(0xff7a2a), golden * 0.8);
      var skyDay = new T.Color(0x8fb8e8).lerp(new T.Color(0xffa94d), golden * 0.75);
      var skyNight = new T.Color(0x0d1526);
      var sky = skyDay.clone().lerp(skyNight, nightBlend);
      if (state.weather === 'rain') sky.multiplyScalar(0.72);
      if (state.weather === 'overcast') sky.multiplyScalar(0.85);
      state.scene.background.copy(sky);
      state.scene.fog.color.copy(sky);
      state.scene.fog.near = state.weather === 'rain' ? 60 : 140;
      state.scene.fog.far = state.weather === 'rain' ? 260 : 520;

      W.sun.position.set(
        Math.cos(sunAngle) * 260,
        Math.max(18, elev * 300),
        Math.sin(sunAngle) * 160
      );
      W.sun.color.copy(sunColor);
      // Brighter floor at night so the chase shots stay readable.
      W.sun.intensity = day ? PV.lerp(0.5, 2.4, PV.clamp(elev, 0, 1)) : 0.7;
      W.hemi.intensity = day ? 0.85 : 0.65;
      W.hemi.color.set(day ? 0xbfd8ff : 0x24344d);
      W.hemi.groundColor.set(day ? 0x3a2f28 : 0x14100c);
      for (var i = 0; i < W.lamps.length; i++) {
        W.lamps[i].material.emissiveIntensity = day ? 0.15 : 2.2;
      }
      for (var j = 0; j < W.buildings.length; j++) {
        W.buildings[j].material.emissiveIntensity = day ? 0.12 : 0.95;
      }
      if (W.beacon) {
        var pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 2.4);
        W.beacon.material.color.setRGB(1, 0.13 * pulse + 0.05, 0.13 * pulse + 0.05);
      }
      // Rain follows the camera so it is always overhead.
      if (W.rainDrops && W.rainDrops.visible && state.camera) {
        var rp = W.rainDrops.position;
        rp.x = state.camera.position.x;
        rp.z = state.camera.position.z;
        var attr = W.rainDrops.geometry.getAttribute('position');
        for (var k = 0; k < W.rainCount; k++) {
          var y = attr.getY(k) - dt * 34;
          if (y < 0) y = 38 + Math.random() * 4;
          attr.setY(k, y);
        }
        attr.needsUpdate = true;
      }
    },

    setWeather: function (state, name) {
      state.weather = name;
      if (state.world.rainDrops) state.world.rainDrops.visible = (name === 'rain');
    },

    // Weather drifts on its own timer; rain makes the roads slick.
    updateWeather: function (state, dt) {
      state.weatherTimer -= dt;
      if (state.weatherTimer <= 0) {
        var roll = state.rng();
        if (state.weather === 'clear') {
          World.setWeather(state, roll < 0.55 ? 'clear' : roll < 0.8 ? 'overcast' : 'rain');
        } else if (state.weather === 'overcast') {
          World.setWeather(state, roll < 0.5 ? 'rain' : 'clear');
        } else {
          World.setWeather(state, roll < 0.6 ? 'clear' : 'overcast');
        }
        state.weatherTimer = 45 + state.rng() * 75;
      }
    },

    traction: function (state) {
      return state.weather === 'rain' ? 0.62 : state.weather === 'overcast' ? 0.9 : 1.0;
    },

    // -- helpers used by traffic, police and missions -------------------
    roadPoint: function (state) {
      var city = PV.CITY;
      var vertical = state.rng() < 0.5;
      var line = (Math.floor(state.rng() * 9) - 4) * city.pitch;
      var along = (state.rng() * 2 - 1) * (city.half - 20);
      return vertical ? { x: line, z: along } : { x: along, z: line };
    },

    nearestRoad: function (x, z) {
      var city = PV.CITY;
      var nx = Math.round(x / city.pitch) * city.pitch;
      var nz = Math.round(z / city.pitch) * city.pitch;
      var dx = Math.abs(x - nx), dz = Math.abs(z - nz);
      return dx < dz ? { x: nx, z: z } : { x: x, z: nz };
    },

    placePosition: function (name) {
      var p = PV.PLACES[name] || PV.PLACES.plaza;
      return { x: p.x, z: p.z };
    },

    districtAt: function (x, z) {
      for (var i = 0; i < PV.DISTRICTS.length; i++) {
        var d = PV.DISTRICTS[i];
        if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
      }
      return 'Port Verona';
    },

    setMarker: function (state, x, z) {
      var W = state.world;
      if (!W) return;
      if (x === null || x === undefined) {
        W.beam.visible = false;
        W.diamond.visible = false;
        return;
      }
      W.beam.position.x = x; W.beam.position.z = z;
      W.diamond.position.x = x; W.diamond.position.z = z;
      W.beam.visible = true;
      W.diamond.visible = true;
      W.diamond.position.y = 8 + Math.sin(state.elapsed * 3) * 0.8;
    }
  };

  PV.World = World;
})();
