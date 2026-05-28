// ========================================
// Client-Side Remote Player Interpolation
// Buffers server updates and interpolates positions/rotations
// ========================================

import type { PlayerState, Vec3 } from "@shared/types/index.js";
import {
  INTERPOLATION_DELAY,
  MAX_EXTRAPOLATION_TIME,
} from "@shared/constants/index.js";

interface Snapshot {
  timestamp: number;
  state: PlayerState;
}

export class InterpolationSystem {
  private buffers = new Map<string, Snapshot[]>();
  private readonly maxBufferSize = 10; // keep a bit more than 3 for safety during network jitter
  private serverTimeOffset: number | null = null;
  private lastOffsetSampleTimestamp = 0;

  public getRenderTime(now = Date.now()): number {
    const serverNow =
      this.serverTimeOffset === null ? now : now - this.serverTimeOffset;
    return serverNow - INTERPOLATION_DELAY;
  }

  public addSnapshot(
    playerId: string,
    state: PlayerState,
    timestamp: number,
  ): void {
    this.updateServerTimeOffset(timestamp);

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

    // If renderTime is newer than our newest snapshot, extrapolate briefly.
    if (renderTime > buffer[buffer.length - 1].timestamp) {
      return this.extrapolate(buffer[buffer.length - 1], renderTime);
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
    interpolated.aiming = right.state.aiming;
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

  private updateServerTimeOffset(serverTimestamp: number): void {
    if (serverTimestamp <= this.lastOffsetSampleTimestamp) return;

    this.lastOffsetSampleTimestamp = serverTimestamp;
    const offsetSample = Date.now() - serverTimestamp;
    this.serverTimeOffset =
      this.serverTimeOffset === null
        ? offsetSample
        : this.serverTimeOffset * 0.9 + offsetSample * 0.1;
  }

  private extrapolate(snapshot: Snapshot, renderTime: number): PlayerState {
    const dt =
      Math.min(
        Math.max(renderTime - snapshot.timestamp, 0),
        MAX_EXTRAPOLATION_TIME,
      ) / 1000;

    return {
      ...snapshot.state,
      position: {
        x: snapshot.state.position.x + snapshot.state.velocity.x * dt,
        y: snapshot.state.position.y + snapshot.state.velocity.y * dt,
        z: snapshot.state.position.z + snapshot.state.velocity.z * dt,
      },
      velocity: { ...snapshot.state.velocity },
      rotation: { ...snapshot.state.rotation },
    };
  }

  public clear(): void {
    this.buffers.clear();
    this.serverTimeOffset = null;
    this.lastOffsetSampleTimestamp = 0;
  }
}
export const interpolationSystem = new InterpolationSystem();
