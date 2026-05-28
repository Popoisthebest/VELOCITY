import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { WeaponType } from "@shared/types/index.js";
import { useGameStore } from "../store/gameStore.js";
import { isMuzzleFlashActive } from "../systems/WeaponEffects.js";
import * as THREE from "three";

function getWeaponColor(weapon: WeaponType): string {
  switch (weapon) {
    case WeaponType.SNIPER:
      return "#94a3b8";
    case WeaponType.SMG:
      return "#38bdf8";
    case WeaponType.SHOTGUN:
      return "#f97316";
    case WeaponType.REVOLVER:
      return "#eab308";
    case WeaponType.ASSAULT_RIFLE:
    default:
      return "#64748b";
  }
}

export function WeaponViewModel() {
  const { camera } = useThree();
  const localPlayer = useGameStore((state) => state.localPlayer);
  const isDead = useGameStore((state) => state.isDead);
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const bobTime = useRef(0);
  const offset = useRef(new THREE.Vector3());
  const weaponColor = localPlayer
    ? getWeaponColor(localPlayer.weapon)
    : "#64748b";

  useFrame((_, delta) => {
    const group = groupRef.current;
    const flash = flashRef.current;
    if (!group || !flash) return;

    const scoped =
      localPlayer?.weapon === WeaponType.SNIPER && localPlayer.aiming;
    group.visible = !!localPlayer?.alive && !isDead && !scoped;
    if (!localPlayer || !localPlayer.alive || isDead || scoped) return;

    const speed = Math.hypot(localPlayer.velocity.x, localPlayer.velocity.z);
    bobTime.current += delta * Math.max(speed, 1.5);
    const bobX = Math.sin(bobTime.current * 2) * 0.015;
    const bobY = Math.cos(bobTime.current * 3) * 0.012;

    offset.current.set(0.34 + bobX, -0.34 + bobY, -0.72);
    offset.current.applyQuaternion(camera.quaternion);
    group.position.copy(camera.position).add(offset.current);
    group.quaternion.copy(camera.quaternion);
    group.rotateY(-0.08);
    group.rotateX(-0.02);

    const flashVisible = isMuzzleFlashActive();
    flash.visible = flashVisible;
    if (flashVisible) {
      const scale = 0.7 + Math.random() * 0.25;
      flash.scale.set(scale, scale, scale);
    }
  });

  return (
    <group ref={groupRef} renderOrder={10}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.58]} />
        <meshStandardMaterial
          color={weaponColor}
          roughness={0.55}
          metalness={0.35}
        />
      </mesh>
      <mesh position={[0, -0.1, 0.1]}>
        <boxGeometry args={[0.12, 0.22, 0.18]} />
        <meshStandardMaterial
          color="#111827"
          roughness={0.7}
          metalness={0.15}
        />
      </mesh>
      <mesh position={[0, 0.025, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.28, 10]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.35}
          metalness={0.7}
        />
      </mesh>
      <mesh ref={flashRef} position={[0, 0.03, -0.56]} visible={false}>
        <coneGeometry args={[0.13, 0.28, 6]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
