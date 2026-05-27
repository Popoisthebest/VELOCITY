// ========================================
// Client-Side 3D R3F Canvas and Game Loop Controller
// Drives local prediction, client shooting, scoreboard toggling, and network throttling
// ========================================

import React, { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGameStore } from "../store/gameStore.js";
import { inputManager } from "../systems/InputManager.js";
import { getInputMode } from "../utils/device.js";
import { predictionSystem } from "../systems/PredictionSystem.js";
import { shootingSystem } from "../systems/ShootingSystem.js";
import { networkClient } from "../network/NetworkClient.js";
import { addVisualTracer, BulletTracers } from "./BulletTracer.js";
import { ArenaMap } from "../scenes/ArenaMap.js";
import { FPSCamera } from "./FPSCamera.js";
import { RemotePlayer } from "./RemotePlayer.js";
import { processMovement } from "@shared/physics/movement.js";
import {
  resolveCollisions,
  raycastMap,
  raycastPlayer,
} from "@shared/physics/collision.js";
import { WEAPONS, NETWORK_INTERVAL } from "@shared/constants/index.js";
import { PacketType } from "@shared/protocol/index.js";
import type {
  Vec3,
  WeaponConfig,
  PlayerState,
  AABB,
} from "@shared/types/index.js";
import * as THREE from "three";

function calculateLocalHitPoint(
  origin: Vec3,
  direction: Vec3,
  weaponConfig: WeaponConfig,
  remotePlayers: Map<string, PlayerState>,
  mapBoxes: AABB[],
): Vec3 {
  const range = weaponConfig.range;
  // Wall intersection
  const wallHit = raycastMap(origin, direction, mapBoxes, range);
  const maxDist = wallHit ? wallHit.distance : range;

  let closestHitDist = maxDist;
  let hitPoint: Vec3 = {
    x: origin.x + direction.x * maxDist,
    y: origin.y + direction.y * maxDist,
    z: origin.z + direction.z * maxDist,
  };

  // Player intersections
  for (const player of remotePlayers.values()) {
    if (!player.alive) continue;
    const playerHit = raycastPlayer(
      origin,
      direction,
      player.position,
      player.crouching,
      closestHitDist,
    );
    if (playerHit && playerHit.distance < closestHitDist) {
      closestHitDist = playerHit.distance;
      hitPoint = playerHit.point;
    }
  }

  return hitPoint;
}

