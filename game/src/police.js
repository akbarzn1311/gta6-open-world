// Police: the wanted system and its dispatch escalation. Heat rises when
// the player commits crimes (carjacking, shooting, killing) and falls when
// the player stays out of sight. The response escalates with the level:
// patrol cars chase, roadblocks cut off escape routes, and a helicopter
// joins at four stars and above.
// dispatch system: escalates based on wantedLevel
import * as THREE from 'three';
import { Vehicle } from './entities.js';

export class PoliceManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = 0;
    this.heat = 0; // 0-100 within the current wanted level
    this.cops = []; // Vehicle instances chasing the player
    this.roadblocks = [];
    this.heli = null;
    this.heliLight = null;
    this.spawnTimer = 0;
    this.calmTimer = 0;
    this.flash = 0;
  }

  addHeat(amount, reason) {
    this.heat += amount;
    const next = Math.min(5, Math.floor(this.heat / 20) + (this.heat > 0 ? 0 : 0));
    const level = Math.min(5, Math.ceil(this.heat / 20));
    if (level > this.wanted) {
      this.wanted = level;
      this.onEscalation?.(level, reason);
    }
  }

  setWanted(level) {
    this.wanted = Math.max(0, Math.min(5, level));
    this.heat = this.wanted * 20;
  }

  // How many patrol cars the current level fields.
  desiredCops() {
    return [0, 1, 2, 3, 4, 5][this.wanted];
  }

  spawnCop(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const x = playerPos.x + Math.cos(angle) * 70;
    const z = playerPos.z + Math.sin(angle) * 70;
    const cop = new Vehicle('police', x, z, Math.atan2(-(playerPos.z - z), playerPos.x - x));
    cop.maxHealth = 150;
    cop.health = 150;
    this.scene.add(cop.mesh);
    this.cops.push(cop);
  }

  spawnRoadblock(playerPos, heading) {
    // Three cop cars parked across the road ahead of the player.
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    const bx = playerPos.x + fx * 45;
    const bz = playerPos.z + fz * 45;
    const group = [];
    for (let i = -1; i <= 1; i++) {
      const cop = new Vehicle('police', bx - fz * i * 6, bz + fx * i * 6, heading + Math.PI / 2);
      cop.speed = 0;
      this.scene.add(cop.mesh);
      group.push(cop);
    }
    this.roadblocks.push({ cars: group, x: bx, z: bz, life: 25 });
  }

  spawnHeli(playerPos) {
    if (this.heli) return;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x1c2f6e, roughness: 0.4, metalness: 0.5 }));
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1c2f6e, roughness: 0.4 }));
    tail.position.set(-4, 0.3, 0);
    group.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    rotor.position.y = 1.2;
    group.add(rotor);
    group.userData.rotor = rotor;
    this.heliLight = new THREE.SpotLight(0xffffff, 60, 60, 0.35, 0.5);
    this.heliLight.position.set(0, -1, 0);
    group.add(this.heliLight);
    this.heliLight.target.position.set(0, -30, 0);
    group.add(this.heliLight.target);
    group.position.set(playerPos.x + 20, 45, playerPos.z + 20);
    this.scene.add(group);
    this.heli = group;
  }

  removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null;
    this.heliLight = null;
  }

  update(dt, playerPos, playerSpeed, inVehicle, audio) {
    // Calm down: no crime for a while and no cop nearby -> heat decays.
    const nearestCop = this.cops.reduce((m, c) => Math.min(m, Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z)), 999);
    if (nearestCop > 55) {
      this.calmTimer += dt;
      if (this.calmTimer > 8) {
        this.heat = Math.max(0, this.heat - dt * 4);
        const level = Math.ceil(this.heat / 20);
        if (level < this.wanted) this.wanted = level;
      }
    } else this.calmTimer = 0;

    // Dispatch: keep the right number of patrol cars in the field.
    this.spawnTimer -= dt;
    if (this.cops.length < this.desiredCops() && this.spawnTimer <= 0 && this.wanted > 0) {
      this.spawnCop(playerPos);
      this.spawnTimer = 4;
    }
    // Roadblocks from 3 stars: one at a time, ahead of the player's travel.
    if (this.wanted >= 3 && this.roadblocks.length === 0 && this.spawnTimer <= -6) {
      this.spawnRoadblock(playerPos, playerPos.heading || 0);
      this.spawnTimer = 0;
    }
    // Helicopter from 4 stars.
    if (this.wanted >= 4) this.spawnHeli(playerPos);
    else this.removeHeli();

    // Cop AI: steer toward the player, ram at close range. If the player
    // is on foot and slow, cops get out and chase on foot (simplified:
    // they stop 4 units away and the player takes damage if too close).
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (cop.dead) {
        this.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
        continue;
      }
      const dx = playerPos.x - cop.mesh.position.x;
      const dz = playerPos.z - cop.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(-dz, dx);
      let dh = targetHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      cop.speed += (Math.min(cop.topSpeed, 20 + this.wanted * 4) - cop.speed) * Math.min(1, dt * 1.2);
      if (dist < 5) cop.speed = Math.max(cop.speed, 6); // ram
      const fx = Math.cos(cop.heading);
      const fz = -Math.sin(cop.heading);
      cop.mesh.position.x += fx * cop.speed * dt;
      cop.mesh.position.z += fz * cop.speed * dt;
      cop.mesh.rotation.y = cop.heading;
      // Flashing light bar.
      this.flash += dt;
      if (cop.mesh.userData.lightBar) {
        cop.mesh.userData.lightBar.material.emissive.setHex(Math.floor(this.flash * 4) % 2 === 0 ? 0xff2222 : 0x2244ff);
      }
      this.world.resolveCollision(cop.mesh.position, 2.4);
    }

    // Roadblocks expire; their cars stay parked until then.
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.life -= dt;
      if (rb.life <= 0) {
        rb.cars.forEach((c) => this.scene.remove(c.mesh));
        this.roadblocks.splice(i, 1);
      }
    }

    // Helicopter hovers above the player and tracks them.
    if (this.heli) {
      const h = this.heli;
      h.position.x += (playerPos.x + 12 - h.position.x) * Math.min(1, dt * 0.8);
      h.position.z += (playerPos.z + 12 - h.position.z) * Math.min(1, dt * 0.8);
      h.position.y = 42 + Math.sin(performance.now() * 0.001) * 2;
      h.userData.rotor.rotation.y += dt * 25;
      h.rotation.y += dt * 0.2;
    }

    if (audio) audio.setSiren(this.wanted >= 2 && this.cops.length > 0);
    return nearestCop;
  }

  // Shooting a cop car: damage + heat. Returns true if it was destroyed.
  hitCop(cop, damage) {
    cop.damage(damage);
    if (cop.dead) {
      this.addHeat(15, 'cop destroyed');
      return true;
    }
    return false;
  }

  clearAll() {
    this.cops.forEach((c) => this.scene.remove(c.mesh));
    this.cops = [];
    this.roadblocks.forEach((rb) => rb.cars.forEach((c) => this.scene.remove(c.mesh)));
    this.roadblocks = [];
    this.removeHeli();
    this.wanted = 0;
    this.heat = 0;
  }
}
