import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlayerState } from "@shared/types/index.js";
import type { PlayerState } from "@shared/types/index.js";
import { InterpolationSystem } from "./InterpolationSystem.js";

function createPlayerAt(id: string, x: number): PlayerState {
  return {
    ...createDefaultPlayerState(id, "remote"),
    position: { x, y: 1, z: 0 },
  };
}

describe("remote player dead reckoning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes render and target position from the first snapshot", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 4), 1000);

    expect(system.updatePlayer("p1", 16)?.position.x).toBe(4);
  });

  it("estimates velocity from snapshot delta and keeps moving between snapshots", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 0), 1000);
    vi.setSystemTime(50);
    system.addSnapshot("p1", createPlayerAt("p1", 1), 1050);

    const rendered = system.updatePlayer("p1", 25);

    expect(rendered?.position.x).toBeGreaterThan(0);
    expect(rendered?.position.x).toBeLessThan(1);
    expect(rendered?.velocity.x).toBeCloseTo(8);
  });

  it("uses client receive interval instead of server snapshot interval for velocity", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 0), 1000);
    vi.setSystemTime(200);
    system.addSnapshot("p1", createPlayerAt("p1", 1), 1033);

    const rendered = system.updatePlayer("p1", 25);

    expect(rendered?.velocity.x).toBeCloseTo(2);
  });

  it("uses fast lerp for large but plausible correction errors", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 0), 1000);
    system.addSnapshot("p1", createPlayerAt("p1", 10), 1050);

    const rendered = system.updatePlayer("p1", 16);

    expect(rendered?.position.x).toBeGreaterThan(0);
    expect(rendered?.position.x).toBeLessThan(10);
    expect(rendered?.velocity.x).toBeGreaterThan(0);
  });

  it("hard snaps only on extreme correction errors", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 0), 1000);
    system.addSnapshot("p1", createPlayerAt("p1", 40), 1050);

    const rendered = system.updatePlayer("p1", 16);

    expect(rendered?.position.x).toBe(40);
    expect(rendered?.velocity.x).toBe(0);
  });

  it("stops extrapolating after stale snapshots", () => {
    const system = new InterpolationSystem();

    system.addSnapshot("p1", createPlayerAt("p1", 0), 1000);
    system.addSnapshot("p1", createPlayerAt("p1", 1), 1050);
    vi.setSystemTime(600);

    const rendered = system.updatePlayer("p1", 50);

    expect(rendered?.velocity.x).toBe(0);
    expect(rendered?.position.x).toBeGreaterThan(0);
    expect(rendered?.position.x).toBeLessThan(1);
  });

  it("accepts server clock offset updates before snapshot timing", () => {
    const system = new InterpolationSystem();

    system.updateClockOffset(1100, 50, 150);
    system.addSnapshot("p1", createPlayerAt("p1", 0), 2000);
    system.addSnapshot("p1", createPlayerAt("p1", 1), 2050);

    expect(system.updatePlayer("p1", 25)?.position.x).toBeGreaterThan(0);
  });
});
