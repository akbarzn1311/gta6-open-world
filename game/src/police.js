import * as THREE from 'three';
// Port Verona v2 — police: the wanted system and its dispatch.
// Escalation is the genre's spine: patrol cars chase, roadblocks close
// the road at 3 stars, a helicopter spotlights the player at 4 stars.
(function () {
  'use strict';
  var PV = (window.PV = window.PV || {});
  var T = THREE;

  var UNIT_NAMES = ['OSPREY-11', 'COBRA-25', 'MAKO-18', 'RHINO-45', 'EAGLE-07', 'ORCA-33', 'VIPER-19', 'HERON-52'];
  var unitSeq = 0;

  function unitName() {
    return UNIT_NAMES[unitSeq++ % UNIT_NAMES.length];
  }

  var Police = {
    addWanted: function (state, n, reason) {
      var before = state.wanted;
      state.wanted = PV.clamp(state.wanted + n, 0, PV.WANTED_MAX);
      state.lastCrimeAt = state.elapsed;
      state.hideTimer = 0;
      if (state.wanted > before) {
        PV.UI.showToast('WANTED +' + n + ' — ' + (reason || 'crime'));
        PV.Audio.siren(true);
      }
      return state.wanted;
    },

    // Spawn one patrol car on a road 60-100 m from the player.
    spawnPatrol: function (state) {
      var p = state.player;
      var spot = PV.World.roadPoint(state);
      for (var tries = 0; tries < 6; tries++) {
        var dx = spot.x - p.x, dz = spot.z - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > 55 && d < 110) break;
        spot = PV.World.roadPoint(state);
      }
      var car = PV.Entities.makeVehicle(state, 'police', spot.x, spot.z, Math.atan2(p.x - spot.x, p.z - spot.z), { police: true });
      car.unitName = unitName();
      car.cruise = PV.POLICE_CAR.topSpeed * 0.92;
      state.policeCars.push(car);
      state.vehicles.push(car);
      return car;
    },

    // Two police cars parked across the road ahead of the player.
    spawnRoadblock: function (state) {
      var p = state.player;
      var ahead = p.mode === 'car' ? 55 : 30;
      var bx = p.x + Math.sin(p.heading) * ahead;
      var bz = p.z + Math.cos(p.heading) * ahead;
      var road = PV.World.nearestRoad(bx, bz);
      var across = Math.abs(road.x - bx) < Math.abs(road.z - bz) ? 'x' : 'z';
      var block = [];
      [-4.5, 4.5].forEach(function (off) {
        var x = across === 'x' ? road.x + off : road.x;
        var z = across === 'x' ? road.z : road.z + off;
        var car = PV.Entities.makeVehicle(state, 'police', x, z, p.heading + Math.PI / 2, { police: true });
        car.unitName = unitName();
        car.isRoadblock = true;
        state.policeCars.push(car);
        state.vehicles.push(car);
        block.push(car);
      });
      state.roadblocks.push(block);
      PV.UI.showToast('ROADBLOCK AHEAD');
      return block;
    },

    makeHelicopter: function (state) {
      var g = new T.Group();
      var bodyMat = new T.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.4 });
      var body = new T.Mesh(new T.BoxGeometry(2.4, 1.6, 5.2), bodyMat);
      g.add(body);
      var tail = new T.Mesh(new T.BoxGeometry(0.6, 0.6, 4.6), bodyMat);
      tail.position.set(0, 0.3, -4.4);
      g.add(tail);
      var rotor = new T.Mesh(new T.BoxGeometry(9, 0.08, 0.5), new T.MeshStandardMaterial({ color: 0x0a0a0a }));
      rotor.position.y = 1.1;
      g.add(rotor);
      var light = new T.Mesh(new T.SphereGeometry(0.4, 8, 6), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
      light.position.set(0, -0.9, 1.6);
      g.add(light);
      // The spotlight cone, aimed at the player.
      var cone = new T.Mesh(
        new T.ConeGeometry(9, 42, 16, 1, true),
        new T.MeshBasicMaterial({ color: 0xfff8c0, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false })
      );
      cone.position.y = -21;
      g.add(cone);
      g.position.set(state.player.x, 42, state.player.z - 20);
      state.scene.add(g);
      var heli = { mesh: g, rotor: rotor, unitName: 'SKY-1', x: g.position.x, z: g.position.z, y: 42 };
      state.helicopter = heli;
      return heli;
    },

    update: function (state, dt) {
      var p = state.player;
      var wanted = state.wanted;

      // -- spawn to match the wanted level -------------------------------
      state.spawnTimer -= dt;
      if (wanted >= 1 && state.policeCars.length < wanted + 1 && state.spawnTimer <= 0) {
        Police.spawnPatrol(state);
        state.spawnTimer = 1.6;
      }
      if (wanted >= 3 && state.roadblocks.length < 2 && state.roadblockTimer <= 0) {
        Police.spawnRoadblock(state);
        state.roadblockTimer = 6;
      }
      if (wanted >= 4 && !state.helicopter) {
        Police.makeHelicopter(state);
        PV.UI.showToast('VCPD HELICOPTER INBOUND');
      }
      if (wanted < 4 && state.helicopter) {
        state.scene.remove(state.helicopter.mesh);
        state.helicopter = null;
      }

      // -- patrol chase AI ------------------------------------------------
      var nearestPolice = Infinity;
      for (var i = state.policeCars.length - 1; i >= 0; i--) {
        var car = state.policeCars[i];
        if (car.wrecked) {
          state.policeCars.splice(i, 1);
          continue;
        }
        var dx = p.x - car.x, dz = p.z - car.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestPolice) nearestPolice = dist;
        if (car.isRoadblock) continue; // roadblocks hold their ground
        var wantHeading = Math.atan2(dx, dz);
        var dh = wantHeading - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        var throttle = car.speed < car.cruise ? 1 : 0.2;
        PV.Entities.updateVehicle(state, car, dt, {
          throttle: throttle,
          steer: PV.clamp(dh * 2.4, -1, 1),
          brake: false
        });
        // Ram: contact damages the player's car or the player on foot.
        if (dist < 4.5) {
          if (p.mode === 'car' && p.vehicle) {
            PV.Entities.damageVehicle(state, p.vehicle, 6 * dt);
          } else {
            Police.hurtPlayer(state, 8 * dt);
          }
          if (car.lightBar) car.lightBar.rotation.y = Math.sin(state.elapsed * 14) > 0 ? 0 : 0.2;
        }
        // Flashing light bars.
        if (car.lightBar) {
          car.lightBar.children[0].material.emissiveIntensity = Math.sin(state.elapsed * 12) > 0 ? 3 : 0.4;
          car.lightBar.children[1].material.emissiveIntensity = Math.sin(state.elapsed * 12) > 0 ? 0.4 : 3;
        }
      }

      // -- helicopter follows the player ----------------------------------
      if (state.helicopter) {
        var h = state.helicopter;
        h.x = PV.lerp(h.x, p.x, PV.clamp(dt * 0.9, 0, 1));
        h.z = PV.lerp(h.z, p.z, PV.clamp(dt * 0.9, 0, 1));
        h.mesh.position.set(h.x, 42, h.z);
        h.rotor.rotation.y += dt * 22;
        h.mesh.rotation.y = Math.atan2(p.x - h.x, p.z - h.z);
        if (nearestPolice > 90) nearestPolice = 70; // the eye in the sky sees you
      }

      // -- wanted decay: hide long enough and the heat falls --------------
      state.nearestPolice = nearestPolice;
      if (wanted > 0) {
        if (nearestPolice > 95) {
          state.hideTimer += dt;
          if (state.hideTimer > PV.WANTED_HIDE_DELAY) {
            state.wanted = Math.max(0, state.wanted - PV.WANTED_DECAY * dt);
            if (state.wanted === 0) {
              Police.clearAll(state);
              PV.UI.showToast('You lost them. Heat is gone.');
              PV.Audio.siren(false);
            }
          }
        } else {
          state.hideTimer = 0;
          state.lastSeen = { x: p.x, z: p.z };
        }
      }
    },

    hurtPlayer: function (state, amount) {
      var p = state.player;
      if (p.dead) return;
      p.health -= amount;
      if (p.health <= 0) {
        p.health = 0;
        p.dead = true;
        PV.UI.showToast('BUSTED — press R to restart at the plaza');
        PV.Main.onPlayerDown(state);
      }
    },

    clearAll: function (state) {
      for (var i = state.policeCars.length - 1; i >= 0; i--) {
        PV.Entities.removeVehicle(state, state.policeCars[i]);
      }
      state.policeCars = [];
      state.roadblocks = [];
      if (state.helicopter) {
        state.scene.remove(state.helicopter.mesh);
        state.helicopter = null;
      }
    },

    // The police response panel for the HUD: name, distance, action.
    units: function (state) {
      var p = state.player;
      var list = [];
      for (var i = 0; i < state.policeCars.length; i++) {
        var car = state.policeCars[i];
        var dx = car.x - p.x, dz = car.z - p.z;
        var dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        list.push({
          name: car.unitName || 'VCPD',
          dist: dist,
          action: car.isRoadblock ? 'ROADBLOCK' : dist < 12 ? 'RAMMING' : 'PURSUIT'
        });
      }
      if (state.helicopter) {
        list.push({ name: 'SKY-1', dist: 42, action: 'SPOTLIGHT' });
      }
      list.sort(function (a, b) { return a.dist - b.dist; });
      return list.slice(0, 6);
    }
  };

  PV.Police = Police;
})();
