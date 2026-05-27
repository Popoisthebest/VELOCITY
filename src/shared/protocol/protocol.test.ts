import { describe, it, expect } from "vitest";
import { PacketType, encodePacket, decodePacket } from "./index.js";
import { WeaponType } from "../types/index.js";

describe("Network Protocol", () => {
  it("should encode and decode a JoinPacket correctly", () => {
    const packet = {
      type: PacketType.C_JOIN,
      nickname: "Player1",
      selectedWeapon: WeaponType.ASSAULT_RIFLE,
    };

    const encoded = encodePacket(packet as any);
    const decoded = decodePacket(encoded);

    expect(decoded.type).toBe(PacketType.C_JOIN);
    expect((decoded as any).nickname).toBe("Player1");
    expect((decoded as any).selectedWeapon).toBe(WeaponType.ASSAULT_RIFLE);
  });

  it("should encode and decode a PingPacket correctly", () => {
    const now = Date.now();
    const packet = {
      type: PacketType.C_PING,
      timestamp: now,
    };

    const encoded = encodePacket(packet as any);
    const decoded = decodePacket(encoded);

    expect(decoded.type).toBe(PacketType.C_PING);
    expect((decoded as any).timestamp).toBe(now);
  });

  it("should correctly handle numeric headers", () => {
    const packet = {
      type: PacketType.S_PONG,
      timestamp: 12345,
    };

    const encoded = encodePacket(packet as any);

    // First byte should be the PacketType ID
    expect(encoded[0]).toBe(PacketType.S_PONG);

    const decoded = decodePacket(encoded);
    expect(decoded.type).toBe(PacketType.S_PONG);
  });
});
