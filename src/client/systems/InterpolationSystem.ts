// ========================================
// Client-Side Remote Player Smoothing
// Dead reckoning + soft correction for remote players only
// ========================================

import type { PlayerState, Vec3 } from "@shared/types/index.js";
import {
  DEBUG_LOG_INTERVAL,
  REMOTE_CORRECTION_STRENGTH,
  REMOTE_DEFAULT_SNAPSHOT_DT_MS,
  REMOTE_MAX_EXTRAPOLATION_MS,
  REMOTE_MAX_SNAPSHOT_DT_MS,
  REMOTE_MIN_SNAPSHOT_DT_MS,
  REMOTE_SNAP_DISTANCE,
} from "@shared/constants/index.js";
import { useGameStore } from "../store/gameStore.js";

const HARD_SNAP_MULTIPLIER = 4;
const VELOCITY_EMA_ALPHA = 0.4;

interface RemoteRenderState {
  renderPosition: Vec3;
  targetPosition: Vec3;
  previousTargetPosition: Vec3;
  velocity: Vec3;
  smoothedVelocity: Vec3;
  lastSnapshotTime: number;
  lastSnapshotReceivedAt: number;
  lastUpdateTime: number;
  isExtrapolating: boolean;
  correctionError: number;
  latestState: PlayerState;
  snapshotCount: number;
  snapCount: number;
  lastDebugLogTime: number;
}

export class InterpolationSystem {
  private remoteStates = new Map<string, RemoteRenderState>();
  private extrapolationCount = 0;
  private snapCount = 0;
  private lastMetricsStoreUpdate = 0;
  private clockOffset = 0;
  private clockOffsetSamples: number[] = [];

  public updateClockOffset(
    serverTimestamp: number,
    clientSendTime: number,
    clientReceiveTime: number,
  ): void {
    const rtt = clientReceiveTime - clientSendTime;
    const estimatedServerNow = serverTimestamp + rtt / 2;
    const offset = estimatedServerNow - clientReceiveTime;

    this.clockOffsetSamples.push(offset);
    if (this.clockOffsetSamples.length > 10) {
      this.clockOffsetSamples.shift();
    }

    const sorted = [...this.clockOffsetSamples].sort((a, b) => a - b);
    this.clockOffset = sorted[Math.floor(sorted.length / 2)];
  }

  public addSnapshot(
    playerId: string,
    state: PlayerState,
    serverTimestamp: number,
  ): void {
    const now = Date.now();
    const localTimestamp = serverTimestamp - this.clockOffset;
    const serverPosition = copyVec3(state.position);
    const existing = this.remoteStates.get(playerId);

    if (!existing) {
      this.remoteStates.set(playerId, {
        renderPosition: copyVec3(serverPosition),
        targetPosition: copyVec3(serverPosition),
        previousTargetPosition: copyVec3(serverPosition),
        velocity: copyVec3(state.velocity),
        smoothedVelocity: copyVec3(state.velocity),
        lastSnapshotTime: localTimestamp,
        lastSnapshotReceivedAt: now,
        lastUpdateTime: now,
        isExtrapolating: false,
        correctionError: 0,
        latestState: clonePlayerState(state),
        snapshotCount: 1,
        snapCount: 0,
        lastDebugLogTime: 0,
      });
      return;
    }

    const wasRespawned = !existing.latestState.alive && state.alive;
    const previousTargetPosition = copyVec3(existing.targetPosition);
    const dtMs = sanitizeSnapshotDtMs(
      localTimestamp - existing.lastSnapshotTime,
    );
    const dtSeconds = dtMs / 1000;
    const estimatedVelocity = {
      x: (serverPosition.x - previousTargetPosition.x) / dtSeconds,
      y: (serverPosition.y - previousTargetPosition.y) / dtSeconds,
      z: (serverPosition.z - previousTargetPosition.z) / dtSeconds,
    };

    existing.smoothedVelocity = {
      x:
        existing.smoothedVelocity.x * (1 - VELOCITY_EMA_ALPHA) +
        estimatedVelocity.x * VELOCITY_EMA_ALPHA,
      y:
        existing.smoothedVelocity.y * (1 - VELOCITY_EMA_ALPHA) +
        estimatedVelocity.y * VELOCITY_EMA_ALPHA,
      z:
        existing.smoothedVelocity.z * (1 - VELOCITY_EMA_ALPHA) +
        estimatedVelocity.z * VELOCITY_EMA_ALPHA,
    };
    existing.previousTargetPosition = previousTargetPosition;
    existing.targetPosition = serverPosition;
    existing.velocity = copyVec3(existing.smoothedVelocity);
    existing.lastSnapshotTime = localTimestamp;
    existing.lastSnapshotReceivedAt = now;
    existing.latestState = clonePlayerState(state);
    existing.snapshotCount += 1;

    if (wasRespawned) {
      existing.renderPosition = copyVec3(serverPosition);
      existing.velocity = zeroVec3();
      existing.smoothedVelocity = zeroVec3();
      existing.isExtrapolating = false;
      existing.correctionError = 0;
      existing.snapCount += 1;
      this.snapCount += 1;
    }
  }

