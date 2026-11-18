// Solmar Bay — shared tuning constants for the whole game.
// One place for every number a designer would want to tweak: city size,
// movement speeds, wanted levels, mission rewards and audio levels.

export const CITY = {
  // Grid of roads: GRID roads run each way, spaced BLOCK apart.
  GRID: 9,
  BLOCK: 52,
  ROAD_W: 14,
  // City spans 0..416 on x and z. South of z = BEACH_START is sand, then sea.
  BEACH_START: 432,
  SEA_START: 472,
  WORLD_EDGE: 900,
};

export const PLAYER = {
  WALK_SPEED: 4.2,
  RUN_SPEED: 7.4,
  JUMP_SPEED: 7.5,
  GRAVITY: 22,
  MAX_HEALTH: 100,
  RADIUS: 0.55,
  HEIGHT: 1.8,
};

export const CAR = {
  ACCEL: 16,
  BRAKE: 30,
  REVERSE_MAX: 9,
  MAX_SPEED: 30,
  SPORT_MAX: 38,
  STEER: 1.9,
  GRIP: 6.5,
};

export const WANTED = {
  MAX: 5,
  // Stars added by each crime.
  STEAL_CAR: 1,
  HIT_PED: 1,
  SHOOT: 1,
  KILL_COP: 2,
  KILL_PED: 1,
  // Seconds of quiet before one star fades.
  DECAY_AFTER: 18,
  DECAY_EVERY: 14,
  // How many police units each wanted level keeps on the street.
  UNITS: [0, 1, 2, 3, 4, 6],
};

export const COMBAT = {
  PISTOL_DAMAGE: 34,
  PISTOL_MAG: 12,
  PISTOL_RANGE: 90,
  PISTOL_FIRE_MS: 220,
  MELEE_DAMAGE: 26,
  MELEE_RANGE: 2.4,
  MELEE_MS: 450,
  COP_HEALTH: 60,
  PED_HEALTH: 40,
};

export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    giver: 'Rico',
    brief:
      'Rico needs a ride, fast. Steal any car on the street, then bring it to the docks marker at the south end of town.',
    reward: 600,
  },
  {
    id: 'maras-getaway',
    name: "Mara's Getaway",
    giver: 'Mara Voss',
    brief:
      'Pick up Mara on Coral Avenue. The Solmar Bay PD will be all over you — shake them off and get her to the safehouse on Palm Row.',
    reward: 1500,
  },
  {
    id: 'pier-drop',
    name: 'Pier Drop',
    giver: 'Rico',
    brief:
      'A package has to reach the end of the pier in 90 seconds. Drive like the tide is coming in — because it is.',
    reward: 2500,
  },
];

export const SAVE_KEY = 'solmar-bay-save-v1';

// Street names shown on the HUD when the player crosses a road.
export const STREET_NAMES = [
  'Coral Avenue',
  'Palm Row',
  'Sunset Boulevard',
  'Marina Drive',
  'Ocean View',
  'Cactus Lane',
  'Harbor Street',
  'Flamingo Way',
  'Bayfront Road',
];

export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8d4e8,
  sun: 0xfff2d8,
  asphalt: 0x2e3138,
  asphaltLine: 0xd8d8c8,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d49a,
  sea: 0x1e7fa8,
  seaDeep: 0x0d5a80,
  grass: 0x5a8a4a,
  building: [0xd8c8b0, 0xc8b8a8, 0xa8b8c8, 0xe0d0c0, 0xb0a890, 0xd0a890, 0x98a8b8, 0xc8c8b8],
  glass: 0x3a5a78,
  car: [0xc83232, 0x3268c8, 0xe8c832, 0x38a868, 0xe8e8e8, 0x282828, 0xd87828, 0x8838a8, 0x38b8c8],
  pedShirt: [0xe84848, 0x48a8e8, 0x48c878, 0xe8c848, 0xe88848, 0xa848e8, 0xe8e8e8, 0x383838],
};
