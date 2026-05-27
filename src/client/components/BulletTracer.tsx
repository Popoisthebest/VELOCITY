// ========================================
// Client-Side Bullet Traces & Hit Sparks
// High-performance pre-allocated object pool for visual combat FX
// ========================================

import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Vec3 } from "@shared/types/index.js";
import * as THREE from "three";

interface TracerFX {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  startTime: number;
  duration: number;
  active: boolean;
}

interface SparkFX {
  position: THREE.Vector3;
  startTime: number;
  duration: number;
  active: boolean;
}

const POOL_SIZE = 25;
const tracersPool: TracerFX[] = Array.from({ length: POOL_SIZE }, () => ({
  origin: new THREE.Vector3(),
  target: new THREE.Vector3(),
  startTime: 0,
  duration: 150, // ms
  active: false,
}));

const sparksPool: SparkFX[] = Array.from({ length: POOL_SIZE }, () => ({
  position: new THREE.Vector3(),
  startTime: 0,
  duration: 200, // ms
  active: false,
}));

let currentTracerIndex = 0;
let currentSparkIndex = 0;

/**
 * Global function to emit a tracer line and hit spark.
 * Can be imported and called from anywhere (e.g. ShootingSystem, NetworkClient).
 */
export function addVisualTracer(origin: Vec3, target: Vec3): void {
  // Setup tracer
  const tracer = tracersPool[currentTracerIndex];
  tracer.origin.set(origin.x, origin.y, origin.z);
  tracer.target.set(target.x, target.y, target.z);
  tracer.startTime = Date.now();
  tracer.active = true;
  currentTracerIndex = (currentTracerIndex + 1) % POOL_SIZE;

  // Setup spark
  const spark = sparksPool[currentSparkIndex];
  spark.position.set(target.x, target.y, target.z);
  spark.startTime = Date.now();
  spark.active = true;
  currentSparkIndex = (currentSparkIndex + 1) % POOL_SIZE;
}

export function BulletTracers() {
  const groupRef = useRef<THREE.Group>(null);
  const tracerMeshes = useRef<(THREE.Line | null)[]>([]);
  const sparkMeshes = useRef<(THREE.Mesh | null)[]>([]);

  // Create empty arrays to map in React rendering
  const dummyArray = Array.from({ length: POOL_SIZE });

  useFrame(() => {
    const now = Date.now();

    // Update Tracers
    for (let i = 0; i < POOL_SIZE; i++) {
      const data = tracersPool[i];
      const mesh = tracerMeshes.current[i];

      if (mesh) {
        if (data.active) {
          const elapsed = now - data.startTime;
          if (elapsed >= data.duration) {
            data.active = false;
            mesh.visible = false;
          } else {
            mesh.visible = true;
            // Update points in buffer geometry
            const posAttr = mesh.geometry.getAttribute(
              "position",
            ) as THREE.BufferAttribute;
            posAttr.setXYZ(0, data.origin.x, data.origin.y, data.origin.z);
            posAttr.setXYZ(1, data.target.x, data.target.y, data.target.z);
            posAttr.needsUpdate = true;

            // Fade opacity
            const mat = mesh.material as THREE.LineBasicMaterial;
            mat.opacity = 1.0 - elapsed / data.duration;
          }
        } else {
          mesh.visible = false;
        }
      }
    }

    // Update Sparks
    for (let i = 0; i < POOL_SIZE; i++) {
      const data = sparksPool[i];
      const mesh = sparkMeshes.current[i];

      if (mesh) {
        if (data.active) {
          const elapsed = now - data.startTime;
          if (elapsed >= data.duration) {
            data.active = false;
            mesh.visible = false;
          } else {
            mesh.visible = true;
            mesh.position.copy(data.position);

            // Expand and fade out spark sphere
            const t = elapsed / data.duration;
            const scale = 0.15 + t * 0.4;
            mesh.scale.set(scale, scale, scale);

            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = 1.0 - t;
          }
        } else {
          mesh.visible = false;
        }
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Tracers rendering */}
      {dummyArray.map((_, i) => {
        // Pre-allocate buffer geometries
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(6); // 2 points * 3 components
        geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        return (
          <line
            key={`t_${i}`}
            ref={(el) => {
              tracerMeshes.current[i] = el;
            }}
            geometry={geom}
          >
            <lineBasicMaterial
              color="#fbbf24" // amber yellow tracer
              transparent
              opacity={1}
              depthWrite={false}
            />
          </line>
        );
      })}

      {/* Sparks rendering */}
      {dummyArray.map((_, i) => (
        <mesh
          key={`s_${i}`}
          ref={(el) => {
            sparkMeshes.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.5, 4, 4]} />
          <meshBasicMaterial
            color="#ef4444" // orange-red spark flash
            transparent
            opacity={1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