  public updatePlayer(playerId: string, deltaMs?: number): PlayerState | null {
    const remote = this.remoteStates.get(playerId);
    if (!remote) return null;

    const now = Date.now();
    const frameDeltaMs =
      deltaMs !== undefined
        ? clamp(deltaMs, 0, REMOTE_MAX_EXTRAPOLATION_MS)
        : clamp(now - remote.lastUpdateTime, 0, REMOTE_MAX_EXTRAPOLATION_MS);
    remote.lastUpdateTime = now;

    const ageMs = now - remote.lastSnapshotReceivedAt;
    const canExtrapolate = ageMs <= REMOTE_MAX_EXTRAPOLATION_MS;
    const dtSeconds = frameDeltaMs / 1000;
    const predicted = canExtrapolate
      ? addVec3(remote.renderPosition, scaleVec3(remote.velocity, dtSeconds))
      : copyVec3(remote.renderPosition);

    remote.correctionError = distanceVec3(predicted, remote.targetPosition);

    const hardSnapDistance = REMOTE_SNAP_DISTANCE * HARD_SNAP_MULTIPLIER;

    if (remote.correctionError >= hardSnapDistance) {
      remote.renderPosition = copyVec3(remote.targetPosition);
      remote.velocity = zeroVec3();
      remote.smoothedVelocity = zeroVec3();
      remote.isExtrapolating = false;
      remote.snapCount += 1;
      this.snapCount += 1;
      this.logRemoteSnap(playerId, remote);
      this.updateMetrics(playerId, remote, now);
      return this.buildRenderState(remote);
    }

    let correctionAlpha = Math.min(
      1,
      frameDeltaMs * REMOTE_CORRECTION_STRENGTH,
    );

    if (remote.correctionError >= REMOTE_SNAP_DISTANCE) {
      const urgency = Math.min(
        1,
        (remote.correctionError - REMOTE_SNAP_DISTANCE) /
          (hardSnapDistance - REMOTE_SNAP_DISTANCE),
      );
      correctionAlpha = Math.min(
        1,
        frameDeltaMs * REMOTE_CORRECTION_STRENGTH * (1 + urgency * 15),
      );
    }

    remote.renderPosition = lerpVec3(
      predicted,
      remote.targetPosition,
      correctionAlpha,
    );
    remote.isExtrapolating =
      canExtrapolate &&
      frameDeltaMs > 0 &&
      vectorMagnitude(remote.velocity) > 0.001 &&
      ageMs > REMOTE_DEFAULT_SNAPSHOT_DT_MS;

    if (remote.isExtrapolating) {
      this.extrapolationCount += 1;
    }

    if (!canExtrapolate) {
      remote.velocity = zeroVec3();
      remote.smoothedVelocity = zeroVec3();
    }

    this.logRemoteSmooth(playerId, remote);
    this.updateMetrics(playerId, remote, now);

    return this.buildRenderState(remote);
  }

