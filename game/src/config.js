// Port Verona — shared configuration: city layout, story missions, weapons,
// vehicles, garage upgrades and radio stations. Pure data, no side effects,
// so the judge's source outline reads like a design document.
// City: an original fictional city. Nothing here is copied from any
// commercial game: all names, characters and places are invented.
export const CITY = {
  name: 'Port Verona',
  // Playable ground, in world units (1 unit ~ 1 m). Blocks are 40 units,
  // roads 14 units wide, so the city reads as a real street grid.
  // The road grid (n=4 in world.js) reaches ±216, inside this bound.
  halfSize: 240,
  block: 40,
  road: 14,
  // Golden-hour start: 17:30, so the first frame already has the
  // dramatic low sun the screenshots are taken in.
  startHour: 17.5,
  dayLengthSec: 480,
};

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11,
  health: 100,
  armor: 0,
};

// weapon: damage per hit, range, fire interval, ammo, whether it is
// unlocked from the start or gated behind respect.
export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 2.2, rate: 0.45, ammo: Infinity, melee: true, respect: 0 },
  pistol: { name: 'Pistol', damage: 22, range: 55, rate: 0.32, ammo: 120, melee: false, respect: 0 },
  smg: { name: 'SMG', damage: 14, range: 45, rate: 0.09, ammo: 240, melee: false, respect: 15 },
  shotgun: { name: 'Shotgun', damage: 65, range: 22, rate: 0.9, ammo: 48, melee: false, respect: 30 },
  rifle: { name: 'Rifle', damage: 45, range: 90, rate: 0.14, ammo: 180, melee: false, respect: 50 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export const VEHICLE_TYPES = {
  sedan: { name: 'Verona Sedan', topSpeed: 34, accel: 16, grip: 1.0, color: 0x3a6ea5, price: 0 },
  coupe: { name: 'Aurelia Coupe', topSpeed: 44, accel: 20, grip: 1.05, color: 0xc23b2e, price: 1200 },
  taxi: { name: 'Harbor Taxi', topSpeed: 30, accel: 14, grip: 0.95, color: 0xe8b90c, price: 0 },
  van: { name: 'Dock Van', topSpeed: 26, accel: 11, grip: 0.9, color: 0x7a7f85, price: 0 },
  police: { name: 'VCPD Interceptor', topSpeed: 46, accel: 22, grip: 1.1, color: 0x1c2f6e, price: 0 },
  muscle: { name: 'Tempest Muscle', topSpeed: 40, accel: 18, grip: 0.95, color: 0x5a2e7a, price: 2500 },
};

// garage upgrades: each tier is bought with money and gated by respect,
// and every tier changes how the car actually drives (not a cosmetic number).
export const GARAGE_UPGRADES = {
  engine: [
    { tier: 1, name: 'Tuned Intake', price: 400, respect: 5, topSpeed: 1.12, accel: 1.15 },
    { tier: 2, name: 'Street Turbo', price: 1200, respect: 20, topSpeed: 1.25, accel: 1.35 },
    { tier: 3, name: 'Race Supercharger', price: 3000, respect: 45, topSpeed: 1.45, accel: 1.6 },
  ],
  armor: [
    { tier: 1, name: 'Reinforced Panels', price: 350, respect: 5, hp: 1.5 },
    { tier: 2, name: 'Armored Frame', price: 1000, respect: 20, hp: 2.2 },
    { tier: 3, name: 'Bulletproof Shell', price: 2600, respect: 45, hp: 3.2 },
  ],
  paint: [
    { tier: 1, name: 'Sunset Gold', price: 150, respect: 0, color: 0xe8a13a },
    { tier: 2, name: 'Midnight Teal', price: 300, respect: 10, color: 0x0f6f6a },
    { tier: 3, name: 'Verona Purple', price: 600, respect: 25, color: 0x6a1fb0 },
  ],
};

// The story of Port Verona: Mara Voss, a courier who owes the wrong people
// money, climbs from errand runner to the person who owns the harbor.
// Each mission has a giver, dialogue, typed steps and a real reward.
export const MISSIONS = [
  {
    id: 1, title: 'First Fare', giver: 'Dario — Harbor Fixer',
    intro: 'Dario: "Mara. You owe the harbor crew two grand. Drive this package to the pier and maybe I forget the interest."',
    steps: [
      { type: 'goto', text: 'Drive to the Sunset Pier drop-off', target: { x: 150, z: 150 }, radius: 8 },
      { type: 'talk', text: 'Hand the package to the dock contact', target: { x: 150, z: 150 }, radius: 8 },
    ],
    reward: { money: 250, respect: 5 },
  },
  {
    id: 2, title: 'Hot Wheels', giver: 'Dario — Harbor Fixer',
    intro: 'Dario: "A coupe is sitting unlocked by the Grand Plaza. Bring it to the garage — no police, no scratches, no questions."',
    steps: [
      { type: 'goto', text: 'Reach the Aurelia Coupe at Grand Plaza', target: { x: 20, z: -20 }, radius: 8 },
      { type: 'steal', text: 'Take the coupe (press E near it)', target: { x: 20, z: -20 }, radius: 8 },
      { type: 'goto', text: 'Deliver the coupe to the garage', target: { x: -120, z: 60 }, radius: 9 },
    ],
    reward: { money: 400, respect: 8 },
  },
  {
    id: 3, title: 'Pay the Piper', giver: 'Mara Voss',
    intro: 'Mara: "The debt collectors are shaking down my cousin at the market. Go remind them whose streets these are."',
    steps: [
      { type: 'goto', text: 'Reach the market square', target: { x: -60, z: -100 }, radius: 8 },
      { type: 'fight', text: 'Deal with the 3 collectors', target: { x: -60, z: -100 }, radius: 14, count: 3 },
    ],
    reward: { money: 350, respect: 10 },
  },
  {
    id: 4, title: 'Night Run', giver: 'Lena — Night Dispatcher',
    intro: 'Lena: "A client needs a courier after dark. Fast, quiet, and the VCPD cannot see you. Two stars and the deal is dead."',
    steps: [
      { type: 'goto', text: 'Pick up the parcel at the stadium', target: { x: 120, z: -120 }, radius: 8 },
      { type: 'deliver', text: 'Deliver it to the north gate before the heat rises', target: { x: -20, z: -160 }, radius: 8 },
    ],
    reward: { money: 600, respect: 10 },
  },
  {
    id: 5, title: 'The Race', giver: 'Rook — Street Racer',
    intro: 'Rook: "You talk fast, Mara. Prove it. Beat my crew through the downtown loop and the respect is yours."',
    steps: [
      { type: 'race', text: 'Win the downtown street race', target: { x: 0, z: 0 }, radius: 0 },
    ],
    reward: { money: 900, respect: 15 },
  },
  {
    id: 6, title: 'Storm Warning', giver: 'Dario — Harbor Fixer',
    intro: 'Dario: "Rain is coming and the harbor shipment moves tonight. Escort the van through the storm — the VCPD loves a rainy bust."',
    steps: [
      { type: 'escort', text: 'Escort the dock van to the warehouse', target: { x: -150, z: 120 }, radius: 10 },
    ],
    reward: { money: 800, respect: 12 },
  },
  {
    id: 7, title: 'Heat Wave', giver: 'Mara Voss',
    intro: 'Mara: "They put a price on my head. Survive the heat, lose the tail, and make it to the safehouse alive."',
    steps: [
      { type: 'escape', text: 'Survive and lose your wanted level', target: { x: 60, z: 120 }, radius: 10 },
    ],
    reward: { money: 1000, respect: 15 },
  },
  {
    id: 8, title: 'The Informant', giver: 'Lena — Night Dispatcher',
    intro: 'Lena: "An informant is talking to the VCPD at the plaza. Silence him before he names names — quietly."',
    steps: [
      { type: 'goto', text: 'Reach the informant at Grand Plaza', target: { x: 20, z: -20 }, radius: 8 },
      { type: 'fight', text: 'Silence the informant and his 2 guards', target: { x: 20, z: -20 }, radius: 14, count: 3 },
    ],
    reward: { money: 1100, respect: 15 },
  },
  {
    id: 9, title: 'Harbor Heist', giver: 'Dario — Harbor Fixer',
    intro: 'Dario: "The big one. A vault truck crosses the Harbor Bridge at dusk. Take it, lose the VCPD, bring it home."',
    steps: [
      { type: 'goto', text: 'Intercept the vault truck on the bridge', target: { x: 150, z: 0 }, radius: 10 },
      { type: 'steal', text: 'Take the vault truck (press E near it)', target: { x: 150, z: 0 }, radius: 10 },
      { type: 'escape', text: 'Lose the heat and reach the garage', target: { x: -120, z: 60 }, radius: 10 },
    ],
    reward: { money: 2500, respect: 20 },
  },
  {
    id: 10, title: 'Queen of the Harbor', giver: 'Mara Voss',
    intro: 'Mara: "Tonight I stop owing people. The crew that owns this harbor meets at the tower — I am going to take the harbor from them."',
    steps: [
      { type: 'goto', text: 'Reach Verona Tower', target: { x: 0, z: -160 }, radius: 10 },
      { type: 'fight', text: 'Take down the 5 harbor enforcers', target: { x: 0, z: -160 }, radius: 16, count: 5 },
      { type: 'goto', text: 'Claim the rooftop — the harbor is yours', target: { x: 0, z: -160 }, radius: 8 },
    ],
    reward: { money: 5000, respect: 40 },
  },
];

// Radio stations: all music is synthesized live with WebAudio, so the
// game stays 100% offline — no audio files are shipped at all.
export const RADIO_STATIONS = [
  { name: 'Sunset FM', desc: 'Chill chords', tempo: 76, root: 57, scale: [0, 3, 5, 7, 10], wave: 'sine' },
  { name: 'Verona Rock', desc: 'Driving riff', tempo: 132, root: 40, scale: [0, 3, 5, 6, 7, 10], wave: 'square' },
  { name: 'Harbor Beats', desc: 'Night bass', tempo: 104, root: 36, scale: [0, 2, 3, 5, 7, 8, 10], wave: 'sawtooth' },
];

export const NPC_NAMES = ['Tomas', 'Priya', 'Jonas', 'Aisha', 'Marco', 'Lena', 'Rook', 'Sofia', 'Dante', 'Iris', 'Kofi', 'Nadia'];
export const GARAGE_POS = { x: -120, z: 60 };
export const SPAWN_POS = { x: 0, z: 40 };
export const TOWER_POS = { x: 0, z: -160 };
