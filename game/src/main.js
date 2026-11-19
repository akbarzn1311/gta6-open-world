// Boot and the one loop: Port Verona, an open-world crime game.
// Input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. Screens: title, play, paused,
// garage, dead. ?shot=start|play|chase|end stages a scene for a
// screenshot instead of the title screen and sets window.__shotReady.
//
// Version 1.1 (rewritten in the recorded session): the traffic update
// gets the audio engine so blocked drivers can honk, and the chase
// staging adds a roadblock ahead of the player for a busier frame.
import * as THREE from 'three';
import { CITY, PLAYER, VERSION, WEAPONS, WEAPON_ORDER, GARAGE_UPGRADES, GARAGE_POS, SPAWN_POS, MISSIONS } from './config.js';
import { World, mulberry32 } from './world.js';
import { Vehicle, Ped, createPedMesh } from './entities.js';
import { TrafficManager } from './traffic.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { saveGame, loadGame, hasSave } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.world = new World(this.scene, seed);
    this.rand = mulberry32(seed + 7);
    this.traffic = new TrafficManager(this.scene, this.world, this.rand);
    this.police = new PoliceManager(this.scene, this.world);
    this.audio = new AudioEngine();
    this.combat = new Combat(this.scene, this.world, this);
    this.missions = new MissionManager(this.scene, this);
    this.ui = new UI(this);
    this.police.onEscalation = (level) => {
      this.ui.toast(`${'★'.repeat(level)} Wanted level ${level} — VCPD is coming`);
      this.audio.blip(440, 0.3, 'square', 0.3);
    };

    // Player state: money and respect are the progression that gates
    // missions, garage tiers and weapons.
    this.state = {
      health: PLAYER.health, armor: 0, money: 150, respect: 0,
      weapon: 'pistol', px: SPAWN_POS.x, pz: SPAWN_POS.z, heading: 0,
      upgrades: { engine: 0, armor: 0, paint: 0 },
      inVehicle: false, carType: 'sedan',
    };
    this.playerMesh = createPedMesh(0xc23b2e, 0xd8a070);
    this.playerMesh.position.set(SPAWN_POS.x, 0, SPAWN_POS.z);
    this.scene.add(this.playerMesh);
    this.currentVehicle = null;
    this.parkedCars = [];
    this.missionCar = null;
    this.escortVan = null;
    this.escortDone = false;
    this.race = null;
    this.raceResult = null;
    this.delivery = null;
    this.screen = 'title';
    this.camYaw = Math.PI;
    this.camPitch = 0.35;
    this.keys = new Set();
    this.mouseDown = false;
    this.lastMouse = { x: 0, y: 0 };
    this.autosaveTimer = 0;
    this.deadTimer = 0;
    this.exhaustTimer = 0;
    this.cinematic = false;
    this.bindInput();
    this.bindMenus();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  announce(msg) { status.textContent = msg; }
  toast(msg) { this.ui.toast(msg); }
  showDialogue(giver, text) { this.ui.showDialogue(giver, text); }

  // --- Input: keyboard + mouse drag orbit. Clicking the canvas also
  // requests pointer lock for a steadier camera; drag works without it. ---
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.audio.init();
      if (this.screen !== 'play') return;
      if (e.code === 'KeyQ') { this.combat.wheelOpen = true; this.ui.show('wheel'); }
      if (e.code === 'Digit1') this.combat.select('fists');
      if (e.code === 'Digit2') this.combat.select('pistol');
      if (e.code === 'Digit3') this.combat.select('smg');
      if (e.code === 'Digit4') this.combat.select('shotgun');
      if (e.code === 'Digit5') this.combat.select('rifle');
      if (e.code === 'KeyR') this.toast(`Radio: ${this.audio.setStation(this.audio.station + 1)}`);
      if (e.code === 'KeyM') this.startMission();
      if (e.code === 'KeyP') { this.autosave(); this.toast('Game saved'); }
      if (e.code === 'KeyE') this.tryEnterCar();
      if (e.code === 'KeyF') this.interact();
      if (e.code === 'Escape') this.pause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyQ' && this.combat.wheelOpen) {
        this.combat.wheelOpen = false;
        this.ui.hide('wheel');
        this.selectWheelByMouse();
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.audio.init();
      if (this.screen !== 'play') return;
      this.mouseDown = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button === 0) this.shootFromCamera();
      try { canvas.requestPointerLock(); } catch { /* drag still works */ }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      // Always track the cursor (the weapon wheel reads it on release);
      // only rotate the camera while dragging.
      const dx = e.movementX || (e.clientX - this.lastMouse.x);
      const dy = e.movementY || (e.clientY - this.lastMouse.y);
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (!this.mouseDown || this.screen !== 'play') return;
      this.camYaw -= dx * 0.004;
      this.camPitch = Math.max(-0.15, Math.min(0.9, this.camPitch + dy * 0.003));
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.mouseDown = true;
    });
  }

  selectWheelByMouse() {
    const items = [...document.querySelectorAll('.wheel-item')];
    const rect = this.ui.el.wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mx = this.lastMouse.x - cx;
    const my = this.lastMouse.y - cy;
    if (Math.hypot(mx, my) < 30) return;
    const angle = Math.atan2(my, mx);
    const idx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * WEAPON_ORDER.length) % WEAPON_ORDER.length;
    const list = this.combat.unlockedWeapons();
    this.combat.select(list[idx % list.length]);
    items.forEach((it) => it.classList.toggle('sel', it.dataset.weapon === this.combat.current));
  }

  bindMenus() {
    const show = (id) => this.ui.show(id);
    const hide = (id) => this.ui.hide(id);
    document.getElementById('btn-new').addEventListener('click', () => {
      this.audio.init();
      hide('title'); this.startPlay(false);
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      this.audio.init();
      hide('title'); this.startPlay(true);
    });
    document.getElementById('btn-how').addEventListener('click', () => {
      this.showDialogue('How to play', 'WASD move/drive, mouse camera, E enter or steal a car, Q weapon wheel, click shoot, F interact at the garage/market, R radio, M start a mission, P save. Earn respect to unlock missions, weapons and garage upgrades.');
    });
    document.getElementById('btn-resume').addEventListener('click', () => { hide('pause'); this.screen = 'play'; });
    document.getElementById('btn-save').addEventListener('click', () => { this.autosave(); this.toast('Game saved'); });
    document.getElementById('btn-quit').addEventListener('click', () => { hide('pause'); this.toTitle(); });
    document.getElementById('btn-retry').addEventListener('click', () => { hide('dead'); this.startPlay(true); });
    document.getElementById('btn-dead-title').addEventListener('click', () => { hide('dead'); this.toTitle(); });
    if (hasSave()) show('btn-continue');
  }

  toTitle() {
    this.screen = 'title';
    this.ui.hide('hud');
    this.ui.show('title');
    this.cinematic = true;
  }

  startPlay(fromSave) {
    this.screen = 'play';
    this.cinematic = false;
    this.ui.show('hud');
    if (fromSave) {
      const s = loadGame();
      if (s) this.restore(s);
    }
    this.announce(`Playing Port Verona v${VERSION}. Press M to start the first mission.`);
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'paused';
    this.ui.show('pause');
  }

  startMission() {
    if (this.missions.state === 'idle') {
      if (!this.missions.startNext()) this.toast('No missions left — free roam!');
    } else if (this.missions.state === 'active') {
      this.toast(`Current mission: ${this.missions.currentDef.title}`);
    }
  }

  // --- Cars: enter the nearest car, carjack a driven one, exit. ---
  tryEnterCar() {
    if (this.state.inVehicle) {
      this.exitCar();
      return;
    }
    const pos = { x: this.state.px, z: this.state.pz };
    // Mission car first (it is the objective).
    if (this.missionCar) {
      const d = Math.hypot(this.missionCar.mesh.position.x - pos.x, this.missionCar.mesh.position.z - pos.z);
      if (d < 5) { this.enterVehicle(this.missionCar, false); this.missionCar = null; return; }
    }
    const car = this.traffic.nearestCarjackable(pos);
    if (car) {
      const v = this.traffic.carjack(car);
      this.traffic.cars = this.traffic.cars.filter((c) => c !== car);
      this.enterVehicle(v, true);
      this.police.addHeat(20, 'carjacking');
      this.toast('Carjacked! The VCPD will be looking for this car');
      return;
    }
    const parked = this.parkedCars.find((v) => Math.hypot(v.mesh.position.x - pos.x, v.mesh.position.z - pos.z) < 5);
    if (parked) { this.enterVehicle(parked, false); return; }
    this.toast('No car nearby');
  }

  enterVehicle(v, stolen) {
    this.currentVehicle = v;
    this.state.inVehicle = true;
    this.state.carType = v.type;
    this.playerMesh.visible = false;
    this.audio.blip(300, 0.15, 'sine', 0.3);
    const step = this.missions.currentStep();
    if (step && step.type === 'steal') this.missions.completeStep();
    if (stolen) this.audio.setEngine(0, true);
  }

  exitCar() {
    if (!this.currentVehicle) return;
    const v = this.currentVehicle;
    v.speed = 0;
    const fx = Math.cos(v.heading + Math.PI / 2);
    const fz = -Math.sin(v.heading + Math.PI / 2);
    this.state.px = v.mesh.position.x + fx * 3;
    this.state.pz = v.mesh.position.z + fz * 3;
    this.state.heading = v.heading;
    if (!this.parkedCars.includes(v)) this.parkedCars.push(v);
    this.currentVehicle = null;
    this.state.inVehicle = false;
    this.playerMesh.visible = true;
    this.playerMesh.position.set(this.state.px, 0, this.state.pz);
    this.audio.setEngine(0, false);
  }

  // --- Interaction key (F): garage, delivery jobs, mission talk. ---
  interact() {
    const pos = { x: this.state.px, z: this.state.pz };
    const dGarage = Math.hypot(pos.x - GARAGE_POS.x, pos.z - GARAGE_POS.z);
    if (dGarage < 14) { this.openGarage(); return; }
    const step = this.missions.currentStep();
    if (step && step.type === 'talk' && Math.hypot(pos.x - step.target.x, pos.z - step.target.z) < step.radius) {
      this.missions.completeStep();
      return;
    }
    // Delivery job board at the market square.
    const dMarket = Math.hypot(pos.x + 60, pos.z + 100);
    if (dMarket < 10 && !this.delivery) { this.startDelivery(); return; }
    if (this.delivery) this.toast('Delivery in progress — follow the gold marker');
    // Street race at the stadium.
    const dStadium = Math.hypot(pos.x - 120, pos.z + 120);
    if (dStadium < 14 && !this.race) { this.startRace(); return; }
    this.toast('Nothing to interact with here');
  }

  openGarage() {
    if (!this.currentVehicle) { this.toast('Bring a car to the garage to upgrade it'); return; }
    this.screen = 'garage';
    this.ui.refreshGarage();
    this.ui.show('garage');
    document.addEventListener('keydown', this.garageEscHandler ?? (this.garageEscHandler = (e) => {
      if (e.code === 'Escape' && this.screen === 'garage') { this.ui.hide('garage'); this.screen = 'play'; }
    }));
  }

  buyUpgrade(kind, tier) {
    const v = this.currentVehicle;
    if (!v) return;
    if (this.state.money < tier.price || this.state.respect < tier.respect) { this.audio.denied(); return; }
    this.state.money -= tier.price;
    this.state.upgrades[kind] = tier.tier;
    if (kind === 'paint') v.applyPaint(tier.color);
    if (kind === 'armor') { v.maxHealth = v.maxHp; v.health = v.maxHp; }
    this.audio.pickup();
    this.toast(`Installed: ${tier.name}`);
    this.ui.refreshGarage();
    this.autosave();
  }

  // --- Side activities: delivery jobs and street races. ---
  startDelivery() {
    const dests = [{ x: 150, z: 150 }, { x: 0, z: -160 }, { x: -150, z: 120 }, { x: 120, z: -120 }];
    const dest = dests[Math.floor(Math.random() * dests.length)];
    this.delivery = { dest, pay: 150 };
    this.toast(`Delivery job: take the parcel to (${Math.round(dest.x)}, ${Math.round(dest.z)}) — $150`);
    this.audio.pickup();
  }

  startRace() {
    const checkpoints = [
      { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
      { x: -100, z: 100 }, { x: -100, z: 0 }, { x: 0, z: 0 },
    ];
    this.race = { checkpoints, index: 0, time: 0, par: 75 };
    this.toast('Street race! Hit every gold checkpoint — beat 75 seconds');
    this.audio.blip(523, 0.2, 'square', 0.3);
  }

  ensureMissionCar(type, target) {
    if (this.missionCar) return;
    const v = new Vehicle(type, target.x, target.z, 0);
    this.scene.add(v.mesh);
    this.missionCar = v;
  }

  spawnMissionHostiles(target, count) {
    const names = ['Collector', 'Guard', 'Enforcer', 'Heavy', 'Boss'];
    this.traffic.spawnHostiles(target, count, names);
  }

  startEscort(target) {
    const van = new Vehicle('van', -100, 100, 0);
    this.scene.add(van.mesh);
    this.escortVan = { vehicle: van, target, done: false };
    this.escortDone = false;
    this.toast('Escort the dock van — stay close or it stops');
  }

  shootFromCamera() {
    if (this.combat.wheelOpen) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    this.combat.shoot(origin, dir);
  }

  damagePlayer(amount) {
    let rest = amount;
    if (this.state.armor > 0) {
      const absorbed = Math.min(this.state.armor, rest);
      this.state.armor -= absorbed;
      rest -= absorbed;
    }
    this.state.health -= rest;
    if (this.state.health <= 0) {
      this.state.health = 0;
      this.die();
    }
  }

  die() {
    this.screen = 'dead';
    this.ui.hide('hud');
    this.ui.show('dead');
    this.audio.setSiren(false);
    this.audio.setEngine(0, false);
    this.police.clearAll();
  }

  // --- Save/load ---
  autosave() {
    saveGame({
      state: this.state,
      missions: this.missions.serialize(),
      combat: this.combat.serialize(),
      hour: this.world.hour,
      weather: this.world.weather,
    });
    this.autosaveTimer = 0;
  }

  restore(s) {
    if (!s.state) return;
    Object.assign(this.state, s.state);
    this.state.health = Math.max(this.state.health, 50);
    this.playerMesh.position.set(this.state.px, 0, this.state.pz);
    this.playerMesh.visible = !this.state.inVehicle;
    if (this.state.inVehicle) {
      if (this.currentVehicle) this.scene.remove(this.currentVehicle.mesh);
      const v = new Vehicle(this.state.carType, this.state.px, this.state.pz, this.state.heading, this.state.upgrades);
      this.scene.add(v.mesh);
      this.currentVehicle = v;
    }
    if (s.missions) this.missions.restore(s.missions);
    if (s.combat) this.combat.restore(s.combat);
    if (s.hour) this.world.setHour(s.hour);
    if (s.weather) this.world.setWeather(s.weather);
    this.toast('Save loaded');
  }

  // --- Per-frame update ---
  step(dt) {
    const keys = this.keys;
    const inVehicle = this.state.inVehicle;
    // Movement input, camera-relative on foot, car-relative in a car.
    const forward = keys.has('KeyW') || keys.has('ArrowUp');
    const back = keys.has('KeyS') || keys.has('ArrowDown');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');

    if (this.screen === 'play') {
      if (inVehicle && this.currentVehicle) {
        const res = this.currentVehicle.update(dt, {
          forward, back, left, right, handbrake: keys.has('Space'),
        }, this.world.traction);
        if (res?.smoke) this.world.spawnParticles(res.smoke, 0x555555, 3, 1.5, 1.2, 0.9);
        this.state.px = this.currentVehicle.mesh.position.x;
        this.state.pz = this.currentVehicle.mesh.position.z;
        this.state.heading = this.currentVehicle.heading;
        const hit = this.world.resolveCollision(this.currentVehicle.mesh.position, 2.4);
        if (hit && Math.abs(this.currentVehicle.speed) > 12) {
          this.currentVehicle.damage(8);
          this.currentVehicle.speed *= -0.3;
          this.audio.crash();
          this.world.spawnParticles(this.currentVehicle.mesh.position.clone().setY(1), 0xffaa33, 8, 4, 0.5, 0.4);
          if (this.currentVehicle.dead) { this.toast('Your car is wrecked — get out'); this.exitCar(); }
        }
        // Exhaust smoke while accelerating.
        this.exhaustTimer -= dt;
        if (forward && this.exhaustTimer <= 0) {
          this.exhaustTimer = 0.15;
          const back = this.currentVehicle.mesh.position.clone();
          back.x -= Math.cos(this.currentVehicle.heading) * 2.4;
          back.z += Math.sin(this.currentVehicle.heading) * 2.4;
          back.y = 0.5;
          this.world.spawnParticles(back, 0x888888, 1, 0.8, 0.9, 0.5);
        }
        this.audio.setEngine(Math.abs(this.currentVehicle.speed) / this.currentVehicle.topSpeed, true);
      } else {
        // On foot: WASD relative to the camera yaw.
        const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
        let mx = 0;
        let mz = 0;
        if (forward) { mx += -Math.sin(this.camYaw); mz += -Math.cos(this.camYaw); }
        if (back) { mx += Math.sin(this.camYaw); mz += Math.cos(this.camYaw); }
        if (left) { mx += -Math.cos(this.camYaw); mz += Math.sin(this.camYaw); }
        if (right) { mx += Math.cos(this.camYaw); mz += -Math.sin(this.camYaw); }
        const len = Math.hypot(mx, mz);
        if (len > 0) {
          mx /= len; mz /= len;
          this.state.px += mx * speed * dt;
          this.state.pz += mz * speed * dt;
          this.state.heading = Math.atan2(-mz, mx);
          this.playerMesh.rotation.y = this.state.heading;
          this.playerMesh.position.set(this.state.px, Math.abs(Math.sin(performance.now() * 0.012)) * 0.08, this.state.pz);
        } else {
          this.playerMesh.position.set(this.state.px, 0, this.state.pz);
        }
        this.world.resolveCollision(this.playerMesh.position, 0.8);
        this.state.px = this.playerMesh.position.x;
        this.state.pz = this.playerMesh.position.z;
        this.audio.setEngine(0, false);
      }

      const playerPos = { x: this.state.px, z: this.state.pz, heading: this.state.heading };
      this.traffic.update(dt, playerPos, this.world.hour, (p) => {
        if (p.hostile) this.missions.onKill();
      }, this.audio);
      const nearestCop = this.police.update(dt, playerPos, inVehicle ? Math.abs(this.currentVehicle?.speed || 0) : 0, inVehicle, this.audio);
      this.missions.update(dt, playerPos, inVehicle);
      this.combat.update(dt);
      this.combat.hostileContact(playerPos, dt);
      // Cop contact on foot: arrested-ish damage when a cop rams you.
      if (!inVehicle && nearestCop < 2.5) this.damagePlayer(20 * dt);
      // Delivery progress.
      if (this.delivery) {
        const d = Math.hypot(playerPos.x - this.delivery.dest.x, playerPos.z - this.delivery.dest.z);
        if (d < 9) {
          this.state.money += this.delivery.pay;
          this.state.respect += 2;
          this.toast(`Delivery done — +$${this.delivery.pay}, +2 respect`);
          this.audio.missionDone();
          this.delivery = null;
          this.autosave();
        }
      }
      // Race checkpoints.
      if (this.race) {
        this.race.time += dt;
        const cp = this.race.checkpoints[this.race.index];
        if (cp && Math.hypot(playerPos.x - cp.x, playerPos.z - cp.z) < 12) {
          this.race.index += 1;
          this.audio.pickup();
          if (this.race.index >= this.race.checkpoints.length) {
            const won = this.race.time <= this.race.par;
            this.raceResult = won ? 'win' : 'lose';
            this.toast(won ? `Race won in ${this.race.time.toFixed(1)}s!` : `Race finished in ${this.race.time.toFixed(1)}s — par was ${this.race.par}s`);
            if (won) { this.state.money += 300; this.state.respect += 5; }
            this.race = null;
          }
        } else if (this.race.time > 150) {
          this.raceResult = 'lose';
          this.toast('Race timed out');
          this.race = null;
        }
      }
      // Escort van follows its route while the player stays near.
      if (this.escortVan && !this.escortVan.done) {
        const van = this.escortVan.vehicle;
        const near = Math.hypot(playerPos.x - van.mesh.position.x, playerPos.z - van.mesh.position.z) < 35;
        if (near) {
          const dx = this.escortVan.target.x - van.mesh.position.x;
          const dz = this.escortVan.target.z - van.mesh.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 10) {
            this.escortVan.done = true;
            this.escortDone = true;
            this.toast('Escort complete — the shipment is safe');
          } else {
            van.heading = Math.atan2(-dz, dx);
            van.mesh.rotation.y = van.heading;
            van.mesh.position.x += Math.cos(van.heading) * 9 * dt;
            van.mesh.position.z += -Math.sin(van.heading) * 9 * dt;
          }
        }
      }
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 30) this.autosave();
      this.audio.update();
    }

    this.world.update(dt, { x: this.state.px, z: this.state.pz });
    this.updateCamera(dt);
    this.ui.update(dt, {
      ...this.state,
      px: this.state.px, pz: this.state.pz, heading: this.state.heading,
    }, this.police.wanted, this.world.hour, this.world.weather, this.audio.stationName(),
    inVehicle, inVehicle ? Math.abs(this.currentVehicle?.speed || 0) : 0);
  }

  updateCamera(dt) {
    const px = this.state.px;
    const pz = this.state.pz;
    if (this.cinematic) {
      // Title-screen orbit: slow sweep over the city and the tower.
      const t = performance.now() * 0.00004;
      this.camera.position.set(Math.cos(t) * 130, 55 + Math.sin(t * 2) * 8, Math.sin(t) * 130 - 40);
      this.camera.lookAt(0, 20, -60);
      return;
    }
    // In a car the chase camera follows the car's heading; on foot the
    // camera orbits with the mouse.
    const yaw = this.state.inVehicle && this.currentVehicle
      ? this.currentVehicle.heading - Math.PI / 2
      : this.camYaw;
    const dist = this.state.inVehicle ? 13 : 8.5;
    const height = this.state.inVehicle ? 5.5 : 3.6;
    const tx = px + Math.sin(yaw) * dist;
    const tz = pz + Math.cos(yaw) * dist;
    const target = new THREE.Vector3(tx, height, tz);
    this.camera.position.lerp(target, Math.min(1, dt * 6));
    this.camera.lookAt(px, 1.6, pz);
  }

  // --- Screenshot staging: place the game in a composed scene. ---
  stageShot(name) {
    this.cinematic = false;
    this.screen = 'play';
    this.ui.hide('title');
    this.ui.show('hud');
    if (name === 'start') {
      // Golden hour, on foot at the plaza with the tower behind.
      this.world.setHour(17.5);
      this.world.setWeather('clear');
      this.state.px = 20; this.state.pz = 10;
      this.camYaw = Math.PI * 0.95;
      this.camPitch = 0.3;
      this.playerMesh.position.set(20, 0, 10);
    } else if (name === 'play') {
      // Driving a coupe through downtown, 2-star heat, a cop behind.
      this.world.setHour(17.8);
      this.world.setWeather('clear');
      const v = new Vehicle('coupe', 0, 40, 0, { engine: 1, armor: 0, paint: 0 });
      this.scene.add(v.mesh);
      this.enterVehicle(v, false);
      v.speed = 22;
      this.police.setWanted(2);
      this.police.spawnCop({ x: 0, z: 40 });
      this.camYaw = 0;
    } else if (name === 'chase') {
      // Night rain, 4 stars, helicopter overhead, roadblock ahead.
      this.world.setHour(22);
      this.world.setWeather('rain');
      const v = new Vehicle('muscle', -40, 0, 0);
      this.scene.add(v.mesh);
      this.enterVehicle(v, false);
      v.speed = 26;
      this.police.setWanted(4);
      this.police.spawnCop({ x: -40, z: 0 });
      this.police.spawnCop({ x: -40, z: 20 });
      this.police.spawnRoadblock({ x: -40, z: 0, heading: 0 }, 0);
      this.camYaw = 0;
    } else {
      // 'end': dusk at Verona Tower after the finale.
      this.world.setHour(19.2);
      this.world.setWeather('clear');
      this.state.px = 0; this.state.pz = -140;
      this.playerMesh.position.set(0, 0, -140);
      this.camYaw = Math.PI;
      this.world.spawnParticles(new THREE.Vector3(0, 60, -160), 0xffc94d, 40, 6, 2, 0.9);
      this.world.spawnParticles(new THREE.Vector3(20, 50, -140), 0xff5544, 30, 5, 2, 0.8);
    }
    // Let the world settle, then paint.
    for (let i = 0; i < 90; i++) this.step(STEP);
    this.renderer.render(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    window.__shotReady = true;
  }

  run() {
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      acc += Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      let guard = 0;
      while (acc >= STEP && guard < 5) { this.step(STEP); acc -= STEP; guard += 1; }
      if (guard >= 5) acc = 0;
      this.renderer.render(this.scene, this.camera);
    };
    if (shot) {
      this.stageShot(shot);
      // Keep rendering so the shot stays live for the screenshot tool.
      requestAnimationFrame(frame);
    } else {
      this.cinematic = true;
      requestAnimationFrame(frame);
    }
  }
}

const game = new Game();
window.__game = game;
game.run();
