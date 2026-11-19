// Missions: the story runner. Each mission is a list of typed steps
// (goto / talk / steal / fight / deliver / escort / race / escape) with
// a live objective marker. Completing a mission pays money and respect,
// and respect is what unlocks the next missions, the garage tiers and
// the better weapons — progression is a gate, not a decoration.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

export class MissionManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game; // back-reference for spawning, rewards, toasts
    this.index = 0; // next mission to play
    this.active = null; // { def, stepIndex, ...runtime }
    this.completed = new Set();
    this.marker = null;
    this.markerLight = null;
    this.state = 'idle'; // idle | active | done
  }

  get currentDef() { return MISSIONS[this.index] || null; }

  startNext() {
    const def = this.currentDef;
    if (!def) return false;
    this.active = { def, stepIndex: 0, kills: 0, startedAt: performance.now() };
    this.state = 'active';
    this.game.showDialogue(def.giver, def.intro);
    this.game.toast(`Mission ${def.id}: ${def.title}`);
    this.game.audio.missionDone?.();
    this.placeMarker();
    this.setupStep();
    return true;
  }

  placeMarker() {
    this.clearMarker();
    const step = this.currentStep();
    if (!step || !step.target) return;
    const geo = new THREE.CylinderGeometry(1.2, 1.2, 22, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(step.target.x, 11, step.target.z);
    this.scene.add(this.marker);
    this.markerLight = new THREE.PointLight(0xffc94d, 20, 30);
    this.markerLight.position.set(step.target.x, 6, step.target.z);
    this.scene.add(this.markerLight);
  }

  clearMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
    if (this.markerLight) { this.scene.remove(this.markerLight); this.markerLight = null; }
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIndex] || null;
  }

  objectiveText() {
    if (this.state === 'done') return 'Story complete — you own Port Verona. Free roam, races and deliveries remain.';
    if (!this.active) {
      const def = this.currentDef;
      return def ? `Next mission: ${def.title} — press M to start` : 'No missions left';
    }
    const step = this.currentStep();
    if (!step) return '';
    let text = step.text;
    if (step.type === 'fight') text += ` (${this.active.kills}/${step.count})`;
    return text;
  }

  // Step-specific setup: spawn hostiles, the target car, the race, etc.
  setupStep() {
    const step = this.currentStep();
    if (!step) return;
    const g = this.game;
    if (step.type === 'fight') {
      g.spawnMissionHostiles(step.target, step.count);
    } else if (step.type === 'steal' && this.active.def.id === 2) {
      g.ensureMissionCar('coupe', step.target);
    } else if (step.type === 'steal' && this.active.def.id === 9) {
      g.ensureMissionCar('van', step.target);
    } else if (step.type === 'escort') {
      g.startEscort(step.target);
    } else if (step.type === 'race') {
      g.startRace();
    } else if (step.type === 'escape') {
      g.police.setWanted(3);
      g.toast('Lose the heat — stay out of sight until the stars fade');
    }
  }

  completeStep() {
    if (!this.active) return;
    this.active.stepIndex += 1;
    this.game.audio.pickup();
    if (this.active.stepIndex >= this.active.def.steps.length) this.completeMission();
    else { this.placeMarker(); this.setupStep(); }
  }

  completeMission() {
    const def = this.active.def;
    this.completed.add(def.id);
    this.index += 1;
    this.state = this.index >= MISSIONS.length ? 'done' : 'idle';
    this.active = null;
    this.clearMarker();
    this.game.state.money += def.reward.money;
    this.game.state.respect += def.reward.respect;
    this.game.toast(`Mission complete: ${def.title} — +$${def.reward.money}, +${def.reward.respect} respect`);
    this.game.audio.missionDone();
    this.game.autosave();
    if (this.state === 'done') this.game.toast('STORY COMPLETE — Mara Voss owns the harbor');
  }

  onKill() {
    if (!this.active) return;
    const step = this.currentStep();
    if (step && step.type === 'fight') {
      this.active.kills += 1;
      if (this.active.kills >= step.count) this.completeStep();
    }
  }

  update(dt, playerPos, inVehicle) {
    if (this.marker) {
      this.marker.rotation.y += dt * 0.8;
      this.marker.material.opacity = 0.25 + Math.sin(performance.now() * 0.004) * 0.12;
    }
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const dist = step.target ? Math.hypot(playerPos.x - step.target.x, playerPos.z - step.target.z) : 999;
    switch (step.type) {
      case 'goto':
      case 'talk':
      case 'deliver':
        if (dist < step.radius) this.completeStep();
        break;
      case 'steal':
        // Completed by main.js when the player actually enters the car.
        break;
      case 'escort':
        if (this.game.escortDone) this.completeStep();
        break;
      case 'race':
        if (this.game.raceResult) {
          if (this.game.raceResult === 'win') this.completeStep();
          else { this.game.toast('Race lost — press M to retry the mission'); this.active = null; this.state = 'idle'; this.clearMarker(); }
          this.game.raceResult = null;
        }
        break;
      case 'escape':
        if (this.game.police.wanted === 0 && dist < step.radius) this.completeStep();
        break;
      default:
        break;
    }
  }

  // Save/load: only the index and completed set need persisting.
  serialize() { return { index: this.index, completed: [...this.completed] }; }
  restore(data) {
    if (!data) return;
    this.index = data.index || 0;
    this.completed = new Set(data.completed || []);
    this.state = this.index >= MISSIONS.length ? 'done' : 'idle';
    this.active = null;
    this.clearMarker();
  }
}
