import { describe, it, expect } from "vitest";
import { PacketType, encodePacket, decodePacket } from "./index.js";
import type {
  DebugStatsPacket,
  JoinPacket,
  PingPacket,
  PongPacket,
  RoomListRequestPacket,
  ShootPacket,
} from "./index.js";
import { WeaponType } from "../types/index.js";

describe("Network Protocol", () => {
  it("should encode and decode a JoinPacket correctly", () => {
    const packet: JoinPacket = {
      type: PacketType.C_JOIN,
      nickname: "Player1",
      createNewRoom: true,
      selectedWeapon: WeaponType.ASSAULT_RIFLE,
    };

    const encoded = encodePacket(packet);
    const decoded = decodePacket(encoded);

    expect(decoded.type).toBe(PacketType.C_JOIN);
    if (decoded.type !== PacketType.C_JOIN) {
      throw new Error("Expected join packet");
    }
    expect(decoded.nickname).toBe("Player1");
    expect(decoded.createNewRoom).toBe(true);
    expect(decoded.selectedWeapon).toBe(WeaponType.ASSAULT_RIFLE);
  });

  it("should encode and decode a room list request", () => {
    const packet: RoomListRequestPacket = {
      type: PacketType.C_ROOM_LIST,
    };

    const decoded = decodePacket(encodePacket(packet));
    expect(decoded.type).toBe(PacketType.C_ROOM_LIST);
  });

  it("should encode and decode a PingPacket correctly", () => {
    const now = Date.now();
    const packet: PingPacket = {
      type: PacketType.C_PING,
      timestamp: now,
    };

    const encoded = encodePacket(packet);
    const decoded = decodePacket(encoded);

    expect(decoded.type).toBe(PacketType.C_PING);
    if (decoded.type !== PacketType.C_PING) {
      throw new Error("Expected ping packet");
    }
    expect(decoded.timestamp).toBe(now);
  });

  it("should encode and decode synced shot metadata", () => {
    const packet: ShootPacket = {
      type: PacketType.C_SHOOT,
      origin: { x: 1, y: 2, z: 3 },
      direction: { x: 0, y: 0, z: -1 },
      shotId: 7,
      spreadSeed: 123456,
      timestamp: 1000,
    };

    const decoded = decodePacket(encodePacket(packet));
    expect(decoded.type).toBe(PacketType.C_SHOOT);
    if (decoded.type !== PacketType.C_SHOOT) {
      throw new Error("Expected shoot packet");
    }
    expect(decoded.shotId).toBe(7);
    expect(decoded.spreadSeed).toBe(123456);
  });

  it("should correctly handle numeric headers", () => {
    const packet: PongPacket = {
      type: PacketType.S_PONG,
      timestamp: 12345,
      serverTime: 67890,
    };

    const encoded = encodePacket(packet);

    // First byte should be the PacketType ID
    expect(encoded[0]).toBe(PacketType.S_PONG);

    const decoded = decodePacket(encoded);
    expect(decoded.type).toBe(PacketType.S_PONG);
    if (decoded.type !== PacketType.S_PONG) {
      throw new Error("Expected pong packet");
    }
    expect(decoded.serverTime).toBe(67890);
  });

  it("should encode and decode debug stats", () => {
    const packet: DebugStatsPacket = {
      type: PacketType.S_DEBUG_STATS,
      roomId: "room-1",
      timestamp: 1000,
      tick: { interval: 17, avg: 17, max: 30, drift: 1 },
      snapshot: { interval: 33, avg: 35, max: 120, drift: 2 },
    };

    const decoded = decodePacket(encodePacket(packet));
    expect(decoded.type).toBe(PacketType.S_DEBUG_STATS);
    if (decoded.type !== PacketType.S_DEBUG_STATS) {
      throw new Error("Expected debug stats packet");
    }
    expect(decoded.tick.max).toBe(30);
    expect(decoded.snapshot.max).toBe(120);
  });
});
