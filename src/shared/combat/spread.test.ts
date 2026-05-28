import { describe, expect, it } from "vitest";
import { WEAPONS } from "../constants/index.js";
import { calculateEffectiveSpread, getShotDirections } from "./spread.js";

describe("shot spread", () => {
  it("generates deterministic pellet directions from a shared seed", () => {
    const direction = { x: 0, y: 0, z: -1 };

    const first = getShotDirections(direction, WEAPONS.shotgun, 12345);
    const second = getShotDirections(direction, WEAPONS.shotgun, 12345);
    const third = getShotDirections(direction, WEAPONS.shotgun, 54321);

    expect(first).toEqual(second);
    expect(first).not.toEqual(third);
    expect(first).toHaveLength(WEAPONS.shotgun.pellets);
  });

  it("increases spread while moving and reduces it while crouched", () => {
    const weapon = WEAPONS.assault_rifle;
    const standing = calculateEffectiveSpread(weapon, { x: 10, y: 0, z: 0 });
    const crouched = calculateEffectiveSpread(
      weapon,
      { x: 10, y: 0, z: 0 },
      true,
    );

    expect(standing).toBeGreaterThan(weapon.spread);
    expect(crouched).toBeLessThan(standing);
  });
});
