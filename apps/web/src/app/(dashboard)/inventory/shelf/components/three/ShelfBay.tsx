'use client';

import { useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
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
 *   - Inventory hover: glows brighter if occupied, shows tooltip on hover
 */

const LEVEL_ORDER = ['G', 'M', 'T'];

// ═══════════ Inventory Item Type ═══════════
export interface InventoryHoverItem {
  sku: string;
  qtyPerBox: number;
  numOfBox: number;
  totalQty: number;
}

export interface LocationInventoryData {
  items: InventoryHoverItem[];
}

// Map key format: "aisle_bay_level_bin_slot"
export type InventoryIndex = Map<string, LocationInventoryData>;

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
  inventoryIndex?: InventoryIndex;
  onHover?: (data: LocationInventoryData | null, label: string) => void;
}

/** V1 parity: individual colored block with wireframe edges + hover */
function ShelfBlock({
  w, h, d, position, color, hasInventory, inventoryData, locationLabel, onHover,
}: {
  w: number; h: number; d: number;
  position: [number, number, number];
  color: number;
  hasInventory?: boolean;
  inventoryData?: LocationInventoryData;
  locationLabel?: string;
  onHover?: (data: LocationInventoryData | null, label: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const edgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d);
    return new THREE.EdgesGeometry(box);
  }, [w, h, d]);

  // ALL blocks are solid full-color — no transparency, no dimming
  const displayColor = useMemo(() => {
    if (hovered) return 0xffffff;
    return color; // Full level color for all blocks
  }, [color, hovered]);

  const emissive = useMemo(() => {
    if (hovered) return new THREE.Color(color).multiplyScalar(0.5).getHex();
    if (hasInventory) return new THREE.Color(color).multiplyScalar(0.2).getHex();
    return 0x000000;
  }, [color, hasInventory, hovered]);

  const handlePointerOver = useCallback((e: THREE.Event) => {
    (e as any).stopPropagation?.();
    setHovered(true);
    if (onHover && inventoryData && locationLabel) {
      onHover(inventoryData, locationLabel);
    }
  }, [onHover, inventoryData, locationLabel]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    if (onHover) onHover(null, '');
  }, [onHover]);

  return (
    <group position={position}>
      <mesh
        castShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[w, h, d]} />
        <meshLambertMaterial
          color={displayColor}
          emissive={emissive}
        />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={hovered ? 0xffffff : 0x000000} transparent opacity={hovered ? 0.8 : 0.3} />
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
  inventoryIndex,
  onHover,
}: ShelfBayProps) {
  const smallGap = 0.05;

  const lookupInventory = useCallback((level: string, binKey?: string, slotKey?: string) => {
    if (!inventoryIndex) return undefined;
    // Try exact key first
    const key = `${side}_${bayNum}_${level}_${binKey || ''}_${slotKey || ''}`;
    const result = inventoryIndex.get(key);
    if (result) return result;
    // Fallback: try bin-level key (when CSV has no slot info, data is aggregated at bin level)
    if (slotKey && binKey) {
      const binLevelKey = `${side}_${bayNum}_${level}_${binKey}_`;
      return inventoryIndex.get(binLevelKey);
    }
    return undefined;
  }, [inventoryIndex, side, bayNum]);

  const makeLabel = useCallback((level: string, binKey?: string, slotKey?: string) => {
    let label = `${side}-${bayNum}-${level}`;
    if (binKey) label += `-${binKey}`;
    if (slotKey) label += `-${slotKey}`;
    return label;
  }, [side, bayNum]);

  return (
    <group position={position}>
      {/* Render each level from bottom to top */}
      {LEVEL_ORDER.map((level, li) => {
        if (!levels.includes(level)) return null;
        
        const enabledIndex = levels.filter(l => 
          LEVEL_ORDER.indexOf(l) <= LEVEL_ORDER.indexOf(level)
        ).length - 1;

        const y = shelfHeight / 2 + 0.1 + enabledIndex * (shelfHeight + 0.1);
        const baseColor = LEVEL_COLORS_HEX[level] || 0xcccccc;

        if (binCount === 0) {
          const inv = lookupInventory(level);
          const label = makeLabel(level);
          return (
            <ShelfBlock
              key={`level-${bayIndex}-${level}`}
              w={shelfWidth}
              h={shelfHeight}
              d={shelfDepth}
              position={[0, y, 0]}
              color={baseColor}
              hasInventory={inv !== undefined && inv.items.length > 0}
              inventoryData={inv}
              locationLabel={label}
              onHover={onHover}
            />
          );
        }

        // Case B: Split by Bins
        const binKeys = binCount === 2 ? ['L', 'R'] : Array.from({ length: binCount }, (_, i) => String(i + 1));
        const binDepthEach = shelfDepth / binKeys.length;
        const startZ = -shelfDepth / 2;

        return (
          <group key={`level-${bayIndex}-${level}`}>
            {binKeys.map((binKey, bIdx) => {
              const binZCenter = startZ + bIdx * binDepthEach + binDepthEach / 2;

              if (slotCount === 0) {
                const inv = lookupInventory(level, binKey);
                const label = makeLabel(level, binKey);
                return (
                  <ShelfBlock
                    key={`bin-${bayIndex}-${level}-${binKey}`}
                    w={shelfWidth}
                    h={shelfHeight}
                    d={binDepthEach - smallGap}
                    position={[0, y, binZCenter]}
                    color={baseColor}
                    hasInventory={inv !== undefined && inv.items.length > 0}
                    inventoryData={inv}
                    locationLabel={label}
                    onHover={onHover}
                  />
                );
              }

              // Case C: Split by Slots
              const slotKeys = slotCount === 2 ? ['L', 'R'] : Array.from({ length: slotCount }, (_, i) => String(i + 1));
              const slotDepthEach = binDepthEach / slotKeys.length;
              const binZStart = startZ + bIdx * binDepthEach;

              return (
                <group key={`bin-${bayIndex}-${level}-${binKey}`}>
                  {slotKeys.map((slotKey, sIdx) => {
                    const slotZCenter = binZStart + sIdx * slotDepthEach + slotDepthEach / 2;
                    const inv = lookupInventory(level, binKey, slotKey);
                    const label = makeLabel(level, binKey, slotKey);
                    return (
                      <ShelfBlock
                        key={`slot-${bayIndex}-${level}-${binKey}-${slotKey}`}
                        w={shelfWidth}
                        h={shelfHeight}
                        d={slotDepthEach - smallGap}
                        position={[0, y, slotZCenter]}
                        color={baseColor}
                        hasInventory={inv !== undefined && inv.items.length > 0}
                        inventoryData={inv}
                        locationLabel={label}
                        onHover={onHover}
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
