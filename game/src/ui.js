// UI: the DOM HUD (health, armor, money, respect, wanted stars, weapon,
// radio, clock, weather), the 2D canvas minimap, dialogue, toasts and
// the title / pause / garage / weapon-wheel screens. The 3D scene never
// draws UI — the DOM does, so the HUD stays crisp in screenshots.
import { WEAPONS, WEAPON_ORDER, RADIO_STATIONS, GARAGE_UPGRADES } from './config.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {};
    ['hud', 'health-fill', 'armor-fill', 'health-text', 'money', 'respect', 'stars', 'weapon', 'radio',
     'clock', 'weather', 'objective', 'minimap', 'toast', 'dialogue', 'dialogue-giver', 'dialogue-text',
     'title', 'pause', 'garage', 'wheel', 'dead', 'hint', 'speed'].forEach((id) => {
      this.el[id] = document.getElementById(id);
    });
    this.mm = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.dialogueTimer = 0;
    this.buildWheel();
    this.buildGarage();
  }

  buildWheel() {
    const wheel = this.el.wheel;
    wheel.innerHTML = '';
    WEAPON_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      const d = document.createElement('div');
      d.className = 'wheel-item';
      d.dataset.weapon = id;
      // Arrange the items in a circle around the wheel centre.
      const angle = (i / WEAPON_ORDER.length) * Math.PI * 2 - Math.PI / 2;
      d.style.left = `${170 + Math.cos(angle) * 105 - 55}px`;
      d.style.top = `${170 + Math.sin(angle) * 105 - 25}px`;
      d.innerHTML = `<b>${w.name}</b><span>${w.melee ? 'melee' : 'ammo ∞'}</span>`;
      wheel.appendChild(d);
    });
  }

  buildGarage() {
    const g = this.el.garage;
    g.innerHTML = `<h2>Verona Garage</h2><p id="garage-money"></p><div id="garage-list"></div>
      <p class="menu-keys">Click an upgrade to buy it · Esc to leave</p>`;
    const list = g.querySelector('#garage-list');
    Object.entries(GARAGE_UPGRADES).forEach(([kind, tiers]) => {
      const h = document.createElement('h3');
      h.textContent = kind[0].toUpperCase() + kind.slice(1);
      list.appendChild(h);
      tiers.forEach((t) => {
        const b = document.createElement('button');
        b.className = 'garage-btn';
        b.dataset.kind = kind;
        b.dataset.tier = t.tier;
        b.innerHTML = `<b>${t.name}</b> — $${t.price} · needs ${t.respect} respect`;
        b.addEventListener('click', () => this.game.buyUpgrade(kind, t));
        list.appendChild(b);
      });
    });
  }

  refreshGarage() {
    const money = this.el.garage.querySelector('#garage-money');
    if (money) money.textContent = `Money: $${this.game.state.money} · Respect: ${this.game.state.respect}`;
    this.el.garage.querySelectorAll('.garage-btn').forEach((b) => {
      const kind = b.dataset.kind;
      const tier = Number(b.dataset.tier);
      const owned = this.game.state.upgrades[kind] >= tier;
      const t = GARAGE_UPGRADES[kind].find((x) => x.tier === tier);
      b.disabled = owned || this.game.state.money < t.price || this.game.state.respect < t.respect;
      b.classList.toggle('owned', owned);
      if (owned) b.innerHTML = `<b>${t.name}</b> — OWNED`;
    });
  }

  show(id) { this.el[id].classList.remove('hidden'); }
  hide(id) { this.el[id].classList.add('hidden'); }

  showDialogue(giver, text) {
    this.el['dialogue-giver'].textContent = giver;
    this.el['dialogue-text'].textContent = text;
    this.show('dialogue');
    this.dialogueTimer = 7;
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = 3.5;
  }

  update(dt, state, wanted, hour, weather, radioName, inVehicle, speed) {
    this.el['health-fill'].style.width = `${Math.max(0, state.health)}%`;
    this.el['armor-fill'].style.width = `${Math.max(0, state.armor)}%`;
    this.el['health-text'].textContent = `HP ${Math.ceil(state.health)} · Armor ${Math.ceil(state.armor)}`;
    this.el.money.textContent = `$${state.money}`;
    this.el.respect.textContent = `Respect ${state.respect}`;
    this.el.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    this.el.stars.classList.toggle('hot', wanted > 0);
    const w = WEAPONS[state.weapon];
    const ammo = w.melee ? '' : ` · ${this.game.combat.ammo[state.weapon] ?? 0}`;
    this.el.weapon.textContent = `${w.name}${ammo}`;
    this.el.radio.textContent = `♪ ${radioName}`;
    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour % 1) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.el.weather.textContent = weather === 'rain' ? '🌧 Rain — roads slick' : weather === 'cloud' ? '☁ Cloudy' : '☀ Clear';
    this.el.objective.textContent = this.game.missions.objectiveText();
    this.el.speed.textContent = inVehicle ? `${Math.round(Math.abs(speed) * 3.6)} km/h` : '';
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.hide('toast'); }
    if (this.dialogueTimer > 0) { this.dialogueTimer -= dt; if (this.dialogueTimer <= 0) this.hide('dialogue'); }
    this.drawMinimap(state);
  }

  // Minimap: top-down 2D map — roads, landmarks, player, police,
  // mission marker and the garage. Drawn every frame, cheap.
  drawMinimap(state) {
    const c = this.mm;
    const S = 240; // world half-size, mapped to the 190px canvas
    const toX = (x) => 95 + (x / S) * 95;
    const toY = (z) => 95 + (z / S) * 95;
    c.clearRect(0, 0, 190, 190);
    c.fillStyle = '#101418';
    c.fillRect(0, 0, 190, 190);
    c.strokeStyle = '#3a3f46';
    c.lineWidth = 2;
    for (let i = -4; i <= 4; i++) {
      const p = toX(i * 54);
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 190); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(190, p); c.stroke();
    }
    // Water (east edge) and landmarks.
    c.fillStyle = '#1c4a6e';
    c.fillRect(toX(190), 0, 190 - toX(190), 190);
    c.fillStyle = '#e8a13a';
    c.fillRect(toX(0) - 3, toY(-160) - 3, 6, 6); // tower
    c.fillStyle = '#b05a2a';
    c.fillRect(toX(-120) - 3, toY(60) - 3, 6, 6); // garage
    // Mission marker.
    const step = this.game.missions.currentStep();
    if (step?.target) {
      c.fillStyle = '#ffc94d';
      c.beginPath(); c.arc(toX(step.target.x), toY(step.target.z), 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffc94d';
      c.beginPath(); c.arc(toX(step.target.x), toY(step.target.z), 9, 0, Math.PI * 2); c.stroke();
    }
    // Police blips.
    c.fillStyle = '#3a6eff';
    for (const cop of this.game.police.cops) {
      c.beginPath(); c.arc(toX(cop.mesh.position.x), toY(cop.mesh.position.z), 3, 0, Math.PI * 2); c.fill();
    }
    // Player arrow.
    c.save();
    c.translate(toX(state.px), toY(state.pz));
    c.rotate(-state.heading);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -5); c.lineTo(-5, 5); c.closePath(); c.fill();
    c.restore();
  }
}
