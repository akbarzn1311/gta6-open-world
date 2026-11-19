// Port Verona — the HUD.
// Wanted stars, cash, respect, health and armour, the radio readout, the
// mission tracker with the giver's portrait, the police response panel, a
// 2D minimap with blips, the weapon wheel, message banners and the start
// screen. All DOM + one 2D canvas; the 3D scene never draws UI itself.

(function () {
  'use strict';

  var U = window.PV.util;

  var els = {};
  var minimap = null;
  var mctx = null;
  var wheelOpen = false;
  var flashTimer = null;
  var messageTimer = null;

  function build() {
    var hud = U.$('#hud');
    if (!hud) return;
    els.hud = hud;

    var top = U.el('div', 'hud-top');
    var stars = U.el('div', 'hud-stars');
    stars.id = 'hud-stars';
    top.appendChild(stars);
    var cash = U.el('div', 'hud-cash');
    cash.innerHTML = '<span id="hud-cash">$0</span><span id="hud-respect" class="respect"></span>';
    top.appendChild(cash);
    hud.appendChild(top);

    var vitals = U.el('div', 'hud-vitals');
    vitals.innerHTML =
      '<div class="bar"><label>HEALTH</label><div class="bar-track"><div id="hud-health" class="bar-fill health"></div></div></div>' +
      '<div class="bar"><label>ARMOUR</label><div class="bar-track"><div id="hud-armor" class="bar-fill armor"></div></div></div>';
    hud.appendChild(vitals);

    var radio = U.el('div', 'hud-radio');
    radio.id = 'hud-radio';
    hud.appendChild(radio);

    var mission = U.el('div', 'hud-mission');
    mission.innerHTML =
      '<img id="hud-portrait" class="portrait" alt="">' +
      '<div class="mission-text"><div id="hud-mission-title" class="mission-title"></div>' +
      '<div id="hud-mission-objective" class="mission-objective"></div></div>';
    hud.appendChild(mission);
    els.mission = mission;

    var police = U.el('div', 'hud-police');
    police.id = 'hud-police';
    police.innerHTML = '<div class="police-title">POLICE RESPONSE</div><div id="hud-police-body" class="police-body"></div>';
    hud.appendChild(police);
    els.police = police;

    var mapWrap = U.el('div', 'hud-map-wrap');
    minimap = U.el('canvas', 'hud-map');
    minimap.width = 190;
    minimap.height = 190;
    mapWrap.appendChild(minimap);
    var clock = U.el('div', 'hud-clock');
    clock.id = 'hud-clock';
    mapWrap.appendChild(clock);
    hud.appendChild(mapWrap);
    mctx = minimap.getContext('2d');

    var wheel = U.el('div', 'hud-wheel');
    wheel.id = 'hud-wheel';
    hud.appendChild(wheel);
    els.wheel = wheel;

    var banner = U.el('div', 'hud-banner');
    banner.id = 'hud-banner';
    hud.appendChild(banner);
    els.banner = banner;

    var msg = U.el('div', 'hud-message');
    msg.id = 'hud-message';
    hud.appendChild(msg);
    els.message = msg;

    var help = U.el('div', 'hud-help');
    help.innerHTML = 'WASD move / drive &nbsp;·&nbsp; E enter car &nbsp;·&nbsp; Mouse aim &nbsp;·&nbsp; Click / F attack &nbsp;·&nbsp; Q weapon wheel &nbsp;·&nbsp; R radio &nbsp;·&nbsp; M mute &nbsp;·&nbsp; P pause &nbsp;·&nbsp; Esc menu';
    hud.appendChild(help);
  }

  function starHtml(n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += '<span class="star' + (i < n ? ' on' : '') + '">★</span>';
    return s;
  }

  function update(state) {
    if (!els.hud) return;
    var starsEl = U.$('#hud-stars');
    if (starsEl) starsEl.innerHTML = starHtml(state.wanted);
    var cashEl = U.$('#hud-cash');
    if (cashEl) cashEl.textContent = U.money(state.cash);
    var respEl = U.$('#hud-respect');
    if (respEl) respEl.textContent = 'RESPECT ' + state.respect;
    var hEl = U.$('#hud-health');
    if (hEl) hEl.style.width = Math.max(0, state.health) + '%';
    var aEl = U.$('#hud-armor');
    if (aEl) aEl.style.width = Math.max(0, state.armor) + '%';
    var rEl = U.$('#hud-radio');
    if (rEl) {
      var st = window.PV.audio.stations[state.radio];
      rEl.innerHTML = '<span class="radio-name">' + st.name + '</span><span class="radio-tag">' + st.tag + '</span>' +
        (state.inCar ? '<span class="radio-car">' + (state.carName || '') + '</span>' : '');
    }
    var clockEl = U.$('#hud-clock');
    if (clockEl) clockEl.textContent = U.clock(state.hour) + ' · ' + state.weather.toUpperCase();
    // Mission tracker.
    var m = window.PV.missions.current();
    var titleEl = U.$('#hud-mission-title');
    var objEl = U.$('#hud-mission-objective');
    var portEl = U.$('#hud-portrait');
    if (m) {
      var giver = window.PV.characters.byId(m.giver);
      if (titleEl) titleEl.textContent = m.title + ' — ' + giver.name;
      if (objEl) objEl.textContent = window.PV.missions.objectiveText();
      if (portEl) portEl.src = window.PV.characters.portrait(giver);
      if (els.mission) els.mission.style.display = 'flex';
    } else if (els.mission) {
      els.mission.style.display = 'none';
    }
    // Police panel.
    if (els.police) {
      if (state.wanted > 0) {
        els.police.style.display = 'block';
        var body = U.$('#hud-police-body');
        var units = window.PV.police.units.slice(0, Math.min(state.wanted + 1, 5)).join(' · ');
        var heli = state.wanted >= 4 ? ' · ' + window.PV.police.heliUnit + ' (HELI)' : '';
        if (body) body.textContent = 'Units: ' + units + heli;
      } else {
        els.police.style.display = 'none';
      }
    }
    drawMinimap(state);
    if (wheelOpen) drawWheel(state);
  }

  function drawMinimap(state) {
    if (!mctx) return;
    var size = 190;
    var half = window.PV.city.half;
    var scale = size / (half * 2);
    var px = function (x) { return (x + half) * scale; };
    var pz = function (z) { return (z + half) * scale; };
    mctx.clearRect(0, 0, size, size);
    mctx.fillStyle = 'rgba(10, 16, 26, 0.85)';
    mctx.fillRect(0, 0, size, size);
    // Water on the west edge.
    mctx.fillStyle = '#1f6f9f';
    mctx.fillRect(0, 0, 12, size);
    // Roads.
    mctx.strokeStyle = '#5a6068';
    mctx.lineWidth = 3;
    for (var i = 0; i <= 9; i++) {
      var c = -half + i * ((half * 2 - 14) / 9) + 7;
      mctx.beginPath(); mctx.moveTo(px(c), 0); mctx.lineTo(px(c), size); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, pz(c)); mctx.lineTo(size, pz(c)); mctx.stroke();
    }
    // Blocks.
    mctx.fillStyle = '#3a3f47';
    for (var bx = 0; bx < 9; bx++) {
      for (var bz = 0; bz < 9; bz++) {
        var x0 = -half + 14 + bx * 74;
        var z0 = -half + 14 + bz * 74;
        mctx.fillRect(px(x0), pz(z0), 60 * scale, 60 * scale);
      }
    }
    // Mission marker.
    var mk = window.PV.missions.marker();
    if (mk) {
      var pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      mctx.fillStyle = '#ffd23e';
      mctx.beginPath();
      mctx.arc(px(mk.x), pz(mk.z), pulse, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#000';
      mctx.lineWidth = 1.5;
      mctx.stroke();
    }
    // Police blips.
    mctx.fillStyle = '#3a86ff';
    window.PV.police.policeCars().forEach(function (car) {
      mctx.beginPath();
      mctx.arc(px(car.x), pz(car.z), 3, 0, Math.PI * 2);
      mctx.fill();
    });
    // Player arrow.
    var pxp = px(state.x);
    var pzp = pz(state.z);
    mctx.save();
    mctx.translate(pxp, pzp);
    mctx.rotate(Math.atan2(Math.sin(state.heading), Math.cos(state.heading)) + Math.PI);
    mctx.fillStyle = state.inCar ? '#ff5a3c' : '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(5, 6);
    mctx.lineTo(-5, 6);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
    // North marker.
    mctx.fillStyle = '#fff';
    mctx.font = 'bold 11px sans-serif';
    mctx.fillText('N', size - 12, 14);
  }

  function drawWheel(state) {
    if (!els.wheel) return;
    var ws = window.PV.combat.weapons;
    var html = '<div class="wheel-title">WEAPONS</div>';
    ws.forEach(function (w, i) {
      var ammo = window.PV.combat.state.ammo[w.id];
      var ammoTxt = ammo === Infinity ? '∞' : ammo;
      html += '<div class="wheel-item' + (i === window.PV.combat.state.weaponIndex ? ' sel' : '') + '">' +
        '<span class="wheel-icon">' + w.icon + '</span>' +
        '<span class="wheel-name">' + w.name + '</span>' +
        '<span class="wheel-ammo">' + ammoTxt + '</span></div>';
    });
    els.wheel.innerHTML = html;
    els.wheel.style.display = 'block';
  }

  function setWheel(open) {
    wheelOpen = open;
    if (!els.wheel) return;
    els.wheel.style.display = open ? 'block' : 'none';
    if (!open) els.wheel.innerHTML = '';
  }

  function flash(text) {
    if (!els.banner) return;
    els.banner.textContent = text;
    els.banner.style.opacity = '1';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      els.banner.style.opacity = '0';
    }, 2600);
  }

  function message(text, ms) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.style.opacity = '1';
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(function () {
      els.message.style.opacity = '0';
    }, ms || 3600);
  }

  function showStart(onStart) {
    var overlay = U.$('#start-screen');
    if (!overlay) return;
    overlay.style.display = 'flex';
    var btn = U.$('#start-button');
    if (btn) {
      btn.onclick = function () {
        window.PV.audio.resume();
        window.PV.audio.click();
        overlay.style.display = 'none';
        onStart();
      };
    }
  }

  function showEnd(title, body, onRestart) {
    var overlay = U.$('#end-screen');
    if (!overlay) return;
    U.$('#end-title').textContent = title;
    U.$('#end-body').textContent = body;
    overlay.style.display = 'flex';
    var btn = U.$('#end-button');
    if (btn) {
      btn.onclick = function () {
        overlay.style.display = 'none';
        onRestart();
      };
    }
  }

  window.PV = window.PV || {};
  window.PV.hud = {
    build: build,
    update: update,
    setWheel: setWheel,
    flash: flash,
    message: message,
    showStart: showStart,
    showEnd: showEnd,
  };
})();
