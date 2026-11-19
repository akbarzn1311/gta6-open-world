// Port Verona v2 — game configuration and data.
// Every number, name and story beat below is original to this game.
// The module only holds data and a small seeded random helper; it touches
// no DOM and no three.js, so the Node smoke test can load it on its own.
(function () {
  'use strict';
  var PV = (window.PV = window.PV || {});

  PV.VERSION = '2.0';
  PV.GAME_TITLE = 'Port Verona';
  PV.SAVE_KEY = 'port-verona-v2-save';

  // Seeded random: deterministic world and shot staging from a seed.
  PV.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  PV.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  PV.lerp = function (a, b, t) { return a + (b - a) * t; };
  PV.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; };

  // ---------------------------------------------------------------- city
  PV.CITY = {
    blocks: 9,            // blocks across, per axis
    pitch: 48,            // distance between street centre lines
    block: 34,            // building block width
    street: 14,           // street width
    half: 216,            // playable half-extent, metres
    roadY: 0.02
  };

  PV.DISTRICTS = [
    { name: 'Sunset Quay', x0: -216, z0: 96, x1: 216, z1: 216 },
    { name: 'Paseo del Mar', x0: -216, z0: -48, x1: 216, z1: 96 },
    { name: 'Alto Vista', x0: -216, z0: -216, x1: 0, z1: -48 },
    { name: 'Harbor Docks', x0: 0, z0: -216, x1: 216, z1: -48 }
  ];

  // Named places the missions and the HUD refer to. Coordinates are metres
  // in world space (x east, z south); the pier sits past the south edge.
  PV.PLACES = {
    plaza:    { x: 0,    z: 0,    name: 'Fountain Plaza' },
    pier:     { x: 0,    z: 205,  name: 'The Old Pier' },
    arch:     { x: 0,    z: -48,  name: 'Sol Arch' },
    garage:   { x: -144, z: 96,   name: "Gus's Spray & Tune" },
    tower:    { x: 144,  z: -144, name: 'Meridian Tower' },
    warehouse:{ x: 144,  z: 96,   name: 'Harbor Warehouse' },
    market:   { x: -96,  z: -96,  name: 'Mercado Norte' },
    beach:    { x: -168, z: 192,  name: 'Coral Beach' }
  };

  PV.STREET_NAMES = [
    'Paseo del Mar', 'Sunset Quay', 'Avenida Coral', 'Calle Brisa',
    'Boulevard Aurora', 'Calle Coral', 'Avenida Palma', 'Calle Loma'
  ];

  PV.NEON_SIGNS = ['HOTEL', 'BAR', '24H', 'TACOS', 'CINE', 'PIER', 'CLUB', 'CAFE', 'MOTO', 'SURF'];

  // ---------------------------------------------------------------- characters
  // Five named characters with distinct looks. Portraits are drawn from
  // these fields by ui.js, so the cast reads as five different people.
  PV.CHARACTERS = [
    {
      id: 'dana', name: 'Dana Cole', role: 'Fixer',
      skin: '#7a4a2b', hair: '#14100c', hairStyle: 'braids', outfit: '#6d28a8',
      accent: '#c084fc', desc: 'Runs the jobs from a booth above the plaza.'
    },
    {
      id: 'rico', name: 'Rico Santos', role: 'Wheelman',
      skin: '#c68e5e', hair: '#1d1410', hairStyle: 'short', outfit: '#b91c1c',
      accent: '#f87171', desc: 'Drives anything with four wheels. Usually fast.'
    },
    {
      id: 'lena', name: 'Lena Marsh', role: 'Smuggler',
      skin: '#f0c8a0', hair: '#e8c85a', hairStyle: 'bob', outfit: '#0f766e',
      accent: '#5eead4', desc: 'Moves cargo through the docks without paperwork.'
    },
    {
      id: 'gus', name: 'Gus Okafor', role: 'Mechanic',
      skin: '#4a2c17', hair: '#0c0a08', hairStyle: 'bald', outfit: '#c2410c',
      accent: '#fdba74', desc: 'Owns the garage. Fixes cars, no questions asked.'
    },
    {
      id: 'vex', name: 'Vex Calloway', role: 'Rival',
      skin: '#a06b42', hair: '#7f1d1d', hairStyle: 'mohawk', outfit: '#111827',
      accent: '#facc15', desc: 'Leads the crew that wants Port Verona for itself.'
    }
  ];

  PV.PED_SKINS = ['#f0c8a0', '#c68e5e', '#8a5a33', '#7a4a2b', '#4a2c17', '#e8b48c'];
  PV.PED_SHIRTS = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#6d28a8', '#0f766e', '#be185d', '#334155', '#e2e8f0', '#f97316'];
  PV.PED_HAIRSTYLES = ['short', 'bob', 'braids', 'bald', 'mohawk', 'bun'];

  // ---------------------------------------------------------------- weapons
  PV.WEAPONS = [
    { id: 'fists',   name: 'Fists',   melee: true,  damage: 14, range: 2.4, rate: 0.45, ammo: Infinity, maxAmmo: Infinity, price: 0,    respect: 0,  icon: '1' },
    { id: 'pistol',  name: 'Pistol',  melee: false, damage: 26, range: 70,  rate: 0.32, ammo: 120, maxAmmo: 240, price: 0,    respect: 0,  icon: '2' },
    { id: 'smg',     name: 'Tempest SMG', melee: false, damage: 13, range: 55, rate: 0.09, ammo: 150, maxAmmo: 400, price: 1200, respect: 10, icon: '3' },
    { id: 'shotgun', name: 'Sledge', melee: false, damage: 11, range: 26,  rate: 0.85, ammo: 40,  maxAmmo: 120, price: 2600, respect: 25, icon: '4', pellets: 6 },
    { id: 'rifle',   name: 'Hawk', melee: false, damage: 48, range: 130, rate: 0.9,  ammo: 40,  maxAmmo: 120, price: 5200, respect: 40, icon: '5' }
  ];

  // ---------------------------------------------------------------- vehicles
  PV.VEHICLES = [
    { id: 'hatch',  name: 'Pinto Hatch',  topSpeed: 26, accel: 14, handling: 1.0, health: 80,  price: 0,    respect: 0,  color: '#7c8a9c', seats: 4 },
    { id: 'sedan',  name: 'Aurea Sedan',  topSpeed: 31, accel: 16, handling: 1.05, health: 100, price: 800,  respect: 0,  color: '#3b82f6', seats: 4 },
    { id: 'coupe',  name: 'Veloce Coupe', topSpeed: 36, accel: 19, handling: 1.15, health: 90,  price: 2200, respect: 10, color: '#dc2626', seats: 2 },
    { id: 'sports', name: 'Falcon Astra GT', topSpeed: 44, accel: 24, handling: 1.3, health: 90, price: 6000, respect: 25, color: '#f59e0b', seats: 2 },
    { id: 'van',    name: 'Cargo Van',    topSpeed: 24, accel: 11, handling: 0.85, health: 140, price: 1500, respect: 5,  color: '#e5e7eb', seats: 3 },
    { id: 'truck',  name: 'Hauler Truck', topSpeed: 22, accel: 10, handling: 0.8, health: 180, price: 3000, respect: 15, color: '#65a30d', seats: 3 }
  ];

  PV.POLICE_CAR = { id: 'police', name: 'VCPD Interceptor', topSpeed: 38, accel: 21, handling: 1.2, health: 120, color: '#111827' };

  // ---------------------------------------------------------------- garage
  PV.GARAGE = {
    engine: [
      { name: 'Stock', cost: 0, mult: 1.0 },
      { name: 'Tuned', cost: 900, mult: 1.18 },
      { name: 'Race', cost: 2600, mult: 1.38 }
    ],
    armor: [
      { name: 'Stock', cost: 0, mult: 1.0 },
      { name: 'Plated', cost: 700, mult: 1.5 },
      { name: 'Armoured', cost: 2000, mult: 2.2 }
    ],
    paint: [
      { name: 'Verona Red', cost: 300, color: '#dc2626' },
      { name: 'Sunset Gold', cost: 300, color: '#f59e0b' },
      { name: 'Ocean Blue', cost: 300, color: '#2563eb' },
      { name: 'Midnight', cost: 500, color: '#111827' },
      { name: 'Lime Rush', cost: 500, color: '#65a30d' },
      { name: 'Pearl White', cost: 500, color: '#f1f5f9' }
    ]
  };

  // ---------------------------------------------------------------- radio
  // Three generative stations: the notes are scheduled by audio.js, so no
  // audio file is ever loaded.
  PV.RADIO = [
    { id: 'sunset', name: 'Sunset FM 98.1', genre: 'Golden-hour pop', tempo: 96, scale: [0, 2, 4, 7, 9], root: 57 },
    { id: 'palma', name: 'Palma FM 98.1', genre: 'Coastal latin', tempo: 116, scale: [0, 2, 3, 7, 8], root: 55 },
    { id: 'night', name: 'Night Drive 101.4', genre: 'Synthwave', tempo: 84, scale: [0, 3, 5, 7, 10], root: 50 }
  ];

  // ---------------------------------------------------------------- missions
  // Step types: goto (reach a place), driveTo (reach it in a car), pickup,
  // deliver, kill (eliminate N hostiles at a place), race (hit checkpoints
  // before the timer ends), escort (stay near a moving van), survive
  // (hold a wanted level for N seconds, then reach a place), talk.
  PV.MISSIONS = [
    {
      id: 'm1', title: 'First Fare', giver: 'dana', respect: 0,
      brief: 'Dana needs a package moved from the pier to the plaza. No questions, no stops.',
      dialogue: ['New in town? Good. The pier package, the plaza drop. Walk it or drive it — just don\'t lose it.'],
      steps: [
        { type: 'goto', place: 'pier', label: 'Pick up the package at the Old Pier' },
        { type: 'deliver', place: 'plaza', label: 'Deliver the package to Fountain Plaza' }
      ],
      reward: { money: 150, respect: 10 }
    },
    {
      id: 'm2', title: 'Night Run', giver: 'rico', respect: 10,
      brief: 'Rico set a street race across the boulevard. Four gates, one clock. Beat it.',
      dialogue: ['You drive? Prove it. Four gates, two and a half minutes. My money says you clip a wall.'],
      steps: [
        { type: 'race', checkpoints: [{ x: 0, z: -96 }, { x: 96, z: -96 }, { x: 96, z: 96 }, { x: 0, z: 96 }], timeLimit: 150, label: 'Hit all 4 race gates before time runs out' }
      ],
      reward: { money: 300, respect: 15 }
    },
    {
      id: 'm3', title: 'Hot Goods', giver: 'lena', respect: 15,
      brief: 'A crate at the Harbor warehouse needs to reach Gus without the harbour patrol noticing.',
      dialogue: ['The crate is marked "machine parts". It is not machine parts. Gus is waiting — go.'],
      steps: [
        { type: 'pickup', place: 'warehouse', label: 'Collect the crate at Harbor Warehouse' },
        { type: 'deliver', place: 'garage', label: 'Drop the crate at Gus\'s garage' }
      ],
      reward: { money: 400, respect: 15 }
    },
    {
      id: 'm4', title: 'Muscle Work', giver: 'dana', respect: 25,
      brief: 'Vex\'s crew is leaning on the plaza vendors. Make them leave. Permanently, if needed.',
      dialogue: ['Three of Vex\'s boys by the fountain. They respect force. You have force, yes?'],
      steps: [
        { type: 'kill', count: 3, place: 'plaza', label: 'Clear 3 of Vex\'s crew from Fountain Plaza' }
      ],
      reward: { money: 350, respect: 20 }
    },
    {
      id: 'm5', title: 'Getaway Driver', giver: 'rico', respect: 30,
      brief: 'Rico lifts a coupe from the market. You drive it out while the VCPD is still waking up.',
      dialogue: ['Car\'s at the market. Take it, get the heat, lose the heat. That\'s the whole job.'],
      steps: [
        { type: 'driveTo', place: 'market', label: 'Reach the coupe at Mercado Norte' },
        { type: 'survive', seconds: 45, wanted: 2, place: 'garage', label: 'Lose the heat, then reach the garage' }
      ],
      reward: { money: 500, respect: 20 }
    },
    {
      id: 'm6', title: 'The Shipment', giver: 'lena', respect: 40,
      brief: 'Escort Lena\'s van from the docks to the tower. Stay close — the road is not friendly.',
      dialogue: ['Van leaves the docks in a minute. You ride shotgun — literally. Stay on it.'],
      steps: [
        { type: 'escort', place: 'tower', seconds: 75, label: 'Escort the van to Meridian Tower' }
      ],
      reward: { money: 600, respect: 25 }
    },
    {
      id: 'm7', title: 'Turf War', giver: 'dana', respect: 50,
      brief: 'Vex is taking the Sol Arch. Take it back, in front of everybody.',
      dialogue: ['Five of them under the arch. The whole street is watching. Make it count.'],
      steps: [
        { type: 'kill', count: 5, place: 'arch', label: 'Clear 5 of Vex\'s crew from Sol Arch' }
      ],
      reward: { money: 700, respect: 25 }
    },
    {
      id: 'm8', title: 'The Informant', giver: 'dana', respect: 60,
      brief: 'A contact at the fountain knows where Vex hides the ledger. Meet him, then shut the pier down.',
      dialogue: ['My man at the fountain talks too much — to me, that is. Hear him out, then clean the pier.'],
      steps: [
        { type: 'talk', place: 'plaza', label: 'Meet the informant at Fountain Plaza' },
        { type: 'kill', count: 2, place: 'pier', label: 'Clear 2 guards from the Old Pier' }
      ],
      reward: { money: 800, respect: 30 }
    },
    {
      id: 'm9', title: 'Sunset Heist', giver: 'lena', respect: 70,
      brief: 'A Falcon GT sits outside the tower, keys in it, owner bragging inside. Take it to Gus.',
      dialogue: ['Gold Falcon, Meridian Tower, engine running. It is practically asking. Bring it to Gus.'],
      steps: [
        { type: 'steal', place: 'tower', vehicle: 'sports', label: 'Steal the Falcon GT at Meridian Tower' },
        { type: 'deliver', place: 'garage', label: 'Deliver the Falcon to Gus\'s garage' }
      ],
      reward: { money: 1200, respect: 35 }
    },
    {
      id: 'm10', title: 'The Last Job', giver: 'dana', respect: 85,
      brief: 'Vex sails at dusk. Take the ledger from the tower, shake a full manhunt, and reach the boat before it leaves.',
      dialogue: ['This is it. The ledger, the tower, then the pier — with every unit in the city on you. Two minutes. Go.'],
      steps: [
        { type: 'pickup', place: 'tower', label: 'Take the ledger from Meridian Tower' },
        { type: 'survive', seconds: 60, wanted: 4, place: 'pier', label: 'Lose a 4-star manhunt, then reach the pier boat' }
      ],
      reward: { money: 2500, respect: 50 }
    }
  ];

  // Side jobs the player can start any time from the street.
  PV.SIDE_JOBS = {
    race: { name: 'Street Race', reward: 220 },
    delivery: { name: 'Courier Run', reward: 160 },
    escort: { name: 'Escort Job', reward: 260 }
  };

  PV.START_MONEY = 150;
  PV.WANTED_MAX = 5;

  // How fast wanted falls when no police can see the player (per second).
  PV.WANTED_DECAY = 0.045;
  // Seconds out of sight before the heat starts falling.
  PV.WANTED_HIDE_DELAY = 6;
})();
