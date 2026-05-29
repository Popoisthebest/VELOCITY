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
import { interpolationSystem } from "../systems/InterpolationSystem.js";
import { shootingSystem } from "../systems/ShootingSystem.js";
import { networkClient } from "../network/NetworkClient.js";
import { addVisualTracer, BulletTracers } from "./BulletTracer.js";
import { ArenaMap } from "../scenes/ArenaMap.js";
import { FPSCamera } from "./FPSCamera.js";
import { RemotePlayer } from "./RemotePlayer.js";
import { WeaponViewModel } from "./WeaponViewModel.js";
import { triggerMuzzleFlash } from "../systems/WeaponEffects.js";
import { audioManager } from "../systems/AudioManager.js";
import { processMovement } from "@shared/physics/movement.js";
import {
  resolveCollisions,
  raycastMap,
  raycastPlayer,
} from "@shared/physics/collision.js";
import { WEAPONS } from "@shared/constants/index.js";
import { PacketType } from "@shared/protocol/index.js";
import type {
  Vec3,
  WeaponConfig,
  PlayerState,
  AABB,
} from "@shared/types/index.js";

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
    const renderPlayer =
      interpolationSystem.getRenderedPlayerState(player.id) ?? player;
    if (!renderPlayer.alive) continue;
    const playerHit = raycastPlayer(
      origin,
      direction,
      renderPlayer.position,
      renderPlayer.crouching,
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
  const wasShootPressed = useRef(false);

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

    if (!localPlayer || !mapData || isDead || gamePhase === "ended") {
      wasShootPressed.current = false;
      return;
    }

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
    let nextLocalPlayer = localPlayer;

    // Check local reload timer
    if (nextLocalPlayer.reloading) {
      if (now >= nextLocalPlayer.reloadEndTime) {
        nextLocalPlayer = {
          ...nextLocalPlayer,
          ammo: weaponConfig.magazineSize,
          reloading: false,
        };
      }
    } else if (
      input.reload &&
      nextLocalPlayer.ammo < weaponConfig.magazineSize
    ) {
      // Trigger reload
      networkClient.send({ type: PacketType.C_RELOAD });
      nextLocalPlayer = {
        ...nextLocalPlayer,
        reloading: true,
        reloadEndTime: now + weaponConfig.reloadTime,
      };
    }

    // Trigger shoot
    const shootPressed = input.shoot;
    const shootStarted = shootPressed && !wasShootPressed.current;
    wasShootPressed.current = shootPressed;
    const wantsShoot = weaponConfig.automatic ? shootPressed : shootStarted;

    if (wantsShoot && !nextLocalPlayer.reloading && nextLocalPlayer.ammo > 0) {
      const shot = shootingSystem.tryShoot(
        camera,
        nextLocalPlayer,
        weaponConfig,
        now,
      );
      if (shot) {
        for (const pelletDirection of shot.pelletDirections) {
          const hitPoint = calculateLocalHitPoint(
            shot.origin,
            pelletDirection,
            weaponConfig,
            remotePlayers,
            mapData.boxes,
          );
          addVisualTracer(shot.origin, hitPoint);
        }
        triggerMuzzleFlash();
        audioManager.playShoot(nextLocalPlayer.weapon);

        // Deduct ammo instantly for responsive UI
        const nextAmmo = nextLocalPlayer.ammo - 1;
        const autoReloading = nextAmmo <= 0;

        nextLocalPlayer = {
          ...nextLocalPlayer,
          ammo: nextAmmo,
          reloading: autoReloading,
          reloadEndTime: autoReloading ? now + weaponConfig.reloadTime : 0,
        };

        // Send Shoot Packet to server
        networkClient.send({
          type: PacketType.C_SHOOT,
          origin: shot.origin,
          direction: shot.direction,
          shotId: shot.shotId,
          spreadSeed: shot.spreadSeed,
          timestamp: now,
        });
      }
    }

    // Update store with predicted local state
    useGameStore.getState().setLocalPlayer({
      ...nextLocalPlayer,
      position: collResult.position,
      velocity: collResult.velocity,
      grounded: collResult.grounded,
      crouching: moveResult.crouching,
      sprinting: moveResult.sprinting,
      sliding: moveResult.sliding,
      aiming: input.aim,
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
  const graphicsQuality = useGameStore((state) => state.graphicsQuality);
  const remoteIds = Array.from(remotePlayers.keys());
  const renderConfig =
    graphicsQuality === "low"
      ? {
          dpr: [0.75, 1] as [number, number],
          antialias: false,
          shadows: false,
          shadowMapSize: 512,
          fogFar: 80,
        }
      : graphicsQuality === "medium"
        ? {
            dpr: [1, 1.5] as [number, number],
            antialias: true,
            shadows: true,
            shadowMapSize: 1024,
            fogFar: 100,
          }
        : {
            dpr: [1, 2] as [number, number],
            antialias: true,
            shadows: true,
            shadowMapSize: 2048,
            fogFar: 120,
          };

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
        shadows={renderConfig.shadows}
        dpr={renderConfig.dpr}
        gl={{
          antialias: renderConfig.antialias,
          powerPreference: "high-performance",
        }}
        camera={{ fov: 90, near: 0.1, far: 1000 }}
      >
        {/* Lights */}
        <ambientLight intensity={0.75} />
        <directionalLight
          position={[15, 30, 15]}
          intensity={1.8}
          castShadow={renderConfig.shadows}
          shadow-mapSize-width={renderConfig.shadowMapSize}
          shadow-mapSize-height={renderConfig.shadowMapSize}
        />

        {/* Sky styling matching sky color */}
        <color attach="background" args={["#0b0d19"]} />
        <fog attach="fog" args={["#0b0d19", 40, renderConfig.fogFar]} />

        {/* Arena static geometry */}
        <ArenaMap />

        {/* First Person Camera */}
        <FPSCamera />
        <WeaponViewModel />

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
