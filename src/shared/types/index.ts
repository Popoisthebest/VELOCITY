// ========================================
// Shared Type Definitions
// Used by both client and server
// ========================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  yaw: number; // horizontal rotation (radians)
  pitch: number; // vertical rotation (radians)
}

export enum WeaponType {
  ASSAULT_RIFLE = "assault_rifle",
  SNIPER = "sniper",
  SMG = "smg",
  SHOTGUN = "shotgun",
  REVOLVER = "revolver",
}

export enum GamePhase {
  WAITING = "waiting",
  PLAYING = "playing",
  ENDED = "ended",
}

export interface PlayerState {
  id: string;
  nickname: string;
  position: Vec3;
  velocity: Vec3;
  rotation: Rotation;
  health: number;
  armor: number;
  alive: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  aiming: boolean;
  slideTime: number;
  grounded: boolean;
  weapon: WeaponType;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadEndTime: number;
  lastFireTime: number;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  streak: number;
  spawnProtectionUntil: number;
  ping: number;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  aim: boolean;
  shoot: boolean;
  reload: boolean;
  yaw: number;
  pitch: number;
  sequence: number;
  deltaTime: number;
  ping: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}

export interface KillEvent {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: WeaponType;
  headshot: boolean;
  distance?: number;
  scoreDelta?: number;
  bonusTags?: string[];
  timestamp: number;
}

export interface HitEvent {
  targetId: string;
  damage: number;
  headshot: boolean;
  position: Vec3;
}

export interface SpawnPoint {
  position: Vec3;
  rotation: Rotation;
}

// Axis-Aligned Bounding Box
export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface MapData {
  name: string;
  boxes: AABB[];
  spawnPoints: SpawnPoint[];
  bounds: AABB;
}

// Helper to create default player state
export function createDefaultPlayerState(
  id: string,
  nickname: string,
): PlayerState {
  return {
    id,
    nickname,
    position: { x: 0, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { yaw: 0, pitch: 0 },
    health: 100,
    armor: 0,
    alive: true,
    crouching: false,
    sprinting: false,
    sliding: false,
    aiming: false,
    slideTime: 0,
    grounded: false,
    weapon: WeaponType.ASSAULT_RIFLE,
    ammo: 30,
    maxAmmo: 30,
    reloading: false,
    reloadEndTime: 0,
    lastFireTime: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    streak: 0,
    spawnProtectionUntil: 0,
    ping: 0,
  };
}
