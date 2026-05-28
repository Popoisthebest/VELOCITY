// ========================================
// Shared Movement Physics
// Quake/Source-inspired acceleration model
// Used by BOTH client (prediction) and server (authority)
// ========================================

import type { Vec3, InputState } from "../types/index.js";
import {
  WALK_SPEED,
  SPRINT_SPEED,
  CROUCH_SPEED,
  SLIDE_SPEED,
  SLIDE_DURATION,
  SLIDE_JUMP_RETENTION,
  JUMP_FORCE,
  GRAVITY,
  FRICTION,
  SLIDE_FRICTION,
  AIR_CONTROL,
  GROUND_ACCELERATION,
  AIR_ACCELERATION,
  MAX_SPEED,
} from "../constants/index.js";

// ── Vec3 Helpers ─────────────────────────────────────────

export function vec3Zero(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vec3LengthXZ(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 0.0001) return vec3Zero();
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3DotXZ(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.z * b.z;
}

export function vec3Copy(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Movement Result ──────────────────────────────────────

export interface MovementResult {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  slideTime: number;
}

// ── Wish Direction ───────────────────────────────────────

/**
 * Calculate the desired movement direction from input + camera yaw.
 * Returns a normalized XZ-plane direction vector.
 */
export function getWishDirection(input: InputState): Vec3 {
  let fx = 0;
  let fz = 0;

  // Forward is -Z in Three.js
  if (input.forward) fz -= 1;
  if (input.backward) fz += 1;
  if (input.left) fx -= 1;
  if (input.right) fx += 1;

  if (fx === 0 && fz === 0) return vec3Zero();

  // Rotate by yaw
  const sinYaw = Math.sin(input.yaw);
  const cosYaw = Math.cos(input.yaw);

  const dir: Vec3 = {
    x: fx * cosYaw + fz * sinYaw,
    y: 0,
    z: -fx * sinYaw + fz * cosYaw,
  };

  const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
  if (len > 0.0001) {
    dir.x /= len;
    dir.z /= len;
  }

  return dir;
}

// ── Core Movement Step ───────────────────────────────────

/**
 * Process one tick of movement physics.
 * This is the authoritative movement function — deterministic given same inputs.
 */
export function processMovement(
  position: Vec3,
  velocity: Vec3,
  grounded: boolean,
  slideTime: number,
  input: InputState,
  dt: number,
): MovementResult {
  const crouching = input.crouch;
  const sprinting = input.sprint && !crouching;
  const sliding = grounded && input.sprint && input.crouch;

  // Update slide timer while activating slide and while grounded
  if (sliding) {
    slideTime = Math.min(slideTime + dt, SLIDE_DURATION);
  } else {
    slideTime = 0;
  }

  const isSliding = slideTime > 0;
  const wishDir = getWishDirection(input);
  const hasWishDir =
    Math.abs(wishDir.x) > 0.0001 || Math.abs(wishDir.z) > 0.0001;

  let targetSpeed = WALK_SPEED;
  if (isSliding) targetSpeed = SLIDE_SPEED;
  else if (sprinting) targetSpeed = SPRINT_SPEED;
  else if (crouching) targetSpeed = CROUCH_SPEED;

  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;

  if (grounded) {
    // Ground friction
    const speed = Math.sqrt(vx * vx + vz * vz);
    const friction = isSliding ? SLIDE_FRICTION : FRICTION;
    if (speed > 0.01) {
      const drop = speed * friction * dt;
      const scale = Math.max(speed - drop, 0) / speed;
      vx *= scale;
      vz *= scale;
    } else {
      vx = 0;
      vz = 0;
    }

    // Accelerate toward desired move direction
    if (hasWishDir) {
      const currentSpeed = vx * wishDir.x + vz * wishDir.z;
      const addSpeed = targetSpeed - currentSpeed;
      if (addSpeed > 0) {
        const accel = isSliding
          ? GROUND_ACCELERATION * 1.2
          : GROUND_ACCELERATION;
        const accelSpeed = Math.min(accel * dt * targetSpeed, addSpeed);
        vx += wishDir.x * accelSpeed;
        vz += wishDir.z * accelSpeed;
      }
    }

    if (input.jump) {
      vy = JUMP_FORCE;
      grounded = false;

      if (isSliding) {
        vx *= SLIDE_JUMP_RETENTION;
        vz *= SLIDE_JUMP_RETENTION;
      }
    }
  } else {
    // Air control
    if (hasWishDir) {
      const airSpeed = Math.max(targetSpeed, WALK_SPEED) * AIR_CONTROL;
      const currentSpeed = vx * wishDir.x + vz * wishDir.z;
      const addSpeed = airSpeed - currentSpeed;
      if (addSpeed > 0) {
        const accelSpeed = Math.min(AIR_ACCELERATION * dt * airSpeed, addSpeed);
        vx += wishDir.x * accelSpeed;
        vz += wishDir.z * accelSpeed;
      }
    }
  }

  // Apply gravity
  vy += GRAVITY * dt;

  // Cap horizontal velocity
  const hSpeed = Math.sqrt(vx * vx + vz * vz);
  if (hSpeed > MAX_SPEED) {
    const scale = MAX_SPEED / hSpeed;
    vx *= scale;
    vz *= scale;
  }

  const newPos: Vec3 = {
    x: position.x + vx * dt,
    y: position.y + vy * dt,
    z: position.z + vz * dt,
  };

  return {
    position: newPos,
    velocity: { x: vx, y: vy, z: vz },
    grounded,
    crouching,
    sprinting,
    sliding: isSliding,
    slideTime,
  };
}
