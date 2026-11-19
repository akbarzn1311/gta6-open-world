// Port Verona v2 — missions: ten story jobs with real progression.
// Each mission is a chain of steps; the state machine here only reads the
// step table in config.js, so adding a job never touches the engine.
(function () {
  'use strict';
  var PV = (window.PV = window.PV || {});

  var Missions = {
    // Index of the next mission the player may start (respect-gated).
    available: function (state) {
      var idx = state.missionIndex;
      while (idx < PV.MISSIONS.length && state.respect < PV.MISSIONS[idx].respect) idx++;
      return idx;
    },

    current: function (state) {
      if (!state.mission || !state.mission.active) return null;
      return PV.MISSIONS[state.mission.index];
    },

    stepLabel: function (state) {
      var m = Missions.current(state);
      if (!m) return 'No mission — press M to start one';
      var step = m.steps[state.mission.step];
      return step ? step.label : 'Return to Dana';
    },

    // Where the objective beacon should point, or null.
    marker: function (state) {
      var m = Missions.current(state);
      if (!m) return null;
      var step = m.steps[state.mission.step];
      if (!step) return null;
      if (step.place) return PV.World.placePosition(step.place);
      if (step.checkpoints) return step.checkpoints[state.mission.checkpoint || 0];
      if (step.type === 'escort' && state.escortVan) return { x: state.escortVan.x, z: state.escortVan.z };
      return null;
    },

    start: function (state, index) {
      if (index === undefined || index === null) index = state.missionIndex;
      var def = PV.MISSIONS[index];
      if (!def) return false;
      if (state.respect < def.respect) {
        PV.UI.showToast('Need ' + def.respect + ' respect for "' + def.title + '"');
        return false;
      }
      if (state.mission && state.mission.active) {
        PV.UI.showToast('Finish "' + PV.MISSIONS[state.mission.index].title + '" first');
        return false;
      }
      state.mission = {
        active: true, index: index, step: 0, kills: 0,
        checkpoint: 0, timer: 0, escortTime: 0, escortFar: 0,
        van: null
      };
      var giver = PV.CHARACTERS.filter(function (c) { return c.id === def.giver; })[0];
      PV.UI.showDialogue(state, giver, def.dialogue, def.title);
      PV.UI.showToast('MISSION: ' + def.title);
      Missions.enterStep(state);
      return true;
    },

    // Set up whatever the new step needs: hostiles, a van, a timer, heat.
    enterStep: function (state) {
      var m = Missions.current(state);
      if (!m) return;
      var step = m.steps[state.mission.step];
      if (!step) { Missions.complete(state); return; }
      state.mission.kills = 0;
      state.mission.checkpoint = 0;
      if (step.type === 'kill') {
        state.mission.hostiles = PV.Traffic.spawnHostiles(state, step.place, step.count);
      }
      if (step.type === 'race') {
        state.mission.timer = step.timeLimit;
      }
      if (step.type === 'escort') {
        var from = PV.World.placePosition('warehouse');
        var to = PV.World.placePosition(step.place);
        state.mission.van = PV.Traffic.spawnEscortVan(state, from, to);
        state.mission.escortTime = 0;
        state.mission.escortFar = 0;
      }
      if (step.type === 'survive') {
        PV.Police.addWanted(state, Math.max(0, step.wanted - state.wanted), 'the job');
        state.mission.timer = step.seconds;
        state.mission.holdHeat = true;
      }
      if (step.type === 'steal') {
        var pos = PV.World.placePosition(step.place);
        var car = PV.Entities.makeVehicle(state, step.vehicle || 'sports', pos.x + 6, pos.z + 6, 0, {});
        car.isTarget = true;
        state.vehicles.push(car);
        state.mission.targetCar = car;
      }
      var mk = Missions.marker(state);
      PV.World.setMarker(state, mk ? mk.x : null, mk ? mk.z : null);
    },

    advance: function (state) {
      var m = Missions.current(state);
      if (!m) return;
      state.mission.step++;
      state.mission.holdHeat = false;
      if (state.mission.step >= m.steps.length) {
        Missions.complete(state);
      } else {
        Missions.enterStep(state);
      }
    },

    complete: function (state) {
      var m = Missions.current(state);
      if (!m) return;
      state.money += m.reward.money;
      state.respect += m.reward.respect;
      state.missionIndex = Math.max(state.missionIndex, state.mission.index + 1);
      state.mission = { active: false, index: state.mission.index, step: 0 };
      PV.World.setMarker(state, null, null);
      PV.UI.showToast('MISSION COMPLETE: ' + m.title + '  +$' + m.reward.money + '  +' + m.reward.respect + ' respect');
      PV.Audio.cash();
      PV.Save.save(state);
    },

    fail: function (state, reason) {
      var m = Missions.current(state);
      if (!m) return;
      state.mission = { active: false, index: state.mission.index, step: 0 };
      state.mission.holdHeat = false;
      PV.World.setMarker(state, null, null);
      PV.UI.showToast('MISSION FAILED: ' + reason + ' — press M to retry');
    },

    // Called when a hostile dies during a kill step.
    onHostileDown: function (state) {
      var m = Missions.current(state);
      if (!m) return;
      var step = m.steps[state.mission.step];
      if (!step || step.type !== 'kill') return;
      state.mission.kills++;
      if (state.mission.kills >= step.count) Missions.advance(state);
    },

    update: function (state, dt) {
      var m = Missions.current(state);
      if (!m) return;
      var step = m.steps[state.mission.step];
      if (!step) return;
      var p = state.player;
      var mk = Missions.marker(state);
      PV.World.setMarker(state, mk ? mk.x : null, mk ? mk.z : null);

      function near(x, z, r) {
        var dx = p.x - x, dz = p.z - z;
        return dx * dx + dz * dz < r * r;
      }

      if (step.type === 'goto' || step.type === 'pickup' || step.type === 'talk' || step.type === 'deliver') {
        var pos = PV.World.placePosition(step.place);
        if (near(pos.x, pos.z, 10)) {
          if (step.type === 'pickup') PV.UI.showToast('Picked up — now deliver it');
          if (step.type === 'talk') PV.UI.showToast('The informant talks. The ledger is at the tower.');
          Missions.advance(state);
        }
      } else if (step.type === 'driveTo') {
        var pos2 = PV.World.placePosition(step.place);
        if (p.mode === 'car' && near(pos2.x, pos2.z, 12)) Missions.advance(state);
      } else if (step.type === 'steal') {
        var car = state.mission.targetCar;
        if (car && p.mode === 'car' && p.vehicle === car) {
          PV.Police.addWanted(state, 1, 'vehicle theft');
          Missions.advance(state);
        }
      } else if (step.type === 'race') {
        state.mission.timer -= dt;
        var cp = step.checkpoints[state.mission.checkpoint];
        if (cp && p.mode === 'car' && near(cp.x, cp.z, 12)) {
          state.mission.checkpoint++;
          PV.UI.showToast('Gate ' + state.mission.checkpoint + '/' + step.checkpoints.length);
          if (state.mission.checkpoint >= step.checkpoints.length) Missions.advance(state);
        } else if (state.mission.timer <= 0) {
          Missions.fail(state, 'Out of time');
        }
      } else if (step.type === 'escort') {
        var van = state.mission.van;
        if (!van || van.wrecked) { Missions.fail(state, 'The van was destroyed'); return; }
        // The van drives its route on its own.
        if (van.route) {
          var wp = van.route[van.routeIdx];
          var dx = wp.x - van.x, dz = wp.z - van.z;
          var dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 4) van.routeIdx = Math.min(van.routeIdx + 1, van.route.length - 1);
          else {
            var wh = Math.atan2(dx, dz);
            var dh = wh - van.heading;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            PV.Entities.updateVehicle(state, van, dt, {
              throttle: van.speed < van.cruise ? 0.6 : 0,
              steer: PV.clamp(dh * 2, -1, 1), brake: false
            });
          }
        }
        var vdx = p.x - van.x, vdz = p.z - van.z;
        var vdist = Math.sqrt(vdx * vdx + vdz * vdz);
        if (vdist < 30) {
          state.mission.escortTime += dt;
          state.mission.escortFar = 0;
        } else {
          state.mission.escortFar += dt;
          if (state.mission.escortFar > 12) { Missions.fail(state, 'You lost the van'); return; }
        }
        var dest = PV.World.placePosition(step.place);
        var ddx = van.x - dest.x, ddz = van.z - dest.z;
        if (ddx * ddx + ddz * ddz < 144 && vdist < 30) {
          Missions.advance(state);
        }
      } else if (step.type === 'survive') {
        state.mission.timer -= dt;
        if (state.mission.timer <= 0) {
          var dest2 = PV.World.placePosition(step.place);
          if (near(dest2.x, dest2.z, 12)) Missions.advance(state);
          else if (state.wanted <= 0) Missions.advance(state);
        }
      } else if (step.type === 'kill') {
        // Completion is counted in onHostileDown.
      }
    }
  };

  PV.Missions = Missions;
})();
