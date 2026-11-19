// Entities: component-based vehicles and pedestrians. A vehicle is a
// mesh group plus a small state object (speed, health, upgrades); a ped
// is a mesh plus a behaviour state. Damage is visual AND mechanical:
// a battered car smokes, loses top speed and handles worse.
//
// Version 1.1: cars get red tail lights at the rear (they read at night
// and make traffic visible from behind in chase shots).
import * as THREE from 'three';
import { VEHICLE_TYPES } from './config.js';

const PED_SHIRTS = [0xc23b2e, 0x2e7a4a, 0x3a6ea5, 0xe8b90c, 0x7a4a9a, 0xd87a2a, 0x4a9a8a];
const PED_PANTS = [0x222831, 0x3a3a4a, 0x4a2a2a, 0x2a3a2a];

export function createVehicleMesh(type, colorHex) {
  const def = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex ?? def.color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 2.1), bodyMat);
  body.position.y = 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.85, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 0.15, metalness: 0.7 }),
  );
  cabin.position.set(-0.2, 1.6, 0);
  group.add(cabin);
  if (type === 'van') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.0), bodyMat);
    box.position.set(-1.2, 1.5, 0);
    group.add(box);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1.5 }));
    bar.position.set(-0.2, 2.1, 0);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  [[1.5, 1.0], [1.5, -1.0], [-1.5, 1.0], [-1.5, -1.0]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.42, z);
    group.add(w);
    wheels.push(w);
  });
  // Headlights: emissive at night.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  [[2.32, 0.7], [2.32, -0.7]].forEach(([x, z]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.35), lightMat);
    l.position.set(x, 0.75, z);
    group.add(l);
  });
  // Tail lights: red emissive boxes at the rear, visible in the dark.
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xcc2222, emissiveIntensity: 1.1 });
  [[-2.32, 0.7], [-2.32, -0.7]].forEach(([x, z]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.35), tailMat);
    l.position.set(x, 0.75, z);
    group.add(l);
  });
  group.userData = { ...group.userData, wheels, bodyMat };
  return group;
}

export function createPedMesh(shirtColor, skinColor = 0xc98a5a) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor ?? PED_SHIRTS[0], roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.35),
    new THREE.MeshStandardMaterial({ color: PED_PANTS[Math.floor(Math.random() * PED_PANTS.length)], roughness: 1 }));
  legs.position.y = 0.45;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), shirt);
  torso.position.y = 1.2;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
  head.position.y = 1.85;
  group.add(head);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  [-0.45, 0.45].forEach((x) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), armMat);
    arm.position.set(x, 1.2, 0);
    group.add(arm);
  });
  return group;
}

// A drivable vehicle: arcade physics with a damage model. Handling,
// top speed and smoke all degrade as health falls, and upgrades from
// the garage feed straight into these numbers.
export class Vehicle {
  constructor(type, x, z, heading = 0, upgrades = null) {
    this.type = type;
    this.def = VEHICLE_TYPES[type];
    this.mesh = createVehicleMesh(type);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.upgrades = upgrades || { engine: 0, armor: 0, paint: 0 };
    this.smokeTimer = 0;
    this.dead = false;
  }

  get topSpeed() {
    const eng = [1, 1.12, 1.25, 1.45][this.upgrades.engine] || 1;
    const dmg = this.health < 30 ? 0.6 : this.health < 60 ? 0.8 : 1;
    return this.def.topSpeed * eng * dmg;
  }
  get accel() {
    const eng = [1, 1.15, 1.35, 1.6][this.upgrades.engine] || 1;
    return this.def.accel * eng;
  }
  get maxHp() {
    const arm = [1, 1.5, 2.2, 3.2][this.upgrades.armor] || 1;
    return 100 * arm;
  }

  applyPaint(colorHex) {
    this.mesh.userData.bodyMat.color.setHex(colorHex);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  // Arcade car update: accelerate, steer harder at low speed, slide
  // when the road is wet (traction from the world weather).
  update(dt, input, traction) {
    if (this.dead) { this.speed *= (1 - dt * 2); }
    else if (input.forward) this.speed += this.accel * dt;
    else if (input.back) this.speed -= this.accel * 0.8 * dt;
    else this.speed *= (1 - dt * 0.9);
    if (input.handbrake) this.speed *= (1 - dt * 4);
    this.speed = Math.max(-12, Math.min(this.topSpeed, this.speed));
    const grip = this.def.grip * traction;
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += this.steer * 1.9 * grip * dt * dir * Math.min(1, Math.abs(this.speed) / 8);
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    this.mesh.position.x += fx * this.speed * dt;
    this.mesh.position.z += fz * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    // Wheels spin with speed; front wheels yaw with steering.
    const spin = (this.speed * dt) / 0.42;
    this.mesh.userData.wheels.forEach((w, i) => {
      w.rotation.z += spin;
      if (i < 2) w.rotation.y = this.steer * 0.4;
    });
    // Damage smoke: a battered car is visible from across the city.
    if (this.health < 50 && !this.dead) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        return { smoke: new THREE.Vector3(this.mesh.position.x, 1.4, this.mesh.position.z) };
      }
    }
    return null;
  }
}

export class Ped {
  constructor(x, z, hostile = false, name = 'Ped') {
    this.name = name;
    this.hostile = hostile;
    this.mesh = createPedMesh(PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)]);
    this.mesh.position.set(x, 0, z);
    this.health = hostile ? 60 : 40;
    this.speed = hostile ? 5.5 : 3.2;
    this.heading = Math.random() * Math.PI * 2;
    this.target = null;
    this.dead = false;
    this.state = 'walk';
    this.waitTimer = 0;
  }
}
