// ========================================
// Game Constants
// Single source of truth for all tunable game parameters
// ========================================

// ── Tick Rates ───────────────────────────────────────────

export const TICK_RATE = 60;
export const TICK_INTERVAL = 1000 / TICK_RATE; // ~16.67ms
export const NETWORK_RATE = 20;
export const NETWORK_INTERVAL = 1000 / NETWORK_RATE; // 50ms

// ── Movement ─────────────────────────────────────────────

export const WALK_SPEED = 8;
export const SPRINT_SPEED = 14;
export const CROUCH_SPEED = 4.5;
export const SLIDE_SPEED = 18;
export const SLIDE_DURATION = 0.8;
export const SLIDE_JUMP_RETENTION = 0.92;
export const JUMP_FORCE = 9;
export const GRAVITY = -26;
export const FRICTION = 12;
export const SLIDE_FRICTION = 6;
export const AIR_CONTROL = 0.65;
export const GROUND_ACCELERATION = 20;
export const AIR_ACCELERATION = 6;
export const MAX_SPEED = 20;
export const MAX_VELOCITY = MAX_SPEED;
export const PLAYER_SPEED = WALK_SPEED;
export const SPRINT_MULTIPLIER = SPRINT_SPEED / WALK_SPEED;
export const CROUCH_MULTIPLIER = CROUCH_SPEED / WALK_SPEED;

// ── Player Dimensions ────────────────────────────────────

export const PLAYER_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_EYE_OFFSET = 0.7; // from center of capsule upward

// ── Health & Combat ──────────────────────────────────────

export const MAX_HP = 100;
export const MAX_ARMOR = 100;
export const HEADSHOT_MULTIPLIER = 2.0;
export const HEADSHOT_ZONE_RATIO = 0.25; // top 25% of hitbox is headshot

// ── Game Rules ───────────────────────────────────────────

export const MAX_PLAYERS_PER_ROOM = 8;
export const RESPAWN_TIME = 2000; // ms
export const SPAWN_PROTECTION_TIME = 1500; // ms
export const KILL_LIMIT = 25;
export const TIME_LIMIT = 300000; // 5 minutes in ms
export const MIN_PLAYERS_TO_START = 1; // 1 for testing (normally 2)
export const END_GAME_COOLDOWN = 5000; // ms before restart

export const BASE_KILL_SCORE = 100;
export const HEADSHOT_BONUS = 50;
export const ASSIST_SCORE = 50;
export const SLIDE_KILL_BONUS = 75;
export const MIDAIR_KILL_BONUS = 75;
export const LONGSHOT_BONUS = 50;
export const REVENGE_BONUS = 25;
export const STREAK_BONUS_STEP = 10;

// ── Weapon Config Type ───────────────────────────────────

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  headshotMultiplier: number;
  fireRate: number; // rounds per second
  spread: number; // radians
  recoil: number; // vertical kick per shot (radians)
  recoilHorizontal: number;
  magazineSize: number;
  reloadTime: number; // ms
  range: number; // max effective range
  falloffStart: number; // distance where damage starts falling
  falloffEnd: number; // distance where damage reaches minimum
  minDamage: number; // floor damage at max range
  movementPenalty: number;
  automatic: boolean;
  pellets: number; // >1 for shotgun
}

// ── Weapon Definitions ───────────────────────────────────

export const WEAPONS: Record<string, WeaponConfig> = {
  assault_rifle: {
    id: "assault_rifle",
    name: "Assault Rifle",
    damage: 25,
    headshotMultiplier: 2.0,
    fireRate: 10,
    spread: 0.02,
    recoil: 0.03,
    recoilHorizontal: 0.01,
    magazineSize: 30,
    reloadTime: 2000,
    range: 100,
    falloffStart: 30,
    falloffEnd: 80,
    minDamage: 15,
    movementPenalty: 0.05,
    automatic: true,
    pellets: 1,
  },
  smg: {
    id: "smg",
    name: "SMG",
    damage: 18,
    headshotMultiplier: 1.8,
    fireRate: 15,
    spread: 0.04,
    recoil: 0.02,
    recoilHorizontal: 0.015,
    magazineSize: 35,
    reloadTime: 1800,
    range: 60,
    falloffStart: 20,
    falloffEnd: 50,
    minDamage: 10,
    movementPenalty: 0.1,
    automatic: true,
    pellets: 1,
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    damage: 80,
    headshotMultiplier: 2.5,
    fireRate: 1,
    spread: 0.001,
    recoil: 0.08,
    recoilHorizontal: 0.005,
    magazineSize: 5,
    reloadTime: 3000,
    range: 200,
    falloffStart: 100,
    falloffEnd: 200,
    minDamage: 60,
    movementPenalty: 0.25,
    automatic: false,
    pellets: 1,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    damage: 12,
    headshotMultiplier: 1.5,
    fireRate: 1.5,
    spread: 0.1,
    recoil: 0.06,
    recoilHorizontal: 0.02,
    magazineSize: 6,
    reloadTime: 2500,
    range: 30,
    falloffStart: 8,
    falloffEnd: 25,
    minDamage: 5,
    movementPenalty: 0.2,
    automatic: false,
    pellets: 8,
  },
  revolver: {
    id: "revolver",
    name: "Revolver",
    damage: 58,
    headshotMultiplier: 2.2,
    fireRate: 2,
    spread: 0.015,
    recoil: 0.07,
    recoilHorizontal: 0.02,
    magazineSize: 6,
    reloadTime: 2200,
    range: 90,
    falloffStart: 40,
    falloffEnd: 120,
    minDamage: 35,
    movementPenalty: 0.12,
    automatic: false,
    pellets: 1,
  },
};

// ── Interpolation / Prediction ───────────────────────────

export const INTERPOLATION_DELAY = 100; // ms — buffer for smooth remote rendering
export const PREDICTION_CORRECTION_RATE = 0.1; // how fast to lerp toward server state
export const MAX_PREDICTION_ERROR = 3.0; // snap if error exceeds this distance
