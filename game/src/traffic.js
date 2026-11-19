// Traffic and pedestrians: NPC cars drive the street grid, pedestrians
// walk the sidewalks on a day/night schedule, and both can be interacted
// with — cars can be carjacked, peds can be talked to, robbed or fought.
// NPC schedules: by day they cluster around the market and offices,
// at night around the plaza and harbor bars — the city feels lived-in.
//
// Version 1.1: the city moves at a different pace after dark — traffic
// cruises faster on empty streets and pedestrians hurry home — and a
// blocked driver honks at the player instead of waiting in silence.
import * as THREE from 'three';
import { CITY, NPC_NAMES, VEHICLE_TYPES } from './config.js';
import { Ped, Vehicle, createPedMesh } from './entities.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'van', 'coupe', 'muscle'];

export class TrafficManager {
  constructor(scene, world, rand) {
    this.scene = scene;
    this.world = world;
    this.rand = rand;
    this.cars = []; // { vehicle, route, routeIndex, speed }
    this.peds = [];
    this.spawnCars(12);
    this.spawnPeds(22);
  }

  roadLines() {
    const lines = [];
    for (let i = -4; i <= 4; i++) lines.push(i * (CITY.block + CITY.road));
    return lines;
  }

  spawnCars(count) {
    const lines = this.roadLines();
    for (let i = 0; i < count; i++) {
      const type = TRAFFIC_TYPES[Math.floor(this.rand() * TRAFFIC_TYPES.length)];
      const horizontal = this.rand() > 0.5;
      const line = lines[Math.floor(this.rand() * lines.length)];
      const along = (this.rand() - 0.5) * CITY.halfSize * 1.6;
      const x = horizontal ? along : line + 3.5;
      const z = horizontal ? line + 3.5 : along;
      const heading = horizontal ? (this.rand() > 0.5 ? 0 : Math.PI) : (this.rand() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const v = new Vehicle(type, x, z, heading);
      v.mesh.userData.bodyMat.color.setHex(
        [0x3a6ea5, 0xc23b2e, 0xe8b90c, 0x7a7f85, 0x5a2e7a, 0x2e7a4a][Math.floor(this.rand() * 6)],
      );
      this.scene.add(v.mesh);
      this.cars.push({
        vehicle: v, horizontal, line, dir: horizontal ? Math.cos(heading) : -Math.sin(heading),
        cruise: 9 + this.rand() * 6, driver: true, hornTimer: 0,
      });
    }
  }

  spawnPeds(count) {
    for (let i = 0; i < count; i++) {
      const x = (this.rand() - 0.5) * CITY.halfSize * 1.6;
      const z = (this.rand() - 0.5) * CITY.halfSize * 1.6;
      const p = new Ped(x, z, false, NPC_NAMES[i % NPC_NAMES.length]);
      this.scene.add(p.mesh);
      p.home = { x, z };
      this.peds.push(p);
    }
  }

  // Pick a district for this ped based on the hour: work districts by
  // day, nightlife districts after dark.
  scheduleTarget(ped, hour) {
    const night = hour < 6 || hour > 19.5;
    const spots = night
      ? [{ x: 20, z: -20 }, { x: 150, z: 150 }, { x: 0, z: 40 }]
      : [{ x: -60, z: -100 }, { x: 0, z: -160 }, { x: 120, z: -120 }, { x: -60, z: -60 }];
    const s = spots[Math.floor(this.rand() * spots.length)];
    return { x: s.x + (this.rand() - 0.5) * 40, z: s.z + (this.rand() - 0.5) * 40 };
  }

  update(dt, playerPos, hour, onPedDeath, audio) {
    const night = hour < 6 || hour > 19.5;
    // Traffic cars cruise their road line and wrap around the city edge.
    for (const c of this.cars) {
      if (!c.driver) continue; // parked/stolen cars sit still
      const v = c.vehicle;
      // Empty streets after dark: a little faster.
      const cruise = Math.min(c.cruise * (night ? 1.15 : 1), v.topSpeed * 0.5);
      v.speed += (cruise - v.speed) * Math.min(1, dt * 2);
      const fx = Math.cos(v.heading);
      const fz = -Math.sin(v.heading);
      v.mesh.position.x += fx * v.speed * dt;
      v.mesh.position.z += fz * v.speed * dt;
      // Simple give-way: slow down if the player car is right ahead,
      // and honk about it if it goes on too long.
      c.hornTimer = Math.max(0, (c.hornTimer ?? 0) - dt);
      if (playerPos) {
        const dx = playerPos.x - v.mesh.position.x;
        const dz = playerPos.z - v.mesh.position.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 10 && Math.abs(dx * fz - dz * fx) < 3) {
          v.speed *= (1 - dt * 3);
          if (audio && c.hornTimer <= 0) { audio.horn(); c.hornTimer = 6; }
        }
      }
      const lim = CITY.halfSize + 10;
      if (v.mesh.position.x > lim || v.mesh.position.x < -lim || v.mesh.position.z > lim || v.mesh.position.z < -lim) {
        // Wrap to the opposite edge on the same road line.
        if (c.horizontal) v.mesh.position.x = -Math.sign(v.mesh.position.x) * lim;
        else v.mesh.position.z = -Math.sign(v.mesh.position.z) * lim;
      }
      this.world.resolveCollision(v.mesh.position, 2.4);
    }

    // Peds walk toward their schedule target, pause, then pick a new one.
    // Hostile peds ignore their schedule and chase the player instead.
    for (const p of this.peds) {
      if (p.dead) continue;
      if (p.hostile && playerPos) p.target = { x: playerPos.x, z: playerPos.z };
      if (!p.target) p.target = this.scheduleTarget(p, hour);
      const dx = p.target.x - p.mesh.position.x;
      const dz = p.target.z - p.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        p.waitTimer -= dt;
        if (p.waitTimer <= 0) { p.target = this.scheduleTarget(p, hour); p.waitTimer = 2 + this.rand() * 6; }
      } else {
        p.heading = Math.atan2(-dz, dx);
        p.mesh.rotation.y = p.heading;
        // After dark everyone hurries: the streets are not safe at night.
        const pace = night && !p.hostile ? p.speed * 1.3 : p.speed;
        p.mesh.position.x += Math.cos(p.heading) * pace * dt;
        p.mesh.position.z += -Math.sin(p.heading) * pace * dt;
        // Walk bob: cheap life.
        p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + p.heading)) * 0.06;
      }
      if (p.health <= 0 && !p.dead) {
        p.dead = true;
        p.mesh.rotation.z = Math.PI / 2;
        p.mesh.position.y = 0.3;
        if (onPedDeath) onPedDeath(p);
      }
    }
  }

  // Carjacking: the nearest driven traffic car within reach. The driver
  // is thrown out (and remembers it — wanted level rises).
  nearestCarjackable(pos, maxDist = 4.5) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      if (!c.driver) continue;
      const d = Math.hypot(c.vehicle.mesh.position.x - pos.x, c.vehicle.mesh.position.z - pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  carjack(car) {
    car.driver = false;
    // The ejected driver becomes a fleeing ped.
    const p = new Ped(car.vehicle.mesh.position.x + 3, car.vehicle.mesh.position.z + 3, false, 'Driver');
    p.mesh.position.y = 0;
    this.scene.add(p.mesh);
    p.target = { x: p.mesh.position.x + 40, z: p.mesh.position.z };
    p.speed = 6;
    this.peds.push(p);
    return car.vehicle;
  }

  nearestPed(pos, maxDist = 3) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.mesh.position.x - pos.x, p.mesh.position.z - pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // Enemies for fight missions: hostile peds that chase the player.
  spawnHostiles(pos, count, names) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const px = pos.x + (this.rand() - 0.5) * 16;
      const pz = pos.z + (this.rand() - 0.5) * 16;
      const p = new Ped(px, pz, true, names?.[i] || 'Enforcer');
      // Hostiles wear black: swap the constructor's mesh before adding it.
      p.mesh = createPedMesh(0x1a1a1a);
      p.mesh.position.set(px, 0, pz);
      this.scene.add(p.mesh);
      this.peds.push(p);
      out.push(p);
    }
    return out;
  }

  removePed(p) {
    this.scene.remove(p.mesh);
    this.peds = this.peds.filter((x) => x !== p);
  }
}
