// Port Verona — save / load via localStorage.
// One save slot. Stores cash, respect, health, armour, mission progress,
// garage upgrades, radio station, ammo and the player's last position, so a
// session can pick up where it left off. Corrupt or missing saves fall back
// to a fresh game instead of crashing.

(function () {
  'use strict';

  var KEY = 'port-verona-save-v3';

  function save(state) {
    try {
      var data = {
        version: 3,
        savedAt: new Date().toISOString(),
        cash: state.cash,
        respect: state.respect,
        health: state.health,
        armor: state.armor,
        missionIndex: window.PV.missions.state.index,
        missionsDone: window.PV.missions.state.done.slice(),
        upgrades: state.upgrades,
        radio: state.radio,
        ammo: window.PV.combat.state.ammo,
        weaponIndex: window.PV.combat.state.weaponIndex,
        hour: state.hour,
        x: state.x,
        z: state.z,
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.version !== 3) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // Storage unavailable — nothing to clear.
    }
  }

  function hasSave() {
    return load() !== null;
  }

  window.PV = window.PV || {};
  window.PV.save = {
    save: save,
    load: load,
    clear: clear,
    hasSave: hasSave,
  };
})();
