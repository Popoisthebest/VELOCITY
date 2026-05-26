// ========================================
// Client-Side Input Prediction & Reconciliation
// Rewinds state to server snapshot and replays inputs
// ========================================

import type {
  PlayerState,
  InputState,
  Vec3,
  AABB,
} from "@shared/types/index.js";
import { processMovement } from "@shared/physics/movement.js";
import { resolveCollisions } from "@shared/physics/collision.js";
import {
  MAX_PREDICTION_ERROR,
  PREDICTION_CORRECTION_RATE,
} from "@shared/constants/index.js";

interface HistoryEntry {
  input: InputState;
  sequence: number;
}

export class PredictionSystem {
  private inputHistory: HistoryEntry[] = [];
  private readonly maxHistory = 128;

  public addInput(input: InputState): void {
    this.inputHistory.push({ input, sequence: input.sequence });

    // Trim history
    if (this.inputHistory.length > this.maxHistory) {
      this.inputHistory.shift();
    }
  }

  /**
   * Reconciles local player state with server state
   * Returns corrected position and velocity
   */
  public reconcile(
    localState: PlayerState,
    serverState: PlayerState,
    lastProcessedSequence: number,
    mapBoxes: AABB[],
  ): { position: Vec3; velocity: Vec3; grounded: boolean } {
    // 1. Find the server acknowledged input in history
    const ackIndex = this.inputHistory.findIndex(
      (entry) => entry.sequence === lastProcessedSequence,
    );

    if (ackIndex === -1) {
      // Server sequence not found in history, possibly too old or dropped.
      // Force snap to server state as a fallback
      return {
        position: { ...serverState.position },
        velocity: { ...serverState.velocity },
        grounded: serverState.grounded,
      };
    }

    // 2. Remove all inputs up to and including the acknowledged sequence
    this.inputHistory.splice(0, ackIndex + 1);

    // 3. Start simulation from server authoritative state
    let tempPos = { ...serverState.position };
    let tempVel = { ...serverState.velocity };
    let tempGrounded = serverState.grounded;

    // 4. Replay all remaining inputs in history (unacknowledged inputs)
    let tempSlideTime = serverState.slideTime || 0;

    for (const entry of this.inputHistory) {
      const dt = entry.input.deltaTime;

      const moveResult = processMovement(
        tempPos,
        tempVel,
        tempGrounded,
        tempSlideTime,
        entry.input,
        dt,
      );
      const collResult = resolveCollisions(
        moveResult.position,
        moveResult.velocity,
        moveResult.crouching,
        mapBoxes,
      );

      tempPos = collResult.position;
      tempVel = collResult.velocity;
      tempGrounded = collResult.grounded;
      tempSlideTime = moveResult.slideTime;
    }

    // 5. Compare predicted position with actual local position
    const errorX = tempPos.x - localState.position.x;
    const errorY = tempPos.y - localState.position.y;
    const errorZ = tempPos.z - localState.position.z;
    const errorSq = errorX * errorX + errorY * errorY + errorZ * errorZ;

    // If the error is tiny, ignore it to prevent micro-stutters and keep movement perfectly smooth
    if (errorSq < 0.002) {
      return {
        position: { ...localState.position },
        velocity: tempVel,
        grounded: tempGrounded,
      };
    }

    let finalPos = { ...localState.position };

    if (errorSq > MAX_PREDICTION_ERROR * MAX_PREDICTION_ERROR) {
      // Prediction error is too large, snap to corrected position immediately
      console.warn(
        `[PredictionSystem] Large prediction drift. Snapping. Error: ${Math.sqrt(errorSq).toFixed(2)}m`,
      );
      finalPos = tempPos;
    } else {
      // Smoothly blend local position towards predicted position
      finalPos.x =
        localState.position.x +
        (tempPos.x - localState.position.x) * PREDICTION_CORRECTION_RATE;
      finalPos.y =
        localState.position.y +
        (tempPos.y - localState.position.y) * PREDICTION_CORRECTION_RATE;
      finalPos.z =
        localState.position.z +
        (tempPos.z - localState.position.z) * PREDICTION_CORRECTION_RATE;
    }

    return {
      position: finalPos,
      velocity: tempVel, // keep the replayed velocity
      grounded: tempGrounded,
    };
  }

  public clear(): void {
    this.inputHistory = [];
  }
}
export const predictionSystem = new PredictionSystem();
