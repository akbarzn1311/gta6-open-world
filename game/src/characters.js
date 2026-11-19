// Port Verona — the five story characters.
// Each has a procedural portrait (drawn on a canvas: skin tone, hair, eyes,
// clothing, a signature accessory) and a voice in the mission dialogue.
// Portraits are drawn fresh per character, never from image files.

(function () {
  'use strict';

  var CHARACTERS = [
    {
      id: 'dana',
      name: 'Dana Cole',
      role: 'Fixer — runs the jobs from the Meridian Tower penthouse',
      skin: '#c98d64',
      hair: '#1a1210',
      hairStyle: 'bob',
      shirt: '#7a1f2b',
      accent: '#e8c15a',
      lines: [
        'Port Verona rewards the bold, sweetheart. Don\'t keep me waiting.',
        'The Falcon Astra GT is yours if you can bring it back in one piece.',
        'Respect is the only currency that never devalues here.',
      ],
    },
    {
      id: 'rico',
      name: 'Rico Santos',
      role: 'Wheelman — getaway driver, Sunset Quay garage',
      skin: '#8a5a34',
      hair: '#0d0d0d',
      hairStyle: 'fade',
      shirt: '#1f4d3a',
      accent: '#f2f2f2',
      lines: [
        'You drive like my abuela. Faster. Smoother. No brakes in the corners.',
        'The garage is yours. Engine first, paint later — paint don\'t outrun cops.',
        'I heard the cops set a roadblock on Paseo del Mar. Go around, through the plaza.',
      ],
    },
    {
      id: 'lena',
      name: 'Lena Marsh',
      role: 'Hacker — eyes on every camera in the city',
      skin: '#e8b98f',
      hair: '#5a2d82',
      hairStyle: 'long',
      shirt: '#22283a',
      accent: '#39d0d8',
      lines: [
        'I\'m in the traffic grid. The lights on Calle Loma are green for you.',
        'Cops ping your phone when you hit three stars. I can spoof it — for a price.',
        'The helicopter has a blind spot over the water. Remember that.',
      ],
    },
    {
      id: 'gus',
      name: 'Gus Okafor',
      role: 'Arms dealer — Tempest SMGs and quiet favours',
      skin: '#5a3a22',
      hair: '#111111',
      hairStyle: 'bald',
      shirt: '#3a2a1a',
      accent: '#c9a227',
      lines: [
        'Tempest SMG. Thirty rounds, no questions. You want the Hawk too?',
        'You point it, it solves problems. You wave it, it makes problems.',
        'Pay cash, walk away smiling. That\'s the whole warranty.',
      ],
    },
    {
      id: 'vex',
      name: 'Vex Calloway',
      role: 'Street racer — queen of the midnight circuit',
      skin: '#d9a077',
      hair: '#c22e2e',
      hairStyle: 'mohawk',
      shirt: '#111111',
      accent: '#ff5a3c',
      lines: [
        'You beat my time on the quay run, I\'ll owe you one. You don\'t, you owe me.',
        'The Falcon Astra GT corners like it\'s on rails. Steal one and prove it.',
        'Midnight. Sunset Quay. Bring something fast or don\'t come at all.',
      ],
    },
  ];

  var portraitCache = {};

  /** Draw one procedural portrait onto a 160x200 canvas. */
  function drawPortrait(ch) {
    var c = document.createElement('canvas');
    c.width = 160;
    c.height = 200;
    var g = c.getContext('2d');
    // Background: warm gradient with a rim glow in the accent colour.
    var bg = g.createLinearGradient(0, 0, 0, 200);
    bg.addColorStop(0, '#2a2438');
    bg.addColorStop(1, '#120e1c');
    g.fillStyle = bg;
    g.fillRect(0, 0, 160, 200);
    g.strokeStyle = ch.accent;
    g.lineWidth = 3;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.arc(80, 96, 62, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    // Shoulders / shirt.
    g.fillStyle = ch.shirt;
    g.beginPath();
    g.moveTo(18, 200);
    g.quadraticCurveTo(40, 152, 80, 150);
    g.quadraticCurveTo(120, 152, 142, 200);
    g.closePath();
    g.fill();
    // Neck.
    g.fillStyle = ch.skin;
    g.fillRect(70, 128, 20, 26);
    // Head.
    g.beginPath();
    g.ellipse(80, 96, 34, 40, 0, 0, Math.PI * 2);
    g.fill();
    // Ears.
    g.beginPath();
    g.ellipse(46, 98, 6, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(114, 98, 6, 10, 0, 0, Math.PI * 2);
    g.fill();
    // Hair.
    g.fillStyle = ch.hair;
    if (ch.hairStyle === 'bob') {
      g.beginPath();
      g.ellipse(80, 62, 36, 26, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillRect(44, 60, 10, 42);
      g.fillRect(106, 60, 10, 42);
    } else if (ch.hairStyle === 'fade') {
      g.beginPath();
      g.ellipse(80, 58, 35, 18, 0, Math.PI, Math.PI * 2);
      g.fill();
    } else if (ch.hairStyle === 'long') {
      g.beginPath();
      g.ellipse(80, 60, 37, 24, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillRect(42, 58, 12, 92);
      g.fillRect(106, 58, 12, 92);
    } else if (ch.hairStyle === 'mohawk') {
      g.beginPath();
      g.moveTo(72, 66);
      g.quadraticCurveTo(80, 18, 88, 66);
      g.closePath();
      g.fill();
    }
    // Brows, eyes, nose, mouth.
    g.strokeStyle = ch.hair;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(60, 88); g.lineTo(74, 86); g.stroke();
    g.beginPath(); g.moveTo(86, 86); g.lineTo(100, 88); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(67, 96, 7, 4.5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(93, 96, 7, 4.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1210';
    g.beginPath(); g.arc(67, 96, 2.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(93, 96, 2.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(80, 98); g.lineTo(78, 110); g.lineTo(82, 112); g.stroke();
    g.strokeStyle = '#7a3a2a';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(70, 122); g.quadraticCurveTo(80, 127, 90, 122); g.stroke();
    // Signature accessory.
    g.fillStyle = ch.accent;
    if (ch.id === 'dana') {
      g.beginPath(); g.arc(46, 108, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(114, 108, 3, 0, Math.PI * 2); g.fill();
    } else if (ch.id === 'rico') {
      g.fillRect(58, 84, 44, 5); // sunglasses bar hint
    } else if (ch.id === 'lena') {
      g.strokeStyle = ch.accent; g.lineWidth = 2;
      g.strokeRect(58, 90, 18, 12);
      g.strokeRect(84, 90, 18, 12);
    } else if (ch.id === 'gus') {
      g.fillRect(74, 148, 12, 8); // gold chain clasp
    } else if (ch.id === 'vex') {
      g.beginPath(); g.moveTo(80, 150); g.lineTo(88, 162); g.lineTo(72, 162); g.closePath(); g.fill();
    }
    return c;
  }

  /** Portrait as a data URL (cached per character). */
  function portrait(ch) {
    if (!portraitCache[ch.id]) portraitCache[ch.id] = drawPortrait(ch).toDataURL('image/png');
    return portraitCache[ch.id];
  }

  function byId(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return CHARACTERS[0];
  }

  function randomLine(ch) {
    return ch.lines[Math.floor(Math.random() * ch.lines.length)];
  }

  window.PV = window.PV || {};
  window.PV.characters = {
    list: CHARACTERS,
    byId: byId,
    portrait: portrait,
    randomLine: randomLine,
  };
})();
