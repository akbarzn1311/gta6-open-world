// World: the city of Port Verona itself — street grid, buildings, unique
// landmarks, sky, day/night lighting and dynamic weather. Everything is
// procedural geometry (boxes, cylinders, cones) so no texture files exist.
import * as THREE from 'three';
import { CITY } from './config.js';

// Deterministic pseudo-random generator so ?seed= gives the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = [0x8a7f72, 0x6f7f8a, 0x9a8a6a, 0x7a6a8a, 0x5f6a7a, 0xa08a7a, 0x6a7a6a, 0x8a6a5a];
const WINDOW_COLOR = 0xffe9a8;

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.rand = mulberry32(seed);
    // Axis-aligned building colliders the player and cars slide against.
    this.colliders = [];
    this.lamps = [];
    this.trees = [];
    this.hour = CITY.startHour;
    this.weather = 'clear'; // clear | cloud | rain
    this.weatherTimer = 0;
    this.rain = null;
    this.rainVel = [];
    this.traction = 1.0; // rain lowers this: wet roads really do slide
    this.particles = [];
    this.particlePool = [];
    this.sun = new THREE.DirectionalLight(0xffc98a, 2.2);
    this.sun.position.set(120, 60, -80);
    this.sun.castShadow = false;
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0x9db8ff, 0x3a2f28, 0.7);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xd8a06a, 120, 420);
    this.build();
  }

  roadCoord(i) { return i * (CITY.block + CITY.road); }

  build() {
    const s = this.scene;
    const rand = this.rand;
    // Ground + water at the harbor edge (east side).
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.halfSize * 2 + 200, CITY.halfSize * 2 + 200),
      new THREE.MeshStandardMaterial({ color: 0x3d3a38, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, CITY.halfSize * 2 + 200),
      new THREE.MeshStandardMaterial({ color: 0x1c4a6e, roughness: 0.25, metalness: 0.4 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(CITY.halfSize + 100, 0.05, 0);
    s.add(water);

    // Roads: dark asphalt strips with pale center dashes, on a grid.
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.95 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8c98a, roughness: 0.9 });
    const n = 4; // roads at -4..4 grid lines: ±216, inside halfSize 240
    for (let i = -n; i <= n; i++) {
      const c = this.roadCoord(i);
      const h = new THREE.Mesh(new THREE.BoxGeometry(CITY.halfSize * 2 + 40, 0.1, CITY.road), roadMat);
      h.position.set(0, 0.05, c); s.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(CITY.road, 0.1, CITY.halfSize * 2 + 40), roadMat);
      v.position.set(c, 0.05, 0); s.add(v);
      for (let d = -CITY.halfSize; d < CITY.halfSize; d += 12) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.6), dashMat);
        dash.position.set(d, 0.12, c); s.add(dash);
        const dash2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 4), dashMat);
        dash2.position.set(c, 0.12, d); s.add(dash2);
      }
    }

    // City blocks: varied building heights and colours, windows as a
    // single emissive strip per building (cheap, reads well at dusk).
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: WINDOW_COLOR, emissiveIntensity: 0.7 });
    for (let bx = -n; bx < n; bx++) {
      for (let bz = -n; bz < n; bz++) {
        const cx = this.roadCoord(bx) + (CITY.block + CITY.road) / 2;
        const cz = this.roadCoord(bz) + (CITY.block + CITY.road) / 2;
        // Keep the plaza, park, garage lot and tower square open.
        if (this.isSpecialBlock(cx, cz)) continue;
        const w = 16 + rand() * 16;
        const d = 16 + rand() * 16;
        const h = 8 + rand() * rand() * 42;
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
        );
        b.position.set(cx, h / 2, cz);
        s.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.5, d * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 }));
        roof.position.set(cx, h + 0.75, cz);
        s.add(roof);
        // Lit windows: one glowing band per face, cheap at night.
        const win = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, Math.min(h * 0.5, 10), d + 0.2), winMat);
        win.position.set(cx, h * 0.45, cz);
        s.add(win);
        this.colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2 });
      }
    }

    this.buildLandmarks(s, rand);
    this.buildStreetProps(s, rand);
    this.buildRain();
    this.applyLighting();
  }

  isSpecialBlock(cx, cz) {
    // Grand Plaza (20,-20), park (-60,-60), garage lot (-120,60),
    // stadium (120,-120), tower square (0,-160), pier (150,150).
    const specials = [[20, -20], [-60, -60], [-120, 60], [120, -120], [0, -160], [150, 150], [0, 40]];
    return specials.some(([x, z]) => Math.abs(cx - x) < 30 && Math.abs(cz - z) < 30);
  }

  buildLandmarks(scene, rand) {
    // Verona Tower — the signature shot: a tall glass tower with a lit crown.
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(22, 95, 22),
      new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.3, metalness: 0.6 }),
    );
    tower.position.set(0, 47.5, -160);
    scene.add(tower);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(24, 4, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc94d, emissiveIntensity: 1.6 }),
    );
    crown.position.set(0, 97, -160);
    scene.add(crown);
    this.colliders.push({ x: 0, z: -160, hw: 11, hd: 11 });

    // Harbor Bridge — arched span over the water on the east edge.
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(14, 1.2, 8, 16, Math.PI), bridgeMat);
      arch.position.set(150 + i * 22, 2, 0);
      arch.rotation.y = Math.PI / 2;
      scene.add(arch);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(120, 1.5, 16), bridgeMat);
    deck.position.set(205, 8, 0);
    scene.add(deck);

    // Sunset Pier — wooden planks reaching into the water.
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 10), pierMat);
    pier.position.set(210, 1, 150);
    scene.add(pier);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 4, 8), pierMat);
      post.position.set(190 + i * 8, 1, 150);
      scene.add(post);
    }

    // Stadium — a low ring with floodlight masts.
    const stadium = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 28, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 0.9 }),
    );
    stadium.position.set(120, 6, -120);
    scene.add(stadium);
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, 2, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 1 }),
    );
    bowl.position.set(120, 12.5, -120);
    scene.add(bowl);
    this.colliders.push({ x: 120, z: -120, hw: 26, hd: 26 });

    // Grand Plaza fountain.
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 9, 1.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6 }),
    );
    fountain.position.set(20, 0.75, -20);
    scene.add(fountain);
    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6ab8ff, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.8 }),
    );
    jet.position.set(20, 4, -20);
    scene.add(jet);

    // Park trees + garage lot marker.
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6a2f, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const x = -90 + rand() * 60;
      const z = -90 + rand() * 60;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), trunkMat);
      trunk.position.set(x, 2, z);
      scene.add(trunk);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.5 + rand() * 1.5, 8, 6), leafMat);
      leaves.position.set(x, 5.5, z);
      scene.add(leaves);
      this.trees.push(leaves);
    }
    // Garage building.
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(24, 9, 16),
      new THREE.MeshStandardMaterial({ color: 0xb05a2a, roughness: 0.8 }),
    );
    garage.position.set(-120, 4.5, 60);
    scene.add(garage);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(20, 2.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff8a2a, emissiveIntensity: 1.2 }),
    );
    sign.position.set(-120, 9, 68.2);
    scene.add(sign);
    this.colliders.push({ x: -120, z: 60, hw: 12, hd: 8 });
  }

  buildStreetProps(scene, rand) {
    // Street lamps: glow at night, and they mark the roads on the minimap.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd98a, emissiveIntensity: 0 });
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j += 2) {
        const x = this.roadCoord(i);
        const z = this.roadCoord(j) + 8;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 6), poleMat);
        pole.position.set(x, 3.5, z);
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat.clone());
        lamp.position.set(x, 7.2, z);
        scene.add(lamp);
        this.lamps.push(lamp);
      }
    }
    // Parked cars as scenery near the plaza (not drivable, just city life).
    for (let i = 0; i < 8; i++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 2), new THREE.MeshStandardMaterial({ color: BUILDING_COLORS[i % BUILDING_COLORS.length], roughness: 0.4, metalness: 0.5 }));
      body.position.y = 0.7;
      car.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.8), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.2, metalness: 0.6 }));
      cab.position.set(-0.2, 1.5, 0);
      car.add(cab);
      car.position.set(-40 + i * 9, 0, -28);
      car.rotation.y = 0.1 * i;
      scene.add(car);
    }
  }

  buildRain() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (this.rand() - 0.5) * 240;
      pos[i * 3 + 1] = this.rand() * 60;
      pos[i * 3 + 2] = (this.rand() - 0.5) * 240;
      this.rainVel.push(28 + this.rand() * 12);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9ab8d8, size: 0.35, transparent: true, opacity: 0.6 }));
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // --- Particles: one pooled Points cloud for exhaust, muzzle sparks,
  // fire and smoke. Cheap, and it sells the action in screenshots. ---
  spawnParticles(pos, color, count, speed, life, size = 0.5) {
    for (let i = 0; i < count; i++) {
      let p = this.particlePool.pop();
      if (!p) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9 }));
        p.userData.vel = new THREE.Vector3();
        this.scene.add(p);
      }
      p.material.color.setHex(color);
      p.material.size = size;
      p.position.copy(pos);
      p.userData.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      p.userData.life = life * (0.6 + Math.random() * 0.7);
      p.userData.maxLife = p.userData.life;
      p.visible = true;
      this.particles.push(p);
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        p.visible = false;
        this.particles.splice(i, 1);
        this.particlePool.push(p);
        continue;
      }
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 2 * dt;
      p.material.opacity = 0.9 * (p.userData.life / p.userData.maxLife);
    }
  }

  // --- Day/night + weather: the sun angle, sky colour, fog and lamp
  // glow all follow the clock; weather cycles on a timer. ---
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.applyLighting(); }

  setWeather(w) {
    this.weather = w;
    this.rain.visible = w === 'rain';
    this.traction = w === 'rain' ? 0.62 : 1.0;
    this.applyLighting();
  }

  applyLighting() {
    const h = this.hour;
    // Sun elevation: peaks at 13:00, below the horizon at night.
    const sunAngle = ((h - 6) / 12) * Math.PI;
    const elev = Math.sin(sunAngle);
    const day = Math.max(0, Math.min(1, elev * 2.2));
    const dusk = Math.max(0, 1 - Math.abs(elev) * 3) * (elev > -0.15 ? 1 : 0);
    this.sun.position.set(Math.cos(sunAngle) * 160, Math.max(8, elev * 140), -80);
    const warm = new THREE.Color(0xff9a4d);
    const noon = new THREE.Color(0xfff2d8);
    const night = new THREE.Color(0x2a3a6a);
    this.sun.color.copy(warm).lerp(noon, Math.min(1, day));
    if (day < 0.15) this.sun.color.copy(night);
    this.sun.intensity = 0.25 + day * 2.0 + dusk * 0.8;
    this.hemi.intensity = 0.25 + day * 0.55;
    const skyDay = new THREE.Color(0x87b8e8);
    const skyDusk = new THREE.Color(0xe88a4d);
    const skyNight = new THREE.Color(0x0d1526);
    const sky = skyNight.clone();
    if (day > 0) sky.lerp(skyDay, day);
    if (dusk > 0) sky.lerp(skyDusk, dusk * 0.7);
    if (this.weather === 'rain') sky.lerp(new THREE.Color(0x4a5566), 0.55);
    if (this.weather === 'cloud') sky.lerp(new THREE.Color(0x8a94a8), 0.35);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    const nightOn = day < 0.25;
    this.lamps.forEach((l) => { l.material.emissiveIntensity = nightOn ? 1.8 : 0; });
  }

  isNight() { return this.hour < 6 || this.hour > 19.5; }

  // Collision: push a circle (player/car) out of building boxes.
  resolveCollision(pos, radius) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const px = c.hw + radius - Math.abs(dx);
      const pz = c.hd + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) pos.x = c.x + Math.sign(dx || 1) * (c.hw + radius);
        else pos.z = c.z + Math.sign(dz || 1) * (c.hd + radius);
        return true;
      }
    }
    const lim = CITY.halfSize;
    if (pos.x > lim) pos.x = lim;
    if (pos.x < -lim) pos.x = -lim;
    if (pos.z > lim) pos.z = lim;
    if (pos.z < -lim) pos.z = -lim;
    return false;
  }

  update(dt, focusPos) {
    // Clock advances; a full day is 8 minutes of play.
    this.hour += (dt / CITY.dayLengthSec) * 24;
    if (this.hour >= 24) this.hour -= 24;
    this.applyLighting();
    // Weather changes every ~50 seconds, weighted to mostly clear.
    this.weatherTimer += dt;
    if (this.weatherTimer > 50) {
      this.weatherTimer = 0;
      const r = Math.random();
      this.setWeather(r < 0.6 ? 'clear' : r < 0.8 ? 'cloud' : 'rain');
    }
    if (this.rain.visible && focusPos) {
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - this.rainVel[i] * dt;
        if (y < 0) {
          y = 50 + Math.random() * 10;
          pos.setX(i, focusPos.x + (Math.random() - 0.5) * 120);
          pos.setZ(i, focusPos.z + (Math.random() - 0.5) * 120);
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    this.updateParticles(dt);
  }
}
