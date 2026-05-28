// ========================================
// Server-Side Player Entity
// Authoritative player state + input processing
// ========================================

import type {
  PlayerState,
  InputState,
  SpawnPoint,
  AABB,
} from "../../shared/types/index.js";
import { createDefaultPlayerState } from "../../shared/types/index.js";
import { processMovement } from "../../shared/physics/movement.js";
import { resolveCollisions } from "../../shared/physics/collision.js";
import {
  MAX_HP,
  WEAPONS,
  RESPAWN_TIME,
  SPAWN_PROTECTION_TIME,
} from "../../shared/constants/index.js";

export class PlayerEntity {
  public state: PlayerState;
  public inputQueue: InputState[] = [];
  public lastProcessedSequence = 0;
  public deathTime = 0;
  public lastDamageBy = "";
  public damageLog = new Map<string, number>();

  constructor(id: string, nickname: string, spawnPoint: SpawnPoint) {
    this.state = createDefaultPlayerState(id, nickname);
    this.state.position = { ...spawnPoint.position };
    this.state.position.y = spawnPoint.position.y;
    this.state.rotation = { ...spawnPoint.rotation };
  }

  queueInput(input: InputState): void {
    // Cap queue size to prevent memory issues from laggy clients
    if (this.inputQueue.length > 30) {
      this.inputQueue.shift();
    }
    this.inputQueue.push(input);
  }

  processInputs(mapBoxes: AABB[]): void {
    if (!this.state.alive) {
      this.inputQueue.length = 0;
      return;
    }

    while (this.inputQueue.length > 0) {
      const input = this.inputQueue.shift()!;
      const dt = Math.min(input.deltaTime, 0.05); // cap delta to prevent speed hacks

      // Update rotation from input
      this.state.rotation.yaw = input.yaw;
      this.state.rotation.pitch = input.pitch;

      // Process movement
      const moveResult = processMovement(
        this.state.position,
        this.state.velocity,
        this.state.grounded,
        this.state.slideTime,
        input,
        dt,
      );

      // Resolve collisions
      const collResult = resolveCollisions(
        moveResult.position,
        moveResult.velocity,
        moveResult.crouching,
        mapBoxes,
      );

      // Update state
      this.state.position = collResult.position;
      this.state.velocity = collResult.velocity;
      this.state.grounded = collResult.grounded;
      this.state.crouching = moveResult.crouching;
      this.state.sprinting = moveResult.sprinting;
      this.state.sliding = moveResult.sliding;
      this.state.aiming = input.aim;
      this.state.slideTime = moveResult.slideTime;
      this.state.ping = input.ping;

      this.lastProcessedSequence = input.sequence;
    }
  }

  takeDamage(
    amount: number,
    attackerId: string,
  ): { killed: boolean; assistors: string[] } {
    if (!this.state.alive) return { killed: false, assistors: [] };

    const now = Date.now();

    if (this.state.spawnProtectionUntil > now) {
      return { killed: false, assistors: [] };
    }

    if (attackerId !== this.state.id) {
      this.damageLog.set(attackerId, now);
    }

    let remaining = amount;

    // Armor absorbs 50% of damage
    if (this.state.armor > 0) {
      const armorAbsorb = Math.min(this.state.armor, remaining * 0.5);
      this.state.armor -= armorAbsorb;
      remaining -= armorAbsorb;
    }

    this.state.health -= remaining;
    this.lastDamageBy = attackerId;

    const assistors = Array.from(this.damageLog.entries())
      .filter(
        ([attacker, timestamp]) =>
          attacker !== attackerId && now - timestamp <= 8000,
      )
      .map(([attacker]) => attacker);

    if (this.state.health <= 0) {
      this.state.health = 0;
      this.die();
      this.damageLog.clear();
      return { killed: true, assistors };
    }

    return { killed: false, assistors: [] };
  }

  die(): void {
    this.state.alive = false;
    this.state.deaths++;
    this.state.streak = 0;
    this.deathTime = Date.now();
    this.state.velocity = { x: 0, y: 0, z: 0 };
  }

  respawn(spawnPoint: SpawnPoint): void {
    this.state.alive = true;
    this.state.health = MAX_HP;
    this.state.armor = 0;
    this.state.position = { ...spawnPoint.position };
    this.state.rotation = { ...spawnPoint.rotation };
    this.state.velocity = { x: 0, y: 0, z: 0 };
    this.state.grounded = false;
    this.state.crouching = false;
    this.state.sprinting = false;
    this.state.sliding = false;
    this.state.aiming = false;
    this.state.slideTime = 0;
    this.state.spawnProtectionUntil = Date.now() + SPAWN_PROTECTION_TIME;

    // Reset weapon
    const weaponConfig = WEAPONS[this.state.weapon];
    if (weaponConfig) {
      this.state.ammo = weaponConfig.magazineSize;
      this.state.maxAmmo = weaponConfig.magazineSize;
    }
    this.state.reloading = false;
    this.state.reloadEndTime = 0;
    this.state.lastFireTime = 0;
    this.damageLog.clear();
    this.inputQueue.length = 0;
  }

  startReload(now: number): void {
    if (this.state.reloading) return;
    const weaponConfig = WEAPONS[this.state.weapon];
    if (!weaponConfig) return;
    if (this.state.ammo >= weaponConfig.magazineSize) return;

    this.state.reloading = true;
    this.state.reloadEndTime = now + weaponConfig.reloadTime;
  }

  checkReload(now: number): void {
    if (!this.state.reloading) return;
    if (now >= this.state.reloadEndTime) {
      const weaponConfig = WEAPONS[this.state.weapon];
      if (weaponConfig) {
        this.state.ammo = weaponConfig.magazineSize;
      }
      this.state.reloading = false;
    }
  }

  canShoot(now: number): boolean {
    if (!this.state.alive) return false;
    if (this.state.reloading) return false;
    if (this.state.ammo <= 0) return false;

    const weaponConfig = WEAPONS[this.state.weapon];
    if (!weaponConfig) return false;

    const fireInterval = 1000 / weaponConfig.fireRate;
    return now - this.state.lastFireTime >= fireInterval;
  }

  shoot(now: number): void {
    this.state.ammo--;
    this.state.lastFireTime = now;

    // Auto-reload when empty
    if (this.state.ammo <= 0) {
      this.startReload(now);
    }
  }

  shouldRespawn(now: number): boolean {
    return !this.state.alive && now - this.deathTime >= RESPAWN_TIME;
  }

  toState(): PlayerState {
    return { ...this.state };
  }
}
