import { describe, expect, it } from "vitest";
import { WEAPONS, type WeaponConfig } from "../../shared/constants/index.js";
import { WeaponType } from "../../shared/types/index.js";
import { calculateDamage, validateShot } from "./CombatSystem.js";
import { PlayerEntity } from "./PlayerEntity.js";

describe("combat damage", () => {
  it("uses the weapon-specific headshot multiplier", () => {
    const weapon: WeaponConfig = {
      ...WEAPONS.assault_rifle,
      damage: 10,
      minDamage: 10,
      headshotMultiplier: 3,
    };

    expect(calculateDamage(weapon.damage, 0, weapon, true)).toBe(30);
  });

  it("makes sniper hits lethal through armor", () => {
    const shooter = new PlayerEntity("shooter", "Shooter", {
      position: { x: 0, y: 0, z: 0 },
      rotation: { yaw: 0, pitch: 0 },
    });
    shooter.state.weapon = WeaponType.SNIPER;

    const target = new PlayerEntity("target", "Target", {
      position: { x: 0, y: 0, z: -10 },
      rotation: { yaw: 0, pitch: 0 },
    });
    target.state.health = 100;
    target.state.armor = 100;

    const weapon: WeaponConfig = {
      ...WEAPONS.sniper,
      damage: 1,
      spread: 0,
      minDamage: 1,
    };

    const hits = validateShot(
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: -1 },
      shooter.state.id,
      new Map([
        [shooter.state.id, shooter],
        [target.state.id, target],
      ]),
      [],
      weapon,
      1,
    );

    expect(hits).toHaveLength(1);
    expect(hits[0].damage).toBe(200);
  });
});
