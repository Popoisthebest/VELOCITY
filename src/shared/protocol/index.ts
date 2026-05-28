// ========================================
// Network Protocol — Binary Packet Schema
// Strongly-typed packets for client ↔ server communication
// Custom binary serialization for low-latency performance
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

// ── Packet Type Enum (Numeric for Binary) ────────────────

export enum PacketType {
  // Client → Server
  C_JOIN = 1,
  C_INPUT = 2,
  C_SHOOT = 3,
  C_RELOAD = 4,
  C_PING = 5,

  // Server → Client
  S_JOIN_ACK = 10,
  S_PLAYER_JOINED = 11,
  S_PONG = 12,
  S_PLAYER_LEFT = 13,
  S_SNAPSHOT = 14,
  S_HIT_CONFIRM = 15,
  S_KILL = 16,
  S_DEATH = 17,
  S_SPAWN = 18,
  S_GAME_PHASE = 19,
  S_ROOM_LIST = 20,
  S_ERROR = 21,
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
  shotId: number;
  spreadSeed: number;
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

// ── Binary Serialization (Using JSON-in-Binary for complex nested types for now,
//    but with numeric header to reduce parsing overhead for main loops) ──────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodePacket(packet: Packet): Uint8Array {
  // Use a hybrid approach for MVP binary:
  // [1 byte: TypeID] [JSON payload as UTF-8]
  // This avoids full custom bit-packing for 20+ types while still giving
  // the benefit of numeric routing and binary transport.

  const jsonStr = JSON.stringify(packet);
  const jsonBytes = textEncoder.encode(jsonStr);

  const result = new Uint8Array(1 + jsonBytes.length);
  result[0] = packet.type;
  result.set(jsonBytes, 1);

  return result;
}

export function decodePacket(data: ArrayBuffer | Uint8Array | string): Packet {
  let bytes: Uint8Array;

  if (typeof data === "string") {
    // Fallback for legacy JSON strings
    return JSON.parse(data) as Packet;
  }

  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  const type = bytes[0] as PacketType;
  const jsonBytes = bytes.subarray(1);
  const jsonStr = textDecoder.decode(jsonBytes);

  try {
    const packet = JSON.parse(jsonStr) as Packet;
    packet.type = type; // Ensure type is correct numeric
    return packet;
  } catch (e) {
    console.error("Failed to decode packet:", e);
    throw e;
  }
}
