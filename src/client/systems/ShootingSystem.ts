// ========================================
// Client-Side Shooting Mechanics
// Triggers shots, calculates fire-rates, and applies camera recoil kick
// ========================================

import type { PlayerState, Vec3 } from '@shared/types/index.js';
import type { WeaponConfig } from '@shared/constants/index.js';
import { inputManager } from './InputManager.js';
import * as THREE from 'three';

export class ShootingSystem {
  private lastFireTime = 0;

  /**
   * Tries to execute a shot.
   * Returns origin and direction if successful, or null if cannot shoot.
   */
  public tryShoot(
    camera: THREE.Camera,
    localPlayer: PlayerState,
    weaponConfig: WeaponConfig,
    now: number,
  ): { origin: Vec3; direction: Vec3 } | null {
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

    // Apply weapon spread
    const spreadDirection = this.applySpread(direction, weaponConfig.spread);

    // Apply visual recoil to the input manager orientation
    const recoilPitchKick = weaponConfig.recoil;
    const recoilYawKick = (Math.random() - 0.5) * weaponConfig.recoilHorizontal * 2;

    inputManager.applyRecoil(recoilPitchKick, recoilYawKick);

    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: spreadDirection.x, y: spreadDirection.y, z: spreadDirection.z },
    };
  }

  private applySpread(direction: THREE.Vector3, spread: number): THREE.Vector3 {
    if (spread <= 0.0001) return direction.clone();

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spread;

    // Create perpendicular coordinate frame
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    if (Math.abs(direction.y) > 0.9) {
      up.set(1, 0, 0);
    }

    right.crossVectors(direction, up).normalize();
    const actualUp = new THREE.Vector3().crossVectors(right, direction).normalize();

    const offset = new THREE.Vector3()
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(actualUp, Math.sin(angle) * radius);

    return direction.clone().add(offset).normalize();
  }
}
export const shootingSystem = new ShootingSystem();
