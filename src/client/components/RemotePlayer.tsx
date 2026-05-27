// ========================================
// Client-Side Remote Player Rendering
// Renders other players as 3D capsules with nametags, health bars, and smooth frame interpolation
// ========================================

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { interpolationSystem } from "../systems/InterpolationSystem.js";
import {
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_RADIUS,
} from "@shared/constants/index.js";
import { useGameStore } from "../store/gameStore.js";
import * as THREE from "three";

interface RemotePlayerProps {
  id: string;
}

function getPlayerColor(id: string): string {
  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#ec4899", // pink
    "#8b5cf6", // purple
    "#f59e0b", // amber
    "#06b6d4", // cyan
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function RemotePlayer({ id }: RemotePlayerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const capsuleRef = useRef<THREE.Mesh>(null);
  const color = getPlayerColor(id);

  // Subscribe to local health/alive state to render nameplates
  const playerState = useGameStore((state) => state.remotePlayers.get(id));

  useFrame(() => {
    if (!groupRef.current) return;

    // Retrieve smooth interpolated state for this frame
    const renderTime = Date.now() - 100; // 100ms interpolation buffer
    const interp = interpolationSystem.getInterpolatedState(id, renderTime);

    if (interp) {
      // 1. Update overall group position
      groupRef.current.position.set(
        interp.position.x,
        interp.position.y,
        interp.position.z,
      );

      // 2. Update mesh rotation
      groupRef.current.rotation.y = interp.rotation.yaw;

      // 3. Handle crouch scaling dynamically
      if (capsuleRef.current) {
        const height = interp.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
        capsuleRef.current.scale.set(
          1,
          interp.crouching ? PLAYER_CROUCH_HEIGHT / PLAYER_HEIGHT : 1.0,
          1,
        );
        capsuleRef.current.position.y = height / 2;
      }

      // Make sure the group is visible
      groupRef.current.visible = interp.alive;
    } else if (playerState) {
      // Fallback to last known store state
      groupRef.current.position.set(
        playerState.position.x,
        playerState.position.y,
        playerState.position.z,
      );
      groupRef.current.rotation.y = playerState.rotation.yaw;
      groupRef.current.visible = playerState.alive;
    }
  });

  if (!playerState || !playerState.alive) return null;

  return (
    <group ref={groupRef}>
      {/* 3D Capsule Hitbox / Body */}
      <mesh ref={capsuleRef}>
        <capsuleGeometry
          args={[PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2, 8, 16]}
        />
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.2}
          flatShading
        />
      </mesh>

      {/* Head Indicator (visor look) */}
      <mesh position={[0, PLAYER_HEIGHT - 0.3, 0.2]}>
        <boxGeometry args={[0.5, 0.15, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} />
      </mesh>

      {/* Nametag & Health Bar HTML overlay */}
      <Html
        position={[0, PLAYER_HEIGHT + 0.4, 0]}
        center
        distanceFactor={15}
        occlude
      >
        <div className="flex flex-col items-center select-none pointer-events-none text-center">
          {/* Health bar container */}
          <div className="w-16 h-1.5 bg-gray-900/80 border border-gray-900 rounded overflow-hidden mb-1">
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{ width: `${playerState.health}%` }}
            />
          </div>
          {/* Nickname */}
          <span
            className="px-1.5 py-0.5 rounded text-xs font-bold text-white tracking-wide shadow"
            style={{ backgroundColor: `${color}cc` }}
          >
            {playerState.nickname}
          </span>
        </div>
      </Html>
    </group>
  );
}
