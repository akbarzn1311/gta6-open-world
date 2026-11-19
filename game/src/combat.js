// Combat: weapons, the radial weapon wheel, shooting and melee.
// Shooting uses a raycast against peds and police cars; every shot is
// a crime, so firing in the open raises the wanted level — the combat
// system and the police system are wired together on purpose.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';

export class Combat {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.current = 'pistol';
    this.ammo = { pistol: 120, smg: 240, shotgun: 48, rifle: 180 };
    this.cooldown = 0;
    this.wheelOpen = false;
    this.raycaster = new THREE.Raycaster();
    this.muzzleTimer = 0;
  }

  unlockedWeapons() {
    return WEAPON_ORDER.filter((id) => (WEAPONS[id].respect || 0) <= this.game.state.respect);
  }

  select(id) {
    if (!WEAPON_ORDER.includes(id)) return;
    if ((WEAPONS[id].respect || 0) > this.game.state.respect) {
      this.game.toast(`Locked — needs ${WEAPONS[id].respect} respect`);
      this.game.audio.denied();
      return;
    }
    this.current = id;
    this.game.state.weapon = id;
    this.game.toast(WEAPONS[id].name);
  }

  cycle(dir) {
    const list = this.unlockedWeapons();
    const i = list.indexOf(this.current);
    this.select(list[(i + dir + list.length) % list.length]);
  }

  // Fire from the camera through the crosshair. Hits the nearest ped
  // or police car on the ray; misses kick up a spark where they land.
  shoot(origin, direction) {
    if (this.cooldown > 0) return;
    const w = WEAPONS[this.current];
    if (w.melee) { this.melee(origin, direction); return; }
    if ((this.ammo[this.current] ?? 0) <= 0) {
      this.game.toast('Out of ammo — buy more at the garage');
      this.game.audio.denied();
      this.cooldown = 0.4;
      return;
    }
    this.ammo[this.current] -= 1;
    this.cooldown = w.rate;
    this.game.audio.shoot();
    const start = origin.clone();
    const muzzle = start.clone().addScaledVector(direction, 1.5);
    muzzle.y = Math.max(muzzle.y, 1.2);
    this.world.spawnParticles(muzzle, 0xffd24d, 6, 4, 0.25, 0.35);
    this.raycaster.set(start, direction);
    this.raycaster.far = w.range;
    const targets = [];
    for (const p of this.game.traffic.peds) if (!p.dead) targets.push(p.mesh);
    for (const c of this.game.police.cops) targets.push(c.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      const hit = hits[0];
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
      this.world.spawnParticles(hit.point, 0xff5544, 10, 6, 0.4, 0.4);
      this.game.audio.hit();
      const ped = this.game.traffic.peds.find((p) => p.mesh === obj);
      if (ped) {
        ped.health -= w.damage;
        if (ped.hostile) this.game.missions.onKill();
        if (ped.health <= 0) {
          this.game.police.addHeat(ped.hostile ? 8 : 20, ped.hostile ? 'hostile down' : 'civilian shot');
        } else if (!ped.hostile) {
          this.game.police.addHeat(10, 'shot fired at civilian');
        }
      }
      const cop = this.game.police.cops.find((c) => c.mesh === obj);
      if (cop) {
        const destroyed = this.game.police.hitCop(cop, w.damage);
        if (destroyed) {
          this.world.spawnParticles(cop.mesh.position.clone().setY(1.5), 0xff8800, 30, 8, 1.2, 0.8);
          this.game.audio.crash();
        }
      }
    } else {
      // Miss: spark at the far end of the ray so the shot reads.
      const end = start.clone().addScaledVector(direction, w.range);
      end.y = Math.max(end.y, 0.2);
      this.world.spawnParticles(end, 0xffd24d, 3, 2, 0.2, 0.25);
      this.game.police.addHeat(3, 'shots fired');
    }
  }

  // Melee: a short arc in front of the player, no ammo, no noise.
  melee(origin, direction) {
    this.cooldown = WEAPONS.fists.rate;
    this.game.audio.blip(180, 0.1, 'sine', 0.3);
    const range = WEAPONS.fists.range;
    for (const p of this.game.traffic.peds) {
      if (p.dead) continue;
      const dx = p.mesh.position.x - origin.x;
      const dz = p.mesh.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist < range) {
        const facing = dx * direction.x + dz * direction.z;
        if (facing > 0) {
          p.health -= WEAPONS.fists.damage;
          this.world.spawnParticles(p.mesh.position.clone().setY(1.4), 0xffffff, 5, 3, 0.3, 0.3);
          if (p.hostile) this.game.missions.onKill();
          if (p.health <= 0) this.game.police.addHeat(p.hostile ? 8 : 15, 'melee');
        }
      }
    }
  }

  // Hostile peds that reach the player hurt them.
  hostileContact(playerPos, dt) {
    for (const p of this.game.traffic.peds) {
      if (!p.hostile || p.dead) continue;
      const d = Math.hypot(p.mesh.position.x - playerPos.x, p.mesh.position.z - playerPos.z);
      if (d < 2.2) {
        this.game.damagePlayer(12 * dt);
      }
    }
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
  }

  serialize() { return { current: this.current, ammo: this.ammo }; }
  restore(data) {
    if (!data) return;
    if (data.current) this.current = data.current;
    if (data.ammo) this.ammo = { ...this.ammo, ...data.ammo };
  }
}
