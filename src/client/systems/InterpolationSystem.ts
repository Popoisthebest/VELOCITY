// ========================================
// Client-Side Remote Player Interpolation
// Buffers server updates and interpolates positions/rotations
// ========================================

import type { PlayerState, Vec3 } from "@shared/types/index.js";
import { INTERPOLATION_DELAY } from "@shared/constants/index.js";

interface Snapshot {
  timestamp: number;
  state: PlayerState;
}

export class InterpolationSystem {
  private buffers = new Map<string, Snapshot[]>();
  private readonly maxBufferSize = 10; // keep a bit more than 3 for safety during network jitter

  public addSnapshot(
    playerId: string,
    state: PlayerState,
    timestamp: number,
  ): void {
    if (!this.buffers.has(playerId)) {
      this.buffers.set(playerId, []);
    }

    const buffer = this.buffers.get(playerId)!;
    buffer.push({ timestamp, state });

    // Sort by timestamp
    buffer.sort((a, b) => a.timestamp - b.timestamp);

    // Limit buffer size
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  public removePlayer(playerId: string): void {
    this.buffers.delete(playerId);
  }

  public getInterpolatedState(
    playerId: string,
    renderTime: number,
  ): PlayerState | null {
    const buffer = this.buffers.get(playerId);
    if (!buffer || buffer.length === 0) return null;

    // Use latest if only one snapshot
    if (buffer.length === 1) {
      return buffer[0].state;
    }

    // If renderTime is older than our oldest snapshot, snap to oldest
    if (renderTime < buffer[0].timestamp) {
      return buffer[0].state;
    }

    // If renderTime is newer than our newest snapshot, snap to newest (or extrapolate)
    if (renderTime > buffer[buffer.length - 1].timestamp) {
      return buffer[buffer.length - 1].state;
    }

    // Find the two snapshots bracketing renderTime
    let targetIndex = -1;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (
        renderTime >= buffer[i].timestamp &&
        renderTime <= buffer[i + 1].timestamp
      ) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      // Fallback
      return buffer[buffer.length - 1].state;
    }

    const left = buffer[targetIndex];
    const right = buffer[targetIndex + 1];

    // Calculate interpolation factor
    const total = right.timestamp - left.timestamp;
    const factor = total > 0 ? (renderTime - left.timestamp) / total : 0;

    // Deep clone state to modify
    const interpolated = { ...right.state };

    // Lerp position
    interpolated.position = this.lerpVec3(
      left.state.position,
      right.state.position,
      factor,
    );

    // Lerp velocity
    interpolated.velocity = this.lerpVec3(
      left.state.velocity,
      right.state.velocity,
      factor,
    );

    // Lerp rotation (yaw / pitch)
    interpolated.rotation = {
      yaw: this.lerpAngle(
        left.state.rotation.yaw,
        right.state.rotation.yaw,
        factor,
      ),
      pitch: this.lerpAngle(
        left.state.rotation.pitch,
        right.state.rotation.pitch,
        factor,
      ),
    };

    // Keep discrete values from the right (newest) frame
    interpolated.alive = right.state.alive;
    interpolated.crouching = right.state.crouching;
    interpolated.sprinting = right.state.sprinting;
    interpolated.grounded = right.state.grounded;
    interpolated.weapon = right.state.weapon;
    interpolated.ammo = right.state.ammo;
    interpolated.maxAmmo = right.state.maxAmmo;
    interpolated.reloading = right.state.reloading;
    interpolated.health = right.state.health;
    interpolated.armor = right.state.armor;
    interpolated.kills = right.state.kills;
    interpolated.deaths = right.state.deaths;

    return interpolated;
  }

  private lerpVec3(start: Vec3, end: Vec3, t: number): Vec3 {
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t,
    };
  }

  private lerpAngle(start: number, end: number, t: number): number {
    let diff = end - start;
    // Wrap to [-PI, PI]
    const pi = Math.PI;
    const twoPi = pi * 2;
    diff = ((((diff + pi) % twoPi) + twoPi) % twoPi) - pi;
    return start + diff * t;
  }

  public clear(): void {
    this.buffers.clear();
  }
}
export const interpolationSystem = new InterpolationSystem();
