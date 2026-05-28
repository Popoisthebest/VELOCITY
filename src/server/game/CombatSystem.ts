// ========================================
// Combat System — Server-Side Hit Validation
// Stateless utility functions for shot verification
// ========================================

import type { Vec3, AABB } from "../../shared/types/index.js";
import type { WeaponConfig } from "../../shared/constants/index.js";
import { raycastPlayer, raycastMap } from "../../shared/physics/collision.js";
import { vec3Distance } from "../../shared/physics/movement.js";
import {
  PLAYER_EYE_OFFSET,
  PLAYER_HEIGHT,
} from "../../shared/constants/index.js";
import { getShotDirections } from "../../shared/combat/spread.js";
import type { PlayerEntity } from "./PlayerEntity.js";

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
      const t =
        (distance - weaponConfig.falloffStart) /
        (weaponConfig.falloffEnd - weaponConfig.falloffStart);
      damage = baseDamage + (weaponConfig.minDamage - baseDamage) * t;
    }
  }

  // Headshot multiplier
  if (headshot) {
    damage *= weaponConfig.headshotMultiplier;
  }

  return Math.round(damage);
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
  spreadSeed = 0,
): HitResult[] {
  const shooter = players.get(shooterId);
  if (!shooter) return [];

  // Anti-cheat: verify origin is near shooter's actual eye position
  const eyePos: Vec3 = {
    x: shooter.state.position.x,
    y: shooter.state.position.y + PLAYER_HEIGHT / 2 + PLAYER_EYE_OFFSET,
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

  const shotDirections = getShotDirections(
    direction,
    weaponConfig,
    spreadSeed,
    shooter.state.velocity,
    shooter.state.crouching,
  );

  for (const spreadDir of shotDirections) {
    // Check wall hit distance first
    const wallHit = raycastMap(
      authOrigin,
      spreadDir,
      mapBoxes,
      weaponConfig.range,
    );
    const maxDist = wallHit ? wallHit.distance : weaponConfig.range;

    // Check all alive players
    let closestHit: {
      targetId: string;
      distance: number;
      point: Vec3;
      headshot: boolean;
    } | null = null;

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
      const damage =
        weaponConfig.id === "sniper"
          ? Math.ceil(
              players.get(closestHit.targetId)!.state.health +
                players.get(closestHit.targetId)!.state.armor,
            )
          : calculateDamage(
              weaponConfig.damage,
              closestHit.distance,
              weaponConfig,
              closestHit.headshot,
            );

      // Check if we already hit this player (multiple pellets)
      const existing = hits.find((h) => h.targetId === closestHit!.targetId);
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