  public removePlayer(playerId: string): void {
    this.remoteStates.delete(playerId);
  }

  public clear(): void {
    this.remoteStates.clear();
    this.extrapolationCount = 0;
    this.snapCount = 0;
    this.lastMetricsStoreUpdate = 0;
  }

  public getRenderedPlayerState(playerId: string): PlayerState | null {
    const remote = this.remoteStates.get(playerId);
    return remote ? this.buildRenderState(remote) : null;
  }

  private buildRenderState(remote: RemoteRenderState): PlayerState {
    return {
      ...remote.latestState,
      position: copyVec3(remote.renderPosition),
      velocity: copyVec3(remote.velocity),
      rotation: { ...remote.latestState.rotation },
    };
  }

  private updateMetrics(
    playerId: string,
    remote: RemoteRenderState,
    now: number,
  ): void {
    if (now - this.lastMetricsStoreUpdate < 250) return;

    this.lastMetricsStoreUpdate = now;
    useGameStore.getState().setInterpolationMetrics({
      trackedPlayers: this.remoteStates.size,
      extrapolationCount: this.extrapolationCount,
      snapCount: this.snapCount,
      lastPlayerId: playerId,
      correctionError: round2(remote.correctionError),
      velocityMagnitude: round2(vectorMagnitude(remote.velocity)),
      extrapolating: remote.isExtrapolating,
      updatedAt: now,
    });
  }

  private logRemoteSmooth(playerId: string, remote: RemoteRenderState): void {
    if (!isRemoteDebugEnabled()) return;

    const now = Date.now();
    if (now - remote.lastDebugLogTime < DEBUG_LOG_INTERVAL) return;

    remote.lastDebugLogTime = now;
    console.log(
      `[REMOTE SMOOTH] player=${playerId} buffer=state error=${round2(
        remote.correctionError,
      )} vel=${round2(vectorMagnitude(remote.velocity))} extrapolating=${
        remote.isExtrapolating
      }`,
    );
  }

  private logRemoteSnap(playerId: string, remote: RemoteRenderState): void {
    if (!isRemoteDebugEnabled()) return;

    const now = Date.now();
    if (now - remote.lastDebugLogTime < DEBUG_LOG_INTERVAL) return;

    remote.lastDebugLogTime = now;
    console.warn(
      `[REMOTE SNAP] player=${playerId} error=${round2(
        remote.correctionError,
      )} threshold=${REMOTE_SNAP_DISTANCE}`,
    );
  }
}

function sanitizeSnapshotDtMs(rawDtMs: number): number {
  if (
    !Number.isFinite(rawDtMs) ||
    rawDtMs < REMOTE_MIN_SNAPSHOT_DT_MS ||
    rawDtMs > REMOTE_MAX_SNAPSHOT_DT_MS
  ) {
    return REMOTE_DEFAULT_SNAPSHOT_DT_MS;
  }

  return rawDtMs;
}

function clonePlayerState(state: PlayerState): PlayerState {
  return {
    ...state,
    position: copyVec3(state.position),
    velocity: copyVec3(state.velocity),
    rotation: { ...state.rotation },
  };
}

function copyVec3(vec: Vec3): Vec3 {
  return { x: vec.x, y: vec.y, z: vec.z };
}

function zeroVec3(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec3(vec: Vec3, scale: number): Vec3 {
  return { x: vec.x * scale, y: vec.y * scale, z: vec.z * scale };
}

function lerpVec3(start: Vec3, end: Vec3, t: number): Vec3 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function distanceVec3(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    (a.x - b.x) * (a.x - b.x) +
      (a.y - b.y) * (a.y - b.y) +
      (a.z - b.z) * (a.z - b.z),
  );
}

function vectorMagnitude(vec: Vec3): number {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRemoteDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  return params.get("debugNet") === "1" || params.get("netdebug") === "1";
}

export const interpolationSystem = new InterpolationSystem();
