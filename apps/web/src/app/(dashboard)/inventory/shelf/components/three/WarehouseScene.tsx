'use client';

import { useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { ShelfBay } from './ShelfBay';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { AisleConfig, WarehouseNode, AisleNode } from '@/lib/api/inventory';

/**
 * V1-PARITY Warehouse Scene
 * 
 * Exact V1 warehouse visualization:
 *   - Dark floor (0x2a3540)
 *   - Blue wireframe border (0x4a90d9)
 *   - Yellow walkway aisle + label
 *   - Green entry zone + label
 *   - L/R shelf aisles from back wall to entry
 *   - Canvas sprite labels for Bay, Bin L/R, Aisle: L/R
 *   - Level colors: G=#4CAF50, M=#2196F3, T=#FF9800
 */

// ═══════════ V1 Constants ═══════════
const WH_WIDTH = 10;
const WALKWAY_WIDTH = 2.0;
const ENTRANCE_DEPTH = 2.0;
const SHELF_HEIGHT = 1.0;
const SHELF_GAP = 0.5;

// ═══════════ Sprite Label (V1 createLabel parity) ═══════════
function SpriteLabel({
  text, position, color = 0xffffff, scale = 1.2,
}: {
  text: string;
  position: [number, number, number];
  color?: number;
  scale?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 128;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 56px Arial';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
    return new THREE.CanvasTexture(canvas);
  }, [text, color]);

  return (
    <sprite position={position} scale={[scale * 2.5, scale * 1.25, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

// ═══════════ Wire Border (V1 parity) ═══════════
function WireBorder({ w, h, d, position }: { w: number; h: number; d: number; position: [number, number, number] }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  return (
    <lineSegments geometry={geo} position={position}>
      <lineBasicMaterial color={0x4a90d9} />
    </lineSegments>
  );
}

// ═══════════ Data interfaces ═══════════
interface WarehouseSceneProps {
  aisles?: AisleConfig[];     // For wizard preview (uniform config)
  warehouseData?: WarehouseNode;  // For list view (full tree data)
  mini?: boolean;
}

interface AisleRenderData {
  side: string;     // 'L' or 'R'
  bays: Array<{
    bayNum: number;
    levels: string[];
    binCount: number;
    slotCount: number;
  }>;
}

// ═══════════ Convert AisleConfig[] → AisleRenderData[] ═══════════
function configToRenderData(aisles: AisleConfig[]): AisleRenderData[] {
  return aisles.map(a => ({
    side: a.aisle,
    bays: Array.from({ length: a.bayConfig.bayCount }, (_, i) => ({
      bayNum: i + 1,
      levels: a.bayConfig.levels,
      binCount: a.bayConfig.binCount,
      slotCount: a.bayConfig.slotCount,
    })),
  }));
}

// ═══════════ Convert WarehouseNode → AisleRenderData[] ═══════════
function treeToRenderData(warehouse: WarehouseNode): AisleRenderData[] {
  return warehouse.aisles.map(a => ({
    side: a.aisle,
    bays: a.bays.map(b => ({
      bayNum: b.bay,
      levels: b.levels.map(l => l.level),
      binCount: b.levels[0]?.bins?.length || 0,
      slotCount: b.levels[0]?.bins?.[0]?.slots?.length || 0,
    })),
  }));
}

// ═══════════ Main Scene Content ═══════════
function WarehouseContent({ renderData, mini }: { renderData: AisleRenderData[]; mini?: boolean }) {
  const hasL = renderData.some(a => a.side === 'L');
  const hasR = renderData.some(a => a.side === 'R');
  const bayCountL = renderData.find(a => a.side === 'L')?.bays.length || 0;
  const bayCountR = renderData.find(a => a.side === 'R')?.bays.length || 0;
  const maxBays = Math.max(bayCountL, bayCountR, 1);

  // V1 parity: shelf dimensions
  const shelfWidth = (WH_WIDTH - WALKWAY_WIDTH) / 2 - 0.2;
  const shelfDepth = 6.0;
  const shelfZoneLength = maxBays * shelfDepth + Math.max(0, maxBays - 1) * SHELF_GAP;
  const whDepth = shelfZoneLength + ENTRANCE_DEPTH;

  const backWallZ = -whDepth / 2;
  const shelfStartZ = backWallZ + shelfDepth / 2;

  // Shelf X positions: hugging left/right walls
  const xL = -(WH_WIDTH / 2 - shelfWidth / 2 - 0.1);
  const xR = WH_WIDTH / 2 - shelfWidth / 2 - 0.1;

  const entryZ = whDepth / 2 - ENTRANCE_DEPTH / 2;
  const labelZ = whDepth / 2;

  return (
    <>
      {/* Lighting (V1 parity) */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 15, 10]} intensity={0.8} castShadow />

      {/* Floor (V1: 0x2a3540) */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[WH_WIDTH, 0.2, whDepth]} />
        <meshLambertMaterial color={0x2a3540} />
      </mesh>

      {/* Blue wireframe border (V1 parity) */}
      <WireBorder w={WH_WIDTH} h={0.5} d={whDepth} position={[0, 0.25, 0]} />

      {/* Walkway (V1: 0x5a5a4a) */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[WALKWAY_WIDTH, 0.02, whDepth]} />
        <meshLambertMaterial color={0x5a5a4a} />
      </mesh>
      <SpriteLabel text="Aisle" position={[0, 1, 0]} color={0xffff00} />

      {/* Entry zone (V1: 0x6aaf6a) */}
      <mesh position={[0, 0.08, entryZ]}>
        <boxGeometry args={[WH_WIDTH / 2, 0.15, ENTRANCE_DEPTH * 0.8]} />
        <meshLambertMaterial color={0x6aaf6a} />
      </mesh>
      <SpriteLabel text="Entry" position={[0, 0.8, entryZ]} color={0x00ff00} />

      {/* L aisle shelves */}
      {hasL && (
        <>
          <SpriteLabel text="Aisle: L" position={[xL, 3.0, labelZ]} color={0xffffff} scale={0.9} />
          {renderData.find(a => a.side === 'L')!.bays.map((bay, idx) => {
            const zPos = shelfStartZ + idx * (shelfDepth + SHELF_GAP);
            return (
              <group key={`bay-L-${bay.bayNum}`}>
                <ShelfBay
                  position={[xL, 0, zPos]}
                  levels={bay.levels}
                  bayIndex={idx}
                  bayNum={bay.bayNum}
                  side="L"
                  binCount={bay.binCount}
                  slotCount={bay.slotCount}
                  shelfWidth={shelfWidth}
                  shelfDepth={shelfDepth}
                  shelfHeight={SHELF_HEIGHT}
                />
                {/* Bay label */}
                {!mini && (
                  <SpriteLabel
                    text={`Bay: ${bay.bayNum}`}
                    position={[xL, bay.levels.length * (SHELF_HEIGHT + 0.1) + 0.7, zPos]}
                    color={0xffffff}
                    scale={0.6}
                  />
                )}
              </group>
            );
          })}
        </>
      )}

      {/* R aisle shelves */}
      {hasR && (
        <>
          <SpriteLabel text="Aisle: R" position={[xR, 3.0, labelZ]} color={0xffffff} scale={0.9} />
          {renderData.find(a => a.side === 'R')!.bays.map((bay, idx) => {
            const zPos = shelfStartZ + idx * (shelfDepth + SHELF_GAP);
            return (
              <group key={`bay-R-${bay.bayNum}`}>
                <ShelfBay
                  position={[xR, 0, zPos]}
                  levels={bay.levels}
                  bayIndex={idx}
                  bayNum={bay.bayNum}
                  side="R"
                  binCount={bay.binCount}
                  slotCount={bay.slotCount}
                  shelfWidth={shelfWidth}
                  shelfDepth={shelfDepth}
                  shelfHeight={SHELF_HEIGHT}
                />
                {/* Bay label */}
                {!mini && (
                  <SpriteLabel
                    text={`Bay: ${bay.bayNum}`}
                    position={[xR, bay.levels.length * (SHELF_HEIGHT + 0.1) + 0.7, zPos]}
                    color={0xffffff}
                    scale={0.6}
                  />
                )}
              </group>
            );
          })}
        </>
      )}

      {/* Camera controls */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.1}
        minDistance={5}
        maxDistance={50}
      />
    </>
  );
}

// ═══════════ Exported Component ═══════════
export function WarehouseScene({ aisles, warehouseData, mini = false }: WarehouseSceneProps) {
  const { theme } = useTheme();

  const renderData = useMemo(() => {
    if (warehouseData) return treeToRenderData(warehouseData);
    if (aisles) return configToRenderData(aisles);
    return [];
  }, [aisles, warehouseData]);

  // V1 parity: background 0x1a1d24
  return (
    <div className="w-full h-full" style={{ minHeight: mini ? 160 : 300 }}>
      <Canvas
        camera={{
          position: [0, 15, 18],
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
        style={{ background: '#1a1d24' }}
      >
        <WarehouseContent renderData={renderData} mini={mini} />
      </Canvas>
    </div>
  );
}
