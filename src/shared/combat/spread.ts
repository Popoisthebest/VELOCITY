import type { Vec3 } from "../types/index.js";
import type { WeaponConfig } from "../constants/index.js";
import { vec3Normalize } from "../physics/movement.js";

const UINT32_MAX_PLUS_ONE = 4294967296;

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };
}

export function createShotSeed(now = Date.now()): number {
  return (
    ((now & 0xfffffff) ^ Math.floor(Math.random() * UINT32_MAX_PLUS_ONE)) >>> 0
  );
}

export function calculateEffectiveSpread(
  weaponConfig: WeaponConfig,
  velocity?: Vec3,
  crouching = false,
): number {
  if (!velocity) return weaponConfig.spread;

  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  const movementScale =
    1 + Math.min(horizontalSpeed * weaponConfig.movementPenalty, 0.65);
  const postureScale = crouching ? 0.6 : 1;
  return weaponConfig.spread * movementScale * postureScale;
}

function applySpread(
  direction: Vec3,
  spread: number,
  random: () => number,
): Vec3 {
  if (spread <= 0.0001) return { ...direction };

  const angle = random() * Math.PI * 2;
  const radius = random() * spread;

  let up: Vec3 = { x: 0, y: 1, z: 0 };
  if (Math.abs(direction.y) > 0.9) {
    up = { x: 1, y: 0, z: 0 };
  }

  const right: Vec3 = {
    x: direction.y * up.z - direction.z * up.y,
    y: direction.z * up.x - direction.x * up.z,
    z: direction.x * up.y - direction.y * up.x,
  };
  const rightLen = Math.hypot(right.x, right.y, right.z);
  if (rightLen < 0.0001) return { ...direction };

  right.x /= rightLen;
  right.y /= rightLen;
  right.z /= rightLen;

  const actualUp: Vec3 = {
    x: right.y * direction.z - right.z * direction.y,
    y: right.z * direction.x - right.x * direction.z,
    z: right.x * direction.y - right.y * direction.x,
  };

  const offset: Vec3 = {
    x:
      right.x * Math.cos(angle) * radius +
      actualUp.x * Math.sin(angle) * radius,
    y:
      right.y * Math.cos(angle) * radius +
      actualUp.y * Math.sin(angle) * radius,
    z:
      right.z * Math.cos(angle) * radius +
      actualUp.z * Math.sin(angle) * radius,
  };

  return vec3Normalize({
    x: direction.x + offset.x,
    y: direction.y + offset.y,
    z: direction.z + offset.z,
  });
}

export function getShotDirections(
  direction: Vec3,
  weaponConfig: WeaponConfig,
  spreadSeed: number,
  velocity?: Vec3,
  crouching = false,
): Vec3[] {
  const baseDirection = vec3Normalize(direction);
  const pelletCount = Math.max(1, weaponConfig.pellets || 1);
  const spread = calculateEffectiveSpread(weaponConfig, velocity, crouching);
  const random = createSeededRandom(spreadSeed);

  return Array.from({ length: pelletCount }, () =>
    applySpread(baseDirection, spread, random),
  );
}
