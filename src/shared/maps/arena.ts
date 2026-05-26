// ========================================
// Arena Map Data
// Block-based deathmatch arena (60x60 units)
// Provides both collision geometry and spawn points
// ========================================

import type { MapData, AABB, SpawnPoint } from '../types/index.js';

/**
 * Compact arena with verticality and cover.
 *
 * Layout (top-down, Y is up):
 *
 *   +─────────────────────────────────+
 *   │  SP                        SP   │
 *   │        ▄▄▄▄                     │
 *   │        █P1█  ◄ platform         │
 *   │   ░░   ▀▀▀▀                     │
 *   │   ░░  ◄ steps                   │
 *   │              ┌──┐               │
 *   │  SP    █ C █ │TW│  █ C █   SP   │
 *   │              │  │               │
 *   │              └──┘               │
 *   │                   ░░            │
 *   │                   ░░  ◄ steps   │
 *   │                 ▄▄▄▄            │
 *   │   SP            █P2█       SP   │
 *   │                 ▀▀▀▀            │
 *   │  SP                        SP   │
 *   +─────────────────────────────────+
 *
 *   TW = Tower (center), P = Platform, C = Cover, ░ = Steps
 */

const boxes: AABB[] = [
  // ── Floor ────────────────────────────────────────
  { min: { x: -32, y: -1, z: -32 }, max: { x: 32, y: 0, z: 32 } },

  // ── Perimeter Walls (2 units thick, 8 units tall) ──
  { min: { x: -32, y: 0, z: -32 }, max: { x: 32, y: 8, z: -30 } },   // North
  { min: { x: -32, y: 0, z: 30 }, max: { x: 32, y: 8, z: 32 } },     // South
  { min: { x: 30, y: 0, z: -32 }, max: { x: 32, y: 8, z: 32 } },     // East
  { min: { x: -32, y: 0, z: -32 }, max: { x: -30, y: 8, z: 32 } },   // West

  // ── Central Tower (4x4x5) ───────────────────────
  { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 5, z: 2 } },

  // ── Cover Blocks (low walls, 1.5 units tall) ────
  // NW cover
  { min: { x: -16, y: 0, z: -8 }, max: { x: -13, y: 1.5, z: -5 } },
  // NE cover
  { min: { x: 13, y: 0, z: -12 }, max: { x: 16, y: 1.5, z: -9 } },
  // SW cover
  { min: { x: -16, y: 0, z: 9 }, max: { x: -13, y: 1.5, z: 12 } },
  // SE cover
  { min: { x: 13, y: 0, z: 5 }, max: { x: 16, y: 1.5, z: 8 } },

  // ── Large Cover Blocks near center ──────────────
  { min: { x: -10, y: 0, z: -1.5 }, max: { x: -6, y: 2, z: 1.5 } },
  { min: { x: 6, y: 0, z: -1.5 }, max: { x: 10, y: 2, z: 1.5 } },

  // ── Platform NE (elevated, 3 units high) ────────
  { min: { x: 15, y: 0, z: -25 }, max: { x: 25, y: 3, z: -18 } },
  // Steps to Platform NE
  { min: { x: 13, y: 0, z: -25 }, max: { x: 15, y: 1, z: -18 } },
  { min: { x: 11, y: 0, z: -25 }, max: { x: 13, y: 2, z: -18 } },

  // ── Platform SW (elevated, 3 units high) ────────
  { min: { x: -25, y: 0, z: 18 }, max: { x: -15, y: 3, z: 25 } },
  // Steps to Platform SW
  { min: { x: -15, y: 0, z: 18 }, max: { x: -13, y: 1, z: 25 } },
  { min: { x: -13, y: 0, z: 18 }, max: { x: -11, y: 2, z: 25 } },

  // ── Jump Blocks (for movement tech) ─────────────
  { min: { x: -22, y: 0, z: -3 }, max: { x: -19, y: 1.2, z: 0 } },
  { min: { x: 19, y: 0, z: 0 }, max: { x: 22, y: 1.2, z: 3 } },

  // ── Small Crates near center (jump over or behind)
  { min: { x: -5, y: 0, z: -8 }, max: { x: -3, y: 1, z: -6 } },
  { min: { x: 3, y: 0, z: 6 }, max: { x: 5, y: 1, z: 8 } },

  // ── Mid-height walls for sight lines ────────────
  { min: { x: -1, y: 0, z: -15 }, max: { x: 1, y: 2.5, z: -10 } },
  { min: { x: -1, y: 0, z: 10 }, max: { x: 1, y: 2.5, z: 15 } },
];

const spawnPoints: SpawnPoint[] = [
  // Spread around the perimeter, facing center
  { position: { x: -25, y: 0, z: -25 }, rotation: { yaw: Math.PI / 4, pitch: 0 } },
  { position: { x: 25, y: 0, z: -25 }, rotation: { yaw: -Math.PI / 4 + Math.PI, pitch: 0 } },
  { position: { x: -25, y: 0, z: 25 }, rotation: { yaw: -Math.PI / 4, pitch: 0 } },
  { position: { x: 25, y: 0, z: 25 }, rotation: { yaw: Math.PI / 4 + Math.PI, pitch: 0 } },
  { position: { x: 0, y: 0, z: -25 }, rotation: { yaw: 0, pitch: 0 } },
  { position: { x: 0, y: 0, z: 25 }, rotation: { yaw: Math.PI, pitch: 0 } },
  { position: { x: -25, y: 0, z: 0 }, rotation: { yaw: Math.PI / 2, pitch: 0 } },
  { position: { x: 25, y: 0, z: 0 }, rotation: { yaw: -Math.PI / 2, pitch: 0 } },
];

export const ARENA_MAP: MapData = {
  name: 'Arena',
  boxes,
  spawnPoints,
  bounds: {
    min: { x: -30, y: 0, z: -30 },
    max: { x: 30, y: 20, z: 30 },
  },
};
