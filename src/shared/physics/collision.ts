// ========================================
// Shared Collision System
// AABB-based collision detection and resolution
// Used by BOTH client and server
// ========================================

import type { Vec3, AABB } from "../types/index.js";
import {
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
} from "../constants/index.js";

// ── AABB Helpers ─────────────────────────────────────────

export function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/**
 * Get the penetration depth on each axis.
 * Returns the smallest overlap on each axis — used for resolution.
 */
export function aabbPenetration(a: AABB, b: AABB): Vec3 {
  const overlapX = Math.min(a.max.x - b.min.x, b.max.x - a.min.x);
  const overlapY = Math.min(a.max.y - b.min.y, b.max.y - a.min.y);
  const overlapZ = Math.min(a.max.z - b.min.z, b.max.z - a.min.z);
  return { x: overlapX, y: overlapY, z: overlapZ };
}

// ── Player AABB ──────────────────────────────────────────

/**
 * Create an AABB for the player at a given position.
 * Position is the center-bottom of the player capsule (feet).
 */
export function getPlayerAABB(position: Vec3, crouching: boolean): AABB {
  const height = crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  return {
    min: {
      x: position.x - PLAYER_RADIUS,
      y: position.y,
      z: position.z - PLAYER_RADIUS,
    },
    max: {
      x: position.x + PLAYER_RADIUS,
      y: position.y + height,
      z: position.z + PLAYER_RADIUS,
    },
  };
}

// ── Collision Resolution ─────────────────────────────────

export interface CollisionResult {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
}

/**
 * Resolve player position against static map geometry.
 * Pushes the player out of any overlapping boxes.
 * Uses minimum penetration axis (slide along walls, don't stick).
 */
export function resolveCollisions(
  position: Vec3,
  velocity: Vec3,
  crouching: boolean,
  mapBoxes: AABB[],
): CollisionResult {
  let px = position.x;
  let py = position.y;
  let pz = position.z;
  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;
  let grounded = false;

  // Iterate multiple times to handle corner cases
  for (let iter = 0; iter < 4; iter++) {
    const playerAABB = getPlayerAABB({ x: px, y: py, z: pz }, crouching);
    let resolved = false;

    for (const box of mapBoxes) {
      if (!aabbOverlaps(playerAABB, box)) continue;

      const pen = aabbPenetration(playerAABB, box);

      // Find minimum penetration axis
      if (pen.y <= pen.x && pen.y <= pen.z) {
        // Y axis resolution
        if (playerAABB.min.y < box.max.y && playerAABB.max.y > box.max.y) {
          // Player is above the box — push up (landed on top)
          py = box.max.y;
          if (vy < 0) vy = 0;
          grounded = true;
        } else {
          // Player hit ceiling — push down
          const height = crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
          py = box.min.y - height;
          if (vy > 0) vy = 0;
        }
        resolved = true;
      } else if (pen.x <= pen.z) {
        // X axis resolution
        if (px < (box.min.x + box.max.x) / 2) {
          px -= pen.x;
        } else {
          px += pen.x;
        }
        vx = 0;
        resolved = true;
      } else {
        // Z axis resolution
        if (pz < (box.min.z + box.max.z) / 2) {
          pz -= pen.z;
        } else {
          pz += pen.z;
        }
        vz = 0;
        resolved = true;
      }
    }

    if (!resolved) break;
  }

  // Floor check (no falling through ground at y=0)
  if (py < 0) {
    py = 0;
    if (vy < 0) vy = 0;
    grounded = true;
  }

  return {
    position: { x: px, y: py, z: pz },
    velocity: { x: vx, y: vy, z: vz },
    grounded,
  };
}

// ── Raycast ──────────────────────────────────────────────

export interface RaycastHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  boxIndex: number;
}

/**
 * Cast a ray against AABB geometry.
 * Returns the closest intersection, or null.
 * Uses slab method for ray-AABB intersection.
 */
export function raycastAABB(
  origin: Vec3,
  direction: Vec3,
  box: AABB,
  maxDistance: number,
): { distance: number; point: Vec3; normal: Vec3 } | null {
  let tmin = 0;
  let tmax = maxDistance;
  const normal: Vec3 = { x: 0, y: 0, z: 0 };

  // X slab
  if (Math.abs(direction.x) < 0.00001) {
    if (origin.x < box.min.x || origin.x > box.max.x) return null;
  } else {
    let t1 = (box.min.x - origin.x) / direction.x;
    let t2 = (box.max.x - origin.x) / direction.x;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      normal.x = n;
      normal.y = 0;
      normal.z = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Y slab
  if (Math.abs(direction.y) < 0.00001) {
    if (origin.y < box.min.y || origin.y > box.max.y) return null;
  } else {
    let t1 = (box.min.y - origin.y) / direction.y;
    let t2 = (box.max.y - origin.y) / direction.y;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      normal.x = 0;
      normal.y = n;
      normal.z = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Z slab
  if (Math.abs(direction.z) < 0.00001) {
    if (origin.z < box.min.z || origin.z > box.max.z) return null;
  } else {
    let t1 = (box.min.z - origin.z) / direction.z;
    let t2 = (box.max.z - origin.z) / direction.z;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      normal.x = 0;
      normal.y = 0;
      normal.z = n;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmin < 0) return null;

  return {
    distance: tmin,
    point: {
      x: origin.x + direction.x * tmin,
      y: origin.y + direction.y * tmin,
      z: origin.z + direction.z * tmin,
    },
    normal,
  };
}

/**
 * Raycast against all map boxes.
 * Returns the closest hit, or null.
 */
export function raycastMap(
  origin: Vec3,
  direction: Vec3,
  boxes: AABB[],
  maxDistance: number,
): RaycastHit | null {
  let closest: RaycastHit | null = null;

  for (let i = 0; i < boxes.length; i++) {
    const hit = raycastAABB(origin, direction, boxes[i], maxDistance);
    if (hit && (!closest || hit.distance < closest.distance)) {
      closest = { ...hit, boxIndex: i };
    }
  }

  return closest;
}

/**
 * Raycast against a player's AABB hitbox.
 * Returns distance and whether it's a headshot.
 */
export function raycastPlayer(
  origin: Vec3,
  direction: Vec3,
  targetPosition: Vec3,
  targetCrouching: boolean,
  maxDistance: number,
): { distance: number; point: Vec3; headshot: boolean } | null {
  const playerBox = getPlayerAABB(targetPosition, targetCrouching);
  const hit = raycastAABB(origin, direction, playerBox, maxDistance);

  if (!hit) return null;

  // Determine headshot — check if hit point is in top portion of hitbox
  const height = targetCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  const headThreshold = targetPosition.y + height * (1 - 0.25);
  const headshot = hit.point.y >= headThreshold;

  return {
    distance: hit.distance,
    point: hit.point,
    headshot,
  };
}
