'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ShelfBay } from './ShelfBay';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import type { AisleConfig, WarehouseNode } from '@/lib/api/inventory';
import type { InventoryIndex, LocationInventoryData } from './ShelfBay';

/**
 * V1-PARITY Warehouse Scene (Theme-Aware)
 * 
 * Dark mode: original V1 colors (dark floor, white labels)
 * Light mode: bright floor, dark labels, lighter environment
 */

// ═══════════ V1 Constants ═══════════
const WH_WIDTH = 10;
const WALKWAY_WIDTH = 2.0;
const ENTRANCE_DEPTH = 2.0;
const SHELF_HEIGHT = 1.0;
const SHELF_GAP = 0.5;

// ═══════════ Theme-dependent 3D colors ═══════════
const SCENE_COLORS = {
  dark: {
    canvasBg: '#1a1d24',
    floor: 0x2a3540,
    walkway: 0x5a5a4a,
    wireframe: 0x4a90d9,
    entry: 0x6aaf6a,
    labelBg: 'rgba(0,0,0,0.6)',
    labelDefault: 0xffffff,
    labelAisle: 0xffff00,
    labelEntry: 0x00ff00,
    edgeColor: 0x000000,
    legendBg: 'rgba(0,0,0,0.7)',
    legendText: 'rgba(255,255,255,0.7)',
    legendTextDim: 'rgba(255,255,255,0.4)',
    tooltipBg: 'rgba(20, 24, 32, 0.95)',
    tooltipBorder: 'rgba(255,255,255,0.15)',
    tooltipLabel: 'rgba(255,255,255,0.5)',
    tooltipQty: '#ffffff',
    tooltipSub: 'rgba(255,255,255,0.4)',
    tooltipSep: 'rgba(255,255,255,0.08)',
  },
  light: {
    canvasBg: '#e4e6ea',
    floor: 0xc0c8d4,
    walkway: 0xb0b0a8,
    wireframe: 0x5a8cc0,
    entry: 0x5a9a5a,
    labelBg: 'rgba(255,255,255,0.85)',
    labelDefault: 0x333333,
    labelAisle: 0x806600,
    labelEntry: 0x1a7a1a,
    edgeColor: 0x666666,
    legendBg: 'rgba(255,255,255,0.9)',
    legendText: 'rgba(0,0,0,0.65)',
    legendTextDim: 'rgba(0,0,0,0.35)',
    tooltipBg: 'rgba(255, 255, 255, 0.96)',
    tooltipBorder: 'rgba(0,0,0,0.12)',
    tooltipLabel: 'rgba(0,0,0,0.45)',
    tooltipQty: '#1a1a1a',
    tooltipSub: 'rgba(0,0,0,0.35)',
    tooltipSep: 'rgba(0,0,0,0.08)',
  },
};

