// Port Verona — combat: fists, pistol, Tempest SMG, Hawk shotgun, Sledge.
// Melee is a short-range swing; guns fire hitscan tracers at the nearest
// enemy in the aim cone. Enemies are simple box figures with health that
// chase and punch the player. Weapon wheel (Q or 1–4) switches weapons;
// ammo is bought with cash at Gus, and the Sledge is a heavy melee swing.

(function () {
  'use strict';

  var U = window.PV.util;

  var WEAPONS = [
    { id: 'fists', name: 'Fists', kind: 'melee', damage: 18, rate: 0.45, range: 2.4, ammo: Infinity, icon: '✊' },
    { id: 'pistol', name: 'Pistol', kind: 'gun', damage: 26, rate: 0.32, range: 42, ammo: 60, icon: '🔫' },
    { id: 'tempest', name: 'Tempest SMG', kind: 'gun', damage: 16, rate: 0.09, range: 38, ammo: 240, icon: '💥' },
    { id: 'hawk', name: 'Hawk Shotgun', kind: 'gun', damage: 14, rate: 0.85, range: 22, ammo: 32, pellets: 6, icon: '💣' },
    { id: 'sledge', name: 'Sledge', kind: 'melee', damage: 46, rate: 0.8, range: 3.0, ammo: Infinity, icon: '🔨' },
  ];

  var state = {
    weaponIndex: 0,
    ammo: {},
    cooldown: 0,
    kills: 0,
  };

  var enemies = [];
  var tracers = [];
  var sceneRef = null;
  var rng = U.makeRng(777);

  WEAPONS.forEach(function (w) { state.ammo[w.id] = w.ammo; });

  function weapon() {
    return WEAPONS[state.weaponIndex];
  }

  function setWeapon(i) {
    state.weaponIndex = ((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    return weapon();
  }

  function cycleWeapon(dir) {
    return setWeapon(state.weaponIndex + (dir || 1));
  }

  function buyAmmo(id, count, price) {
    state.ammo[id] = (state.ammo[id] || 0) + count;
    return state.ammo[id];
  }

  function makeEnemyMesh() {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xb98a62 });
    var shirt = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
    var pants = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirt);
    body.position.y = 1.05;
    g.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.75;
    g.add(head);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.3), pants);
    legL.position.set(-0.18, 0.3, 0);
    g.add(legL);
    var legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.3), pants);
    legR.position.set(0.18, 0.3, 0);
    g.add(legR);
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.25, 0.3);
    g.add(gun);
    return g;
  }

  function spawnEnemies(x, z, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rng() * 0.5;
      var ex = x + Math.cos(a) * (8 + rng() * 10);
      var ez = z + Math.sin(a) * (8 + rng() * 10);
      var mesh = makeEnemyMesh();
      mesh.position.set(ex, 0, ez);
      sceneRef.add(mesh);
      var e = { mesh: mesh, x: ex, z: ez, health: 100, speed: 3.2 + rng() * 1.2, attackCd: 0, hitFlash: 0 };
      enemies.push(e);
      out.push(e);
    }
    return out;
  }

  function nearestEnemyInCone(x, z, heading, range, halfAngle) {
    var best = null;
    var bestD = range;
    enemies.forEach(function (e) {
      var dx = e.x - x;
      var dz = e.z - z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > range) return;
      var ang = Math.atan2(dx, dz);
      if (Math.abs(U.angleDiff(heading, ang)) > halfAngle) return;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  function addTracer(from, to) {
    var geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    sceneRef.add(line);
    tracers.push({ line: line, life: 0.09 });
  }

  function damageEnemy(e, dmg) {
    e.health -= dmg;
    e.hitFlash = 0.12;
    e.mesh.children.forEach(function (c) {
      if (c.material && c.material.emissive) c.material.emissive.setHex(0xaa0000);
    });
    if (e.health <= 0) {
      sceneRef.remove(e.mesh);
      enemies.splice(enemies.indexOf(e), 1);
      state.kills += 1;
      window.PV.audio.pickup();
      return true;
    }
    return false;
  }

  /**
   * Try to fire the current weapon. ctx: { x, z, heading, y }
   * Returns true when a shot was fired.
   */
  function attack(ctx) {
    if (state.cooldown > 0) return false;
    var w = weapon();
    if (w.kind === 'gun' && (state.ammo[w.id] || 0) <= 0) {
      if (window.PV.hud) window.PV.hud.flash('Out of ammo — see Gus for more');
      state.cooldown = 0.3;
      return false;
    }
    state.cooldown = w.rate;
    var from = { x: ctx.x, y: (ctx.y || 1.4), z: ctx.z };
    if (w.kind === 'melee') {
      window.PV.audio.punch();
      var target = nearestEnemyInCone(ctx.x, ctx.z, ctx.heading, w.range, 0.9);
      if (target) damageEnemy(target, w.damage);
      return true;
    }
    // Gun: hitscan with spread per pellet.
    window.PV.audio.shot();
    if (state.ammo[w.id] !== Infinity) state.ammo[w.id] -= 1;
    var pellets = w.pellets || 1;
    for (var i = 0; i < pellets; i++) {
      var spread = (Math.random() - 0.5) * 0.12;
      var aim = ctx.heading + spread;
      var range = w.range;
      var hit = null;
      var hitD = range;
      enemies.forEach(function (e) {
        var dx = e.x - ctx.x;
        var dz = e.z - ctx.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > range) return;
        if (Math.abs(U.angleDiff(aim, Math.atan2(dx, dz))) > 0.06) return;
        if (d < hitD) {
          hitD = d;
          hit = e;
        }
      });
      var end = {
        x: ctx.x + Math.sin(aim) * hitD,
        y: 1.2,
        z: ctx.z + Math.cos(aim) * hitD,
      };
      addTracer(from, end);
      if (hit) damageEnemy(hit, w.damage);
    }
    window.PV.police.addHeat('shooting');
    return true;
  }

  /** Enemies chase the player and punch when close. */
  function update(dt, player) {
    if (state.cooldown > 0) state.cooldown -= dt;
    tracers.slice().forEach(function (t) {
      t.life -= dt;
      if (t.life <= 0) {
        sceneRef.remove(t.line);
        tracers.splice(tracers.indexOf(t), 1);
      }
    });
    enemies.slice().forEach(function (e) {
      var dx = player.x - e.x;
      var dz = player.z - e.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.01) {
        e.x += (dx / d) * e.speed * dt;
        e.z += (dz / d) * e.speed * dt;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      // Walk bob.
      e.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + e.x)) * 0.06;
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        if (e.hitFlash <= 0) {
          e.mesh.children.forEach(function (c) {
            if (c.material && c.material.emissive) c.material.emissive.setHex(0x000000);
          });
        }
      }
      e.attackCd -= dt;
      if (d < 1.6 && e.attackCd <= 0) {
        e.attackCd = 0.9;
        player.damage(12);
        window.PV.audio.punch();
      }
    });
  }

  function clearEnemies() {
    enemies.slice().forEach(function (e) { sceneRef.remove(e.mesh); });
    enemies = [];
  }

  function init(scene) {
    sceneRef = scene;
    enemies = [];
    tracers = [];
    state.kills = 0;
  }

  window.PV = window.PV || {};
  window.PV.combat = {
    weapons: WEAPONS,
    state: state,
    init: init,
    update: update,
    attack: attack,
    weapon: weapon,
    setWeapon: setWeapon,
    cycleWeapon: cycleWeapon,
    buyAmmo: buyAmmo,
    spawnEnemies: spawnEnemies,
    clearEnemies: clearEnemies,
    enemies: function () { return enemies; },
  };
})();