function GameLoopController() {
  const { camera } = useThree();
  const localPlayer = useGameStore((state) => state.localPlayer);
  const remotePlayers = useGameStore((state) => state.remotePlayers);
  const mapData = useGameStore((state) => state.mapData);
  const isDead = useGameStore((state) => state.isDead);
  const gamePhase = useGameStore((state) => state.gamePhase);

  const inputSequence = useRef(0);
  const lastInputSentTime = useRef(0);

  // FPS tracking
  const fpsTimer = useRef(0);
  const fpsCount = useRef(0);

  useFrame((state, delta) => {
    const now = Date.now();

    // 1. Calculate FPS
    fpsCount.current++;
    fpsTimer.current += delta;
    if (fpsTimer.current >= 0.5) {
      useGameStore
        .getState()
        .setFps(Math.round(fpsCount.current / fpsTimer.current));
      fpsCount.current = 0;
      fpsTimer.current = 0;
    }

    if (!localPlayer || !mapData || isDead || gamePhase === "ended") return;

    // 2. Sample Keyboard & Mouse orientation
    const input = inputManager.getInputState(inputSequence.current++, delta);

    // 3. Local Movement Prediction
    const moveResult = processMovement(
      localPlayer.position,
      localPlayer.velocity,
      localPlayer.grounded,
      localPlayer.slideTime,
      input,
      delta,
    );

    const collResult = resolveCollisions(
      moveResult.position,
      moveResult.velocity,
      moveResult.crouching,
      mapData.boxes,
    );

    // Queue input locally for future reconciliation
    predictionSystem.addInput(input);

    // 4. Handle client-side shooting & reload prediction
    const weaponConfig = WEAPONS[localPlayer.weapon];

    // Check local reload timer
    if (localPlayer.reloading) {
      if (now >= localPlayer.reloadEndTime) {
        useGameStore.getState().updateLocalPlayer({
          ammo: weaponConfig.magazineSize,
          reloading: false,
        });
      }
    } else if (input.reload && localPlayer.ammo < weaponConfig.magazineSize) {
      // Trigger reload
      networkClient.send({ type: PacketType.C_RELOAD });
      useGameStore.getState().updateLocalPlayer({
        reloading: true,
        reloadEndTime: now + weaponConfig.reloadTime,
      });
    }

    // Trigger shoot
    let didShoot = false;
    let shootOrigin: Vec3 | null = null;
    let shootDir: Vec3 | null = null;

    if (input.shoot && !localPlayer.reloading && localPlayer.ammo > 0) {
      const shot = shootingSystem.tryShoot(
        camera,
        localPlayer,
        weaponConfig,
        now,
      );
      if (shot) {
        didShoot = true;
        shootOrigin = shot.origin;
        shootDir = shot.direction;

        // Perform local hitscan to find tracer end point
        const hitPoint = calculateLocalHitPoint(
          shot.origin,
          shot.direction,
          weaponConfig,
          remotePlayers,
          mapData.boxes,
        );

        // Render tracer locally
        addVisualTracer(shot.origin, hitPoint);

        // Deduct ammo instantly for responsive UI
        const nextAmmo = localPlayer.ammo - 1;
        const autoReloading = nextAmmo <= 0;

        useGameStore.getState().updateLocalPlayer({
          ammo: nextAmmo,
          reloading: autoReloading,
          reloadEndTime: autoReloading ? now + weaponConfig.reloadTime : 0,
        });

        // Send Shoot Packet to server
        networkClient.send({
          type: PacketType.C_SHOOT,
          origin: shot.origin,
          direction: shot.direction,
          timestamp: now,
        });
      }
    }

    // Update store with predicted local state
    useGameStore.getState().setLocalPlayer({
      ...localPlayer,
      position: collResult.position,
      velocity: collResult.velocity,
      grounded: collResult.grounded,
      crouching: moveResult.crouching,
      sprinting: moveResult.sprinting,
      sliding: moveResult.sliding,
      slideTime: moveResult.slideTime,
      rotation: { yaw: input.yaw, pitch: input.pitch },
    });

    // 5. Send Input to Server (60Hz / every frame for zero-lag prediction simulation)
    networkClient.send({
      type: PacketType.C_INPUT,
      input,
    });
  });

  return null;
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remotePlayers = useGameStore((state) => state.remotePlayers);
  const remoteIds = Array.from(remotePlayers.keys());

  // Listen for pointer lock setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      inputManager.setCanvas(canvas);

      // Only request pointer lock on desktop-like input modes
      if (getInputMode() === "desktop") {
        const onCanvasClick = () => {
          if (!inputManager.isPointerLocked()) {
            inputManager.requestPointerLock();
          }
        };

        canvas.addEventListener("click", onCanvasClick);
        return () => {
          canvas.removeEventListener("click", onCanvasClick);
        };
      }
    }
  }, []);

  // Listen for scoreboard Tab key toggles
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        useGameStore.getState().setShowScoreboard(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        useGameStore.getState().setShowScoreboard(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        ref={canvasRef}
        shadows
        gl={{ antialias: true, dpr: [1, 2] }}
        camera={{ fov: 90, near: 0.1, far: 1000 }}
      >
        {/* Lights */}
        <ambientLight intensity={0.75} />
        <directionalLight
          position={[15, 30, 15]}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* Sky styling matching sky color */}
        <color attach="background" args={["#0b0d19"]} />
        <fog attach="fog" args={["#0b0d19", 40, 120]} />

        {/* Arena static geometry */}
        <ArenaMap />

        {/* First Person Camera */}
        <FPSCamera />

        {/* Remote Players */}
        {remoteIds.map((id) => (
          <RemotePlayer key={id} id={id} />
        ))}

        {/* Bullet Tracers and spark pool */}
        <BulletTracers />

        {/* Local Prediction Loop Controller */}
        <GameLoopController />
      </Canvas>
    </div>
  );
}
