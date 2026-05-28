// ========================================
// Client-Side Shooting Mechanics
// Triggers shots, calculates fire-rates, and applies camera recoil kick
// ========================================

import type { PlayerState, Vec3 } from "@shared/types/index.js";
import type { WeaponConfig } from "@shared/constants/index.js";
import { createShotSeed, getShotDirections } from "@shared/combat/spread.js";
import { inputManager } from "./InputManager.js";
import * as THREE from "three";

export class ShootingSystem {
  private lastFireTime = 0;
  private shotId = 0;

  /**
   * Tries to execute a shot.
   * Returns origin and direction if successful, or null if cannot shoot.
   */
  public tryShoot(
    camera: THREE.Camera,
    localPlayer: PlayerState,
    weaponConfig: WeaponConfig,
    now: number,
  ): {
    origin: Vec3;
    direction: Vec3;
    pelletDirections: Vec3[];
    shotId: number;
    spreadSeed: number;
  } | null {
    if (!localPlayer.alive) return null;
    if (localPlayer.reloading) return null;
    if (localPlayer.ammo <= 0) return null;

    const fireInterval = 1000 / weaponConfig.fireRate;
    if (now - this.lastFireTime < fireInterval) {
      return null;
    }

    this.lastFireTime = now;

    // Get camera ray
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const baseDirection = {
      x: direction.x,
      y: direction.y,
      z: direction.z,
    };
    const spreadSeed = createShotSeed(now);
    const pelletDirections = getShotDirections(
      baseDirection,
      weaponConfig,
      spreadSeed,
      localPlayer.velocity,
      localPlayer.crouching,
    );

    // Apply visual recoil to the input manager orientation
    const recoilPitchKick = weaponConfig.recoil;
    const recoilYawKick =
      (Math.random() - 0.5) * weaponConfig.recoilHorizontal * 2;

    inputManager.applyRecoil(recoilPitchKick, recoilYawKick);

    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: baseDirection,
      pelletDirections,
      shotId: this.shotId++,
      spreadSeed,
    };
  }
}
export const shootingSystem = new ShootingSystem();
