// ========================================
// Combat System — Server-Side Hit Validation
// Stateless utility functions for shot verification
// ========================================

import type { Vec3, AABB, PlayerState } from '../../shared/types/index.js';
import type { WeaponConfig } from '../../shared/constants/index.js';
import { raycastPlayer, raycastMap } from '../../shared/physics/collision.js';
import { vec3Distance, vec3Normalize } from '../../shared/physics/movement.js';
import { HEADSHOT_MULTIPLIER, PLAYER_EYE_OFFSET, PLAYER_HEIGHT } from '../../shared/constants/index.js';
import type { PlayerEntity } from './PlayerEntity.js';

export interface HitResult {
  targetId: string;
  damage: number;
  headshot: boolean;
  hitPosition: Vec3;
}

/**
 * Calculate damage with distance falloff.
 */
export function calculateDamage(
  baseDamage: number,
  distance: number,
  weaponConfig: WeaponConfig,
  headshot: boolean,
): number {
  let damage = baseDamage;

  // Distance falloff
  if (distance > weaponConfig.falloffStart) {
    if (distance >= weaponConfig.falloffEnd) {
      damage = weaponConfig.minDamage;
    } else {
      const t = (distance - weaponConfig.falloffStart) / (weaponConfig.falloffEnd - weaponConfig.falloffStart);
      damage = baseDamage + (weaponConfig.minDamage - baseDamage) * t;
    }
  }

  // Headshot multiplier
  if (headshot) {
    damage *= HEADSHOT_MULTIPLIER;
  }

  return Math.round(damage);
}

/**
 * Generate a spread direction from a base direction.
 */
function applySpread(direction: Vec3, spread: number): Vec3 {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * spread;

  // Create perpendicular vectors
  let upX = 0, upY = 1, upZ = 0;
  if (Math.abs(direction.y) > 0.9) {
    upX = 1; upY = 0; upZ = 0;
  }

  // Cross product: direction × up = right
  const rightX = direction.y * upZ - direction.z * upY;
  const rightY = direction.z * upX - direction.x * upZ;
  const rightZ = direction.x * upY - direction.y * upX;
  const rLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);

  // Cross product: right × direction = actualUp
  const aUpX = (rightY / rLen) * direction.z - (rightZ / rLen) * direction.y;
  const aUpY = (rightZ / rLen) * direction.x - (rightX / rLen) * direction.z;
  const aUpZ = (rightX / rLen) * direction.y - (rightY / rLen) * direction.x;

  const offsetX = (rightX / rLen) * Math.cos(angle) * radius + aUpX * Math.sin(angle) * radius;
  const offsetY = (rightY / rLen) * Math.cos(angle) * radius + aUpY * Math.sin(angle) * radius;
  const offsetZ = (rightZ / rLen) * Math.cos(angle) * radius + aUpZ * Math.sin(angle) * radius;

  return vec3Normalize({
    x: direction.x + offsetX,
    y: direction.y + offsetY,
    z: direction.z + offsetZ,
  });
}

/**
 * Validate a shot from shooter against all players.
 * Server-authoritative hit detection.
 */
export function validateShot(
  origin: Vec3,
  direction: Vec3,
  shooterId: string,
  players: Map<string, PlayerEntity>,
  mapBoxes: AABB[],
  weaponConfig: WeaponConfig,
): HitResult[] {
  const shooter = players.get(shooterId);
  if (!shooter) return [];

  // Anti-cheat: verify origin is near shooter's actual eye position
  const eyePos: Vec3 = {
    x: shooter.state.position.x,
    y: shooter.state.position.y + (PLAYER_HEIGHT / 2) + PLAYER_EYE_OFFSET,
    z: shooter.state.position.z,
  };

  const originDist = vec3Distance(origin, eyePos);
  if (originDist > 3.0) {
    // Origin too far from server-known position — reject
    return [];
  }

  // Use server-authoritative origin
  const authOrigin = eyePos;
  const hits: HitResult[] = [];

  // Determine number of rays (pellets for shotgun)
  const pelletCount = weaponConfig.pellets || 1;

  for (let p = 0; p < pelletCount; p++) {
    // Apply spread
    const spreadDir = pelletCount > 1 || weaponConfig.spread > 0
      ? applySpread(direction, weaponConfig.spread)
      : direction;

    // Check wall hit distance first
    const wallHit = raycastMap(authOrigin, spreadDir, mapBoxes, weaponConfig.range);
    const maxDist = wallHit ? wallHit.distance : weaponConfig.range;

    // Check all alive players
    let closestHit: { targetId: string; distance: number; point: Vec3; headshot: boolean } | null = null;

    for (const [playerId, entity] of players) {
      if (playerId === shooterId) continue;
      if (!entity.state.alive) continue;

      const hit = raycastPlayer(
        authOrigin,
        spreadDir,
        entity.state.position,
        entity.state.crouching,
        maxDist,
      );

      if (hit && (!closestHit || hit.distance < closestHit.distance)) {
        closestHit = {
          targetId: playerId,
          distance: hit.distance,
          point: hit.point,
          headshot: hit.headshot,
        };
      }
    }

    if (closestHit) {
      const damage = calculateDamage(
        weaponConfig.damage,
        closestHit.distance,
        weaponConfig,
        closestHit.headshot,
      );

      // Check if we already hit this player (multiple pellets)
      const existing = hits.find(h => h.targetId === closestHit!.targetId);
      if (existing) {
        existing.damage += damage;
        existing.headshot = existing.headshot || closestHit.headshot;
      } else {
        hits.push({
          targetId: closestHit.targetId,
          damage,
          headshot: closestHit.headshot,
          hitPosition: closestHit.point,
        });
      }
    }
  }

  return hits;
}
