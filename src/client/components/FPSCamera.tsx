// ========================================
// Client-Side First-Person Camera Component
// Manages viewport orientation, eye position, weapon bobbing, and recoil recovery
// ========================================

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGameStore } from "../store/gameStore.js";
import { inputManager } from "../systems/InputManager.js";
import { WeaponType } from "@shared/types/index.js";
import {
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
} from "@shared/constants/index.js";
import * as THREE from "three";

export function FPSCamera() {
  const { camera } = useThree();
  const localPlayer = useGameStore((state) => state.localPlayer);
  const isDead = useGameStore((state) => state.isDead);

  // Bobbing variables
  const bobTime = useRef(0);
  const currentBobY = useRef(0);
  const currentBobX = useRef(0);

  // Visual recoil shake (separate from mouse input recoil)
  const visualRecoilY = useRef(0);
  useFrame((state, delta) => {
    if (!localPlayer || isDead) {
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 90) {
        camera.fov = THREE.MathUtils.lerp(
          camera.fov,
          90,
          Math.min(delta * 14, 1),
        );
        camera.updateProjectionMatrix();
      }
      return;
    }

    const { position, velocity, crouching, grounded } = localPlayer;
    const scoped =
      localPlayer.weapon === WeaponType.SNIPER && localPlayer.aiming;

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = scoped ? 34 : 90;
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        targetFov,
        Math.min(delta * 14, 1),
      );
      camera.updateProjectionMatrix();
    }

    // 1. Calculate eye height
    const targetEyeHeight = crouching
      ? PLAYER_CROUCH_HEIGHT - 0.1 // ~0.9
      : PLAYER_HEIGHT - 0.2; // ~1.6

    // Smoothly lerp camera height when crouching/standing
    const currentEyeY = THREE.MathUtils.lerp(
      camera.position.y - position.y,
      targetEyeHeight,
      Math.min(delta * 15, 1.0),
    );

    // 2. Weapon Bobbing (only on ground and moving)
    const horizSpeed = Math.sqrt(
      velocity.x * velocity.x + velocity.z * velocity.z,
    );
    if (grounded && horizSpeed > 0.1) {
      // Frequency matches speed
      bobTime.current += delta * horizSpeed * 2.0;

      // Sinusoidal bobbing curves
      const bobAmpY = 0.03 * (crouching ? 0.5 : 1.0);
      const bobAmpX = 0.02 * (crouching ? 0.5 : 1.0);

      currentBobY.current = Math.sin(bobTime.current * 2) * bobAmpY;
      currentBobX.current = Math.cos(bobTime.current) * bobAmpX;
    } else {
      // Decay bobbing back to 0
      currentBobY.current = THREE.MathUtils.lerp(
        currentBobY.current,
        0,
        delta * 10,
      );
      currentBobX.current = THREE.MathUtils.lerp(
        currentBobX.current,
        0,
        delta * 10,
      );
      bobTime.current = 0;
    }

    // 3. Visual Recoil decay (spring system)
    // Lerp visual recoil back to 0 quickly
    visualRecoilY.current = THREE.MathUtils.lerp(
      visualRecoilY.current,
      0,
      delta * 12,
    );

    // Apply translation to camera position (eye height + bobbing)
    camera.position.set(
      position.x + currentBobX.current,
      position.y + currentEyeY + currentBobY.current,
      position.z,
    );

    // 4. Camera Rotation
    // Apply yaw and pitch directly from the input manager
    const targetRotation = new THREE.Euler(0, 0, 0, "YXZ");
    targetRotation.x = inputManager.pitch + visualRecoilY.current;
    targetRotation.y = inputManager.yaw;
    camera.quaternion.setFromEuler(targetRotation);
  });

  return null;
}
