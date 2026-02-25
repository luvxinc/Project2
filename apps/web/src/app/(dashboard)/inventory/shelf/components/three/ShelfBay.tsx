'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { LEVEL_COLORS_HEX } from '../../constants';

/**
 * V1-PARITY Shelf Bay Component
 * 
 * Geometry Split Logic (exact V1 match):
 *   Case A: Whole Level (no bins) → single block
 *   Case B: Split by Bins (Z-axis) → binCount sub-blocks
 *   Case C: Split by Slots (Z-axis nested) → slot sub-blocks within each bin
 *
 * Each block has:
 *   - MeshLambertMaterial with level color
 *   - EdgesGeometry black wireframe (V1 parity)
 */

const LEVEL_ORDER = ['G', 'M', 'T'];

interface ShelfBayProps {
  position: [number, number, number];
  levels: string[];
  bayIndex: number;
  bayNum: number;
  side: string;
  binCount: number;
  slotCount: number;
  shelfWidth: number;
  shelfDepth: number;
  shelfHeight: number;
}

/** V1 parity: individual colored block with wireframe edges */
function ShelfBlock({
  w, h, d, position, color,
}: {
  w: number; h: number; d: number;
  position: [number, number, number];
  color: number;
}) {
  const edgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d);
    return new THREE.EdgesGeometry(box);
  }, [w, h, d]);

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={0x000000} transparent opacity={0.3} />
      </lineSegments>
    </group>
  );
}

export function ShelfBay({
  position,
  levels,
  bayIndex,
  bayNum,
  side,
  binCount,
  slotCount,
  shelfWidth,
  shelfDepth,
  shelfHeight,
}: ShelfBayProps) {
  const smallGap = 0.05;

  return (
    <group position={position}>
      {/* Render each level from bottom to top */}
      {LEVEL_ORDER.map((level, li) => {
        if (!levels.includes(level)) return null;
        
        // Count actual position of this level among enabled levels
        const enabledIndex = levels.filter(l => 
          LEVEL_ORDER.indexOf(l) <= LEVEL_ORDER.indexOf(level)
        ).length - 1;

        const y = shelfHeight / 2 + 0.1 + enabledIndex * (shelfHeight + 0.1);
        const baseColor = LEVEL_COLORS_HEX[level] || 0xcccccc;

        if (binCount === 0) {
          // Case A: Whole Level
          return (
            <ShelfBlock
              key={`level-${bayIndex}-${level}`}
              w={shelfWidth}
              h={shelfHeight}
              d={shelfDepth}
              position={[0, y, 0]}
              color={baseColor}
            />
          );
        }

        // Case B: Split by Bins (Z-axis)
        const binKeys = binCount === 2 ? ['L', 'R'] : Array.from({ length: binCount }, (_, i) => String(i + 1));
        const binDepthEach = shelfDepth / binKeys.length;
        const startZ = -shelfDepth / 2;

        return (
          <group key={`level-${bayIndex}-${level}`}>
            {binKeys.map((binKey, bIdx) => {
              const binZCenter = startZ + bIdx * binDepthEach + binDepthEach / 2;

              if (slotCount === 0) {
                return (
                  <ShelfBlock
                    key={`bin-${bayIndex}-${level}-${binKey}`}
                    w={shelfWidth}
                    h={shelfHeight}
                    d={binDepthEach - smallGap}
                    position={[0, y, binZCenter]}
                    color={baseColor}
                  />
                );
              }

              // Case C: Split by Slots (Z-axis nested)
              const slotKeys = slotCount === 2 ? ['L', 'R'] : Array.from({ length: slotCount }, (_, i) => String(i + 1));
              const slotDepthEach = binDepthEach / slotKeys.length;
              const binZStart = startZ + bIdx * binDepthEach;

              return (
                <group key={`bin-${bayIndex}-${level}-${binKey}`}>
                  {slotKeys.map((slotKey, sIdx) => {
                    const slotZCenter = binZStart + sIdx * slotDepthEach + slotDepthEach / 2;
                    return (
                      <ShelfBlock
                        key={`slot-${bayIndex}-${level}-${binKey}-${slotKey}`}
                        w={shelfWidth}
                        h={shelfHeight}
                        d={slotDepthEach - smallGap}
                        position={[0, y, slotZCenter]}
                        color={baseColor}
                      />
                    );
                  })}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
