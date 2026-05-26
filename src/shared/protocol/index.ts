// ========================================
// Network Protocol — Packet Schema
// Strongly-typed packets for client ↔ server communication
// JSON serialization for MVP (upgrade to binary in Phase 6)
// ========================================

import type {
  InputState,
  PlayerState,
  GamePhase,
  Vec3,
  KillEvent,
  HitEvent,
  RoomInfo,
  MapData,
  Rotation,
  WeaponType,
} from "../types/index.js";

// ── Packet Type Enum ──────────────────────────────────────

export enum PacketType {
  // Client → Server
  C_JOIN = "c_join",
  C_INPUT = "c_input",
  C_SHOOT = "c_shoot",
  C_RELOAD = "c_reload",
  C_PING = "c_ping",

  // Server → Client
  S_JOIN_ACK = "s_join_ack",
  S_PLAYER_JOINED = "s_player_joined",
  S_PONG = "s_pong",
  S_PLAYER_LEFT = "s_player_left",
  S_SNAPSHOT = "s_snapshot",
  S_HIT_CONFIRM = "s_hit_confirm",
  S_KILL = "s_kill",
  S_DEATH = "s_death",
  S_SPAWN = "s_spawn",
  S_GAME_PHASE = "s_game_phase",
  S_ROOM_LIST = "s_room_list",
  S_ERROR = "s_error",
}

// ── Client → Server Packets ──────────────────────────────

export interface JoinPacket {
  type: PacketType.C_JOIN;
  nickname: string;
  roomId?: string;
  selectedWeapon?: WeaponType;
}

export interface InputPacket {
  type: PacketType.C_INPUT;
  input: InputState;
}

export interface ShootPacket {
  type: PacketType.C_SHOOT;
  origin: Vec3;
  direction: Vec3;
  timestamp: number;
}

export interface ReloadPacket {
  type: PacketType.C_RELOAD;
}
export interface PingPacket {
  type: PacketType.C_PING;
  timestamp: number;
}
// ── Server → Client Packets ──────────────────────────────

export interface JoinAckPacket {
  type: PacketType.S_JOIN_ACK;
  playerId: string;
  roomId: string;
  map: MapData;
  state: {
    players: Record<string, PlayerState>;
    phase: GamePhase;
    timeRemaining: number;
    killLimit: number;
  };
}

export interface PlayerJoinedPacket {
  type: PacketType.S_PLAYER_JOINED;
  player: PlayerState;
}

export interface PlayerLeftPacket {
  type: PacketType.S_PLAYER_LEFT;
  playerId: string;
}

export interface SnapshotPacket {
  type: PacketType.S_SNAPSHOT;
  tick: number;
  timestamp: number;
  players: Record<string, PlayerState>;
  lastProcessedInput: Record<string, number>;
  match: {
    phase: GamePhase;
    timeRemaining: number;
    killLimit: number;
  };
}

export interface HitConfirmPacket {
  type: PacketType.S_HIT_CONFIRM;
  hit: HitEvent;
}

export interface KillPacket {
  type: PacketType.S_KILL;
  kill: KillEvent;
}

export interface DeathPacket {
  type: PacketType.S_DEATH;
  killerId: string;
  respawnTime: number;
}

export interface SpawnPacket {
  type: PacketType.S_SPAWN;
  position: Vec3;
  rotation: Rotation;
}

export interface GamePhasePacket {
  type: PacketType.S_GAME_PHASE;
  phase: GamePhase;
  timeRemaining: number;
  winner?: { id: string; nickname: string; kills: number };
}

export interface RoomListPacket {
  type: PacketType.S_ROOM_LIST;
  rooms: RoomInfo[];
}

export interface PongPacket {
  type: PacketType.S_PONG;
  timestamp: number;
}

export interface ErrorPacket {
  type: PacketType.S_ERROR;
  message: string;
}

// ── Union Types ──────────────────────────────────────────

export type ClientPacket =
  | JoinPacket
  | InputPacket
  | ShootPacket
  | ReloadPacket
  | PingPacket;
export type ServerPacket =
  | JoinAckPacket
  | PlayerJoinedPacket
  | PlayerLeftPacket
  | SnapshotPacket
  | HitConfirmPacket
  | KillPacket
  | DeathPacket
  | SpawnPacket
  | GamePhasePacket
  | RoomListPacket
  | PongPacket
  | ErrorPacket;

export type Packet = ClientPacket | ServerPacket;

// ── Serialization ────────────────────────────────────────

export function encodePacket(packet: Packet): string {
  return JSON.stringify(packet);
}

export function decodePacket(data: string): Packet {
  return JSON.parse(data) as Packet;
}
