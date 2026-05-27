// ========================================
// Client-Side Map Scene Component
// Renders static map boxes with premium cyberpunk styling and grid overlays
// ========================================

import React from "react";
import { ARENA_MAP } from "@shared/maps/arena.js";
import type { AABB } from "@shared/types/index.js";
import { Edges, Grid } from "@react-three/drei";

function getBoxMaterialProps(index: number): {
  color: string;
  roughness: number;
  metalness: number;
} {
  // Classification based on index in ARENA_MAP.boxes array
  if (index === 0) {
    // Floor
    return { color: "#181b30", roughness: 0.8, metalness: 0.1 };
  }
  if (index >= 1 && index <= 4) {
    // Perimeter Walls
    return { color: "#222642", roughness: 0.7, metalness: 0.2 };
  }
  if (index === 5) {
    // Central Tower
    return { color: "#7c2a35", roughness: 0.6, metalness: 0.4 };
  }
  if (index >= 6 && index <= 9) {
    // Low Cover Blocks
    return { color: "#d98236", roughness: 0.5, metalness: 0.1 };
  }
  if (index >= 10 && index <= 11) {
    // Large Cover Blocks
    return { color: "#d95332", roughness: 0.5, metalness: 0.1 };
  }
  if (index === 12 || index === 15) {
    // Platforms NE / SW
    return { color: "#2a727a", roughness: 0.5, metalness: 0.3 };
  }
  if ((index >= 13 && index <= 14) || (index >= 16 && index <= 17)) {
    // Steps NE / SW
    return { color: "#3b526d", roughness: 0.6, metalness: 0.2 };
  }
  if (index >= 18 && index <= 19) {
    // Jump Blocks
    return { color: "#275ca3", roughness: 0.4, metalness: 0.4 };
  }
  if (index >= 20 && index <= 21) {
    // Small Crates
    return { color: "#7d532c", roughness: 0.9, metalness: 0.0 };
  }
  // Mid-height walls / Sight walls
  return { color: "#475569", roughness: 0.7, metalness: 0.2 };
}

export const ArenaMap = React.memo(() => {
  return (
    <group>
      {/* Dynamic Grid on floor */}
      <Grid
        position={[0, 0.01, 0]}
        args={[10.5, 10.5]}
        cellSize={2}
        cellThickness={0.8}
        cellColor="#343f66"
        sectionSize={10}
        sectionThickness={1.5}
        sectionColor="#637bc2"
        fadeDistance={40}
        infiniteGrid
      />

      {/* Map Boxes */}
      {ARENA_MAP.boxes.map((box: AABB, index: number) => {
        // Calculate center position and scale dimensions
        const sizeX = box.max.x - box.min.x;
        const sizeY = box.max.y - box.min.y;
        const sizeZ = box.max.z - box.min.z;

        const posX = box.min.x + sizeX / 2;
        const posY = box.min.y + sizeY / 2;
        const posZ = box.min.z + sizeZ / 2;

        const mat = getBoxMaterialProps(index);

        // Don't render the bottom floor as a visible block if we have the Grid,
        // but we need it for floor coloring. We will draw it.
        return (
          <mesh key={index} position={[posX, posY, posZ]}>
            <boxGeometry args={[sizeX, sizeY, sizeZ]} />
            <meshStandardMaterial
              color={mat.color}
              roughness={mat.roughness}
              metalness={mat.metalness}
              flatShading
            />
            {/* Outline wireframe edges for definition */}
            <Edges threshold={15} color={index === 0 ? "#1f2438" : "#2d335c"} />
          </mesh>
        );
      })}
    </group>
  );
});

ArenaMap.displayName = "ArenaMap";
