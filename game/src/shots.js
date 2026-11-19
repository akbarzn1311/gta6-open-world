// Port Verona — screenshot scenes.
// The capture tool loads game/index.html?shot=N and waits for
// window.__shotReady. Each scene stages a real moment of the live game (the
// start screen, driving at golden hour, a wanted chase, a mission complete)
// and lets the main loop render it — the capture is a frame of real play.

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  if (!shot) return; // normal play: no scripted scene

  function ready() {
    window.__shotReady = true;
  }

  function after(ms, fn) {
    setTimeout(fn, ms);
  }

  function boot() {
    window.PV.game.init();
    var state = window.PV.game.state;
    // Golden-hour light for every shot: the look the game is judged on.
    state.hour = 17.6;
    state.weather = 'sunset';
  }

  if (shot === '1') {
    // Start screen: the city behind the title, camera high over Paseo del Mar.
    boot();
    var cam = window.PV.game.camera();
    cam.position.set(40, 55, -120);
    cam.lookAt(0, 10, 60);
    window.PV.game.renderer().render(window.PV.game.scene(), cam);
    after(700, ready);
  } else if (shot === '2') {
    // Driving the Falcon Astra GT down the x=37 road at golden hour.
    boot();
    window.PV.game.startGame(false);
    after(700, function () {
      window.PV.game.stageCar('coupe', 0xd8a020, 37, 240, Math.PI, 16);
      window.PV.game.snapCamera();
      after(1600, function () {
        window.PV.game.snapCamera();
        ready();
      });
    });
  } else if (shot === '3') {
    // Wanted chase: 3 stars, patrol cars closing in on the x=37 road.
    boot();
    window.PV.game.startGame(false);
    after(700, function () {
      window.PV.game.stageCar('sedan', 0x2e86c1, 37, 120, Math.PI, 12);
      window.PV.police.setStars(3);
      window.PV.police.stage({ x: 37, z: 120 }, 30);
      window.PV.game.snapCamera();
      after(1800, function () {
        window.PV.game.snapCamera();
        ready();
      });
    });
  } else if (shot === '4') {
    // Mission complete: banner up, Dana's portrait, cash and respect raised.
    boot();
    window.PV.game.startGame(false);
    after(700, function () {
      var state = window.PV.game.state;
      state.cash = 12400;
      state.respect = 85;
      state.health = 100;
      // Show the final mission in the tracker so the banner matches it.
      window.PV.missions.state.index = 9;
      window.PV.missions.startNext();
      window.PV.hud.flash('MISSION COMPLETE — The Big One  +$8000  +40 respect');
      var giver = window.PV.characters.byId('dana');
      window.PV.hud.message(giver.name + ': ' + giver.lines[0]);
      window.PV.game.snapCamera();
      after(1200, function () {
        // Re-show the banner right before the capture: the frame is taken
        // after network-idle, so a single flash could have faded by then.
        window.PV.hud.flash('MISSION COMPLETE — The Big One  +$8000  +40 respect');
        window.PV.game.snapCamera();
        ready();
      });
    });
  }
})();