// ═══════════ Sprite Label (Theme-Aware) ═══════════
function SpriteLabel({
  text, position, color = 0xffffff, scale = 1.2, bgColor = 'rgba(0,0,0,0.6)',
}: {
  text: string;
  position: [number, number, number];
  color?: number;
  scale?: number;
  bgColor?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 128;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 56px Arial';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
    return new THREE.CanvasTexture(canvas);
  }, [text, color, bgColor]);

  return (
    <sprite position={position} scale={[scale * 2.5, scale * 1.25, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

// ═══════════ Wire Border ═══════════
function WireBorder({ w, h, d, position, color = 0x4a90d9 }: {
  w: number; h: number; d: number;
  position: [number, number, number];
  color?: number;
}) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  return (
    <lineSegments geometry={geo} position={position}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

// ═══════════ Data interfaces ═══════════
interface WarehouseSceneProps {
  aisles?: AisleConfig[];
  warehouseData?: WarehouseNode;
  mini?: boolean;
  inventoryIndex?: InventoryIndex;
  showInventory?: boolean;
  onHoverLocation?: (data: LocationInventoryData | null, label: string) => void;
}

interface AisleRenderData {
  side: string;
  bays: Array<{
    bayNum: number;
    levels: string[];
    binCount: number;
    slotCount: number;
  }>;
}

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

// ═══════════ 3D Tooltip Component (Theme-Aware) ═══════════
function InventoryTooltip({ data, label, sceneColors }: {
  data: LocationInventoryData;
  label: string;
  sceneColors: typeof SCENE_COLORS.dark;
}) {
  return (
    <div style={{
      position: 'absolute',
      transform: 'translate(-50%, -120%)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 9999,
    }}>
      <div style={{
        background: sceneColors.tooltipBg,
        backdropFilter: 'blur(12px)',
        border: `1px solid ${sceneColors.tooltipBorder}`,
        borderRadius: '12px',
        padding: '10px 14px',
        minWidth: '180px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: '10px', color: sceneColors.tooltipLabel, marginBottom: '6px', fontWeight: 600 }}>
          📍 {label}
        </div>
        {data.items.map((item, idx) => (
          <div key={idx} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            padding: '4px 0',
            borderTop: idx > 0 ? `1px solid ${sceneColors.tooltipSep}` : 'none',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#3b82f6' }}>
              {item.sku}
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: sceneColors.tooltipQty }}>{item.totalQty}</div>
              <div style={{ fontSize: '9px', color: sceneColors.tooltipSub }}>
                {item.qtyPerBox}×{item.numOfBox}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════ Main Scene Content (Theme-Aware) ═══════════
function WarehouseContent({ renderData, mini, inventoryIndex, showInventory, onHoverChange, sc }: {
  renderData: AisleRenderData[];
  mini?: boolean;
  inventoryIndex?: InventoryIndex;
  showInventory?: boolean;
  onHoverChange?: (data: LocationInventoryData | null, label: string) => void;
  sc: typeof SCENE_COLORS.dark;
}) {
  const hasL = renderData.some(a => a.side === 'L');
  const hasR = renderData.some(a => a.side === 'R');
  const bayCountL = renderData.find(a => a.side === 'L')?.bays.length || 0;
  const bayCountR = renderData.find(a => a.side === 'R')?.bays.length || 0;
  const maxBays = Math.max(bayCountL, bayCountR, 1);

  const shelfWidth = (WH_WIDTH - WALKWAY_WIDTH) / 2 - 0.2;
  const shelfDepth = 6.0;
  const shelfZoneLength = maxBays * shelfDepth + Math.max(0, maxBays - 1) * SHELF_GAP;
  const whDepth = shelfZoneLength + ENTRANCE_DEPTH;

  const backWallZ = -whDepth / 2;
  const shelfStartZ = backWallZ + shelfDepth / 2;

  const xL = -(WH_WIDTH / 2 - shelfWidth / 2 - 0.1);
  const xR = WH_WIDTH / 2 - shelfWidth / 2 - 0.1;

  const entryZ = whDepth / 2 - ENTRANCE_DEPTH / 2;
  const labelZ = whDepth / 2;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 15, 10]} intensity={0.8} castShadow />

      {/* Floor */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[WH_WIDTH, 0.2, whDepth]} />
        <meshLambertMaterial color={sc.floor} />
      </mesh>

      {/* Wireframe border */}
      <WireBorder w={WH_WIDTH} h={0.5} d={whDepth} position={[0, 0.25, 0]} color={sc.wireframe} />

      {/* Walkway */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[WALKWAY_WIDTH, 0.02, whDepth]} />
        <meshLambertMaterial color={sc.walkway} />
      </mesh>
      <SpriteLabel text="Aisle" position={[0, 1, 0]} color={sc.labelAisle} bgColor={sc.labelBg} />

      {/* Entry zone */}
      <mesh position={[0, 0.08, entryZ]}>
        <boxGeometry args={[WH_WIDTH / 2, 0.15, ENTRANCE_DEPTH * 0.8]} />
        <meshLambertMaterial color={sc.entry} />
      </mesh>
      <SpriteLabel text="Entry" position={[0, 0.8, entryZ]} color={sc.labelEntry} bgColor={sc.labelBg} />

      {/* L aisle shelves */}
      {hasL && (
        <>
          <SpriteLabel text="Aisle: L" position={[xL, 3.0, labelZ]} color={sc.labelDefault} scale={0.9} bgColor={sc.labelBg} />
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
                  inventoryIndex={showInventory ? inventoryIndex : undefined}
                  onHover={showInventory ? onHoverChange : undefined}
                />
                {!mini && (
                  <SpriteLabel
                    text={`Bay: ${bay.bayNum}`}
                    position={[xL, bay.levels.length * (SHELF_HEIGHT + 0.1) + 0.7, zPos]}
                    color={sc.labelDefault}
                    scale={0.6}
                    bgColor={sc.labelBg}
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
          <SpriteLabel text="Aisle: R" position={[xR, 3.0, labelZ]} color={sc.labelDefault} scale={0.9} bgColor={sc.labelBg} />
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
                  inventoryIndex={showInventory ? inventoryIndex : undefined}
                  onHover={showInventory ? onHoverChange : undefined}
                />
                {!mini && (
                  <SpriteLabel
                    text={`Bay: ${bay.bayNum}`}
                    position={[xR, bay.levels.length * (SHELF_HEIGHT + 0.1) + 0.7, zPos]}
                    color={sc.labelDefault}
                    scale={0.6}
                    bgColor={sc.labelBg}
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
export function WarehouseScene({ aisles, warehouseData, mini = false, inventoryIndex, showInventory = false, onHoverLocation }: WarehouseSceneProps) {
  const { theme } = useTheme();
  const sc = SCENE_COLORS[theme] || SCENE_COLORS.dark;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleHoverChange = useCallback((data: LocationInventoryData | null, label: string) => {
    onHoverLocation?.(data, label);
  }, [onHoverLocation]);

  const renderData = useMemo(() => {
    if (warehouseData) return treeToRenderData(warehouseData);
    if (aisles) return configToRenderData(aisles);
    return [];
  }, [aisles, warehouseData]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: mini ? 160 : 300 }}>
      <Canvas
        camera={{
          position: [0, 15, 18],
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
        style={{ background: sc.canvasBg }}
      >
        <WarehouseContent
          renderData={renderData}
          mini={mini}
          inventoryIndex={inventoryIndex}
          showInventory={showInventory}
          onHoverChange={handleHoverChange}
          sc={sc}
        />
      </Canvas>

      {/* Legend overlay — inventory mode only */}
      {showInventory && !mini && (
        <div className="absolute bottom-3 left-3 flex items-center gap-4 px-3 py-2 rounded-lg"
          style={{ background: sc.legendBg, backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: '#4CAF50', opacity: 1 }} />
            <span className="text-[10px]" style={{ color: sc.legendText }}>Has Inventory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: '#888', opacity: 0.5 }} />
            <span className="text-[10px]" style={{ color: sc.legendText }}>Empty</span>
          </div>
          <span className="text-[10px]" style={{ color: sc.legendTextDim }}>Hover to inspect</span>
        </div>
      )}
    </div>
  );
}
