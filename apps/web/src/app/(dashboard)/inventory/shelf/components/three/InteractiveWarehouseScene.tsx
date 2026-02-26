'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { WarehouseNode } from '@/lib/api/inventory';
import { LEVEL_COLORS_HEX } from '../../constants';

// ═══════════ V1 Constants (same as WarehouseScene) ═══════════
const WH_WIDTH = 10;
const WALKWAY_WIDTH = 2.0;
const ENTRANCE_DEPTH = 2.0;
const SHELF_HEIGHT = 1.0;
const SHELF_GAP = 0.5;
const LEVEL_ORDER = ['G', 'M', 'T'];

const SELECTED_COLOR = 0xffd700;
const SELECTED_EMISSIVE = 0xffa500;

// ═══════════ Theme colors ═══════════
const SCENE_COLORS = {
  dark: {
    canvasBg: '#1a1d24', floor: 0x2a3540, walkway: 0x5a5a4a, wireframe: 0x4a90d9, entry: 0x6aaf6a,
    labelBg: 'rgba(0,0,0,0.6)', labelDefault: 0xffffff, labelAisle: 0xffff00, labelEntry: 0x00ff00,
  },
  light: {
    canvasBg: '#e4e6ea', floor: 0xc0c8d4, walkway: 0xb0b0a8, wireframe: 0x5a8cc0, entry: 0x5a9a5a,
    labelBg: 'rgba(255,255,255,0.85)', labelDefault: 0x333333, labelAisle: 0x806600, labelEntry: 0x1a7a1a,
  },
};

interface InteractiveWarehouseSceneProps {
  warehouse: WarehouseNode;
  onSelectionChange: (locations: string[]) => void;
  selectedLocations: string[];
}

// ═══════════ SpriteLabel ═══════════
function SpriteLabel({ text, position, color = 0xffffff, scale = 1.2, bgColor = 'rgba(0,0,0,0.6)' }: {
  text: string; position: [number, number, number]; color?: number; scale?: number; bgColor?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256; canvas.height = 128;
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 56px Arial';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
    return new THREE.CanvasTexture(canvas);
  }, [text, color, bgColor]);
  return (
    <sprite position={position} scale={[scale * 2.5, scale * 1.25, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

function WireBorder({ w, h, d, position, color = 0x4a90d9 }: {
  w: number; h: number; d: number; position: [number, number, number]; color?: number;
}) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  return (<lineSegments geometry={geo} position={position}><lineBasicMaterial color={color} /></lineSegments>);
}

// ═══════════ Selectable Block ═══════════
function SelectableBlock({ w, h, d, position, color, isSelected, hovered, locationCode, onHoverIn, onHoverOut, onClick }: {
  w: number; h: number; d: number; position: [number, number, number]; color: number;
  isSelected: boolean; hovered: boolean; locationCode: string;
  onHoverIn: (code: string) => void; onHoverOut: () => void; onClick: (code: string) => void;
}) {
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  const displayColor = useMemo(() => {
    if (isSelected) return SELECTED_COLOR;
    if (hovered) return 0xffffff;
    return color;
  }, [color, isSelected, hovered]);
  const emissive = useMemo(() => {
    if (isSelected) return SELECTED_EMISSIVE;
    if (hovered) return new THREE.Color(color).multiplyScalar(0.5).getHex();
    return 0x000000;
  }, [color, isSelected, hovered]);
  const edgeColor = isSelected ? SELECTED_COLOR : hovered ? 0xffffff : 0x000000;

  return (
    <group position={position}>
      <mesh castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(locationCode);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverIn(locationCode);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverOut();
        }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshLambertMaterial color={displayColor} emissive={emissive} emissiveIntensity={isSelected ? 0.4 : hovered ? 0.2 : 0} />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={edgeColor} transparent opacity={isSelected || hovered ? 0.8 : 0.3} />
      </lineSegments>
      {hovered && (
        <Html center style={{ pointerEvents: 'none' }}>
          <div style={{ transform: 'translateY(-30px)', background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {isSelected ? '✓ ' : ''}{locationCode}
          </div>
        </Html>
      )}
    </group>
  );
}

// ═══════════ Interactive Content ═══════════
function InteractiveContent({ warehouse, selectedLocations, onToggle, sc }: {
  warehouse: WarehouseNode; selectedLocations: string[];
  onToggle: (code: string) => void; sc: typeof SCENE_COLORS.dark;
}) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const renderData = useMemo(() => warehouse.aisles.map(a => ({
    side: a.aisle,
    bays: a.bays.map(b => ({
      bayNum: b.bay,
      levels: b.levels.map(l => l.level),
      binCount: b.levels[0]?.bins?.length || 0,
      slotCount: b.levels[0]?.bins?.[0]?.slots?.length || 0,
    })),
  })), [warehouse]);

  const hasL = renderData.some(a => a.side === 'L');
  const hasR = renderData.some(a => a.side === 'R');
  const maxBays = Math.max(
    renderData.find(a => a.side === 'L')?.bays.length || 0,
    renderData.find(a => a.side === 'R')?.bays.length || 0,
    1,
  );

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
  const smallGap = 0.05;

  // ═══════════ Build per-block location codes using actual warehouse tree ═══════════
  const whName = warehouse.warehouse; // e.g. 'A005'

  const renderShelfBay = (aisle: typeof warehouse.aisles[0], idx: number, x: number) => {
    const zPos = shelfStartZ + idx * (shelfDepth + SHELF_GAP);
    const bay = aisle.bays[idx];
    if (!bay) return null;

    return (
      <group key={`bay-${aisle.aisle}-${bay.bay}`}>
        <group position={[x, 0, zPos]}>
          {LEVEL_ORDER.map(levelCode => {
            const levelData = bay.levels.find(l => l.level === levelCode);
            if (!levelData) return null;
            const enabledIndex = bay.levels.filter(l => LEVEL_ORDER.indexOf(l.level) <= LEVEL_ORDER.indexOf(levelCode)).length - 1;
            const y = SHELF_HEIGHT / 2 + 0.1 + enabledIndex * (SHELF_HEIGHT + 0.1);
            const baseColor = LEVEL_COLORS_HEX[levelCode] || 0xcccccc;
            const levelKey = `${aisle.aisle}_${bay.bay}_${levelCode}`;

            // Case A: No bins — single block per level
            if (levelData.bins.length === 0) {
              const code = `${whName}-${aisle.aisle}-${bay.bay}-${levelCode}`;
              return (
                <SelectableBlock key={levelKey}
                  w={shelfWidth} h={SHELF_HEIGHT} d={shelfDepth} position={[0, y, 0]}
                  color={baseColor} isSelected={selectedLocations.includes(code)}
                  hovered={hoveredCode === code} locationCode={code}
                  onHoverIn={setHoveredCode} onHoverOut={() => setHoveredCode(null)} onClick={onToggle}
                />
              );
            }

            // Case B: Bins
            const binDepthEach = shelfDepth / levelData.bins.length;
            const startZ = -shelfDepth / 2;

            return (
              <group key={levelKey}>
                {levelData.bins.map((bin, bIdx) => {
                  const binZCenter = startZ + bIdx * binDepthEach + binDepthEach / 2;

                  // Case B1: No slots — one block per bin
                  if (bin.slots.length === 0) {
                    const code = `${whName}-${aisle.aisle}-${bay.bay}-${levelCode}-${bin.bin}`;
                    return (
                      <SelectableBlock key={`${levelKey}_b${bIdx}`}
                        w={shelfWidth} h={SHELF_HEIGHT} d={binDepthEach - smallGap} position={[0, y, binZCenter]}
                        color={baseColor} isSelected={selectedLocations.includes(code)}
                        hovered={hoveredCode === code} locationCode={code}
                        onHoverIn={setHoveredCode} onHoverOut={() => setHoveredCode(null)} onClick={onToggle}
                      />
                    );
                  }

                  // Case C: Slots — one block per slot (finest granularity)
                  const slotDepthEach = binDepthEach / bin.slots.length;
                  const binZStart = startZ + bIdx * binDepthEach;

                  return (
                    <group key={`${levelKey}_b${bIdx}`}>
                      {bin.slots.map((rawSlot, sIdx) => {
                        const slotZCenter = binZStart + sIdx * slotDepthEach + slotDepthEach / 2;
                        // Full barcode: WH-AISLE-BAY-LEVEL-BIN-SLOT (e.g. A005-L-1-G-L-R)
                        const fullCode = `${whName}-${aisle.aisle}-${bay.bay}-${levelCode}-${bin.bin}-${rawSlot}`;
                        return (
                          <SelectableBlock key={`${levelKey}_b${bIdx}_s${sIdx}`}
                            w={shelfWidth} h={SHELF_HEIGHT} d={slotDepthEach - smallGap} position={[0, y, slotZCenter]}
                            color={baseColor} isSelected={selectedLocations.includes(fullCode)}
                            hovered={hoveredCode === fullCode} locationCode={fullCode}
                            onHoverIn={setHoveredCode} onHoverOut={() => setHoveredCode(null)} onClick={onToggle}
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
        <SpriteLabel text={`Bay: ${bay.bay}`}
          position={[x, bay.levels.length * (SHELF_HEIGHT + 0.1) + 0.7, zPos]}
          color={sc.labelDefault} scale={0.6} bgColor={sc.labelBg}
        />
      </group>
    );
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 15, 10]} intensity={0.8} castShadow />

      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[WH_WIDTH, 0.2, whDepth]} />
        <meshLambertMaterial color={sc.floor} />
      </mesh>
      <WireBorder w={WH_WIDTH} h={0.5} d={whDepth} position={[0, 0.25, 0]} color={sc.wireframe} />
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[WALKWAY_WIDTH, 0.02, whDepth]} />
        <meshLambertMaterial color={sc.walkway} />
      </mesh>
      <SpriteLabel text="Aisle" position={[0, 1, 0]} color={sc.labelAisle} bgColor={sc.labelBg} />
      <mesh position={[0, 0.08, entryZ]}>
        <boxGeometry args={[WH_WIDTH / 2, 0.15, ENTRANCE_DEPTH * 0.8]} />
        <meshLambertMaterial color={sc.entry} />
      </mesh>
      <SpriteLabel text="Entry" position={[0, 0.8, entryZ]} color={sc.labelEntry} bgColor={sc.labelBg} />

      {hasL && (
        <>
          <SpriteLabel text="Aisle: L" position={[xL, 3.0, labelZ]} color={sc.labelDefault} scale={0.9} bgColor={sc.labelBg} />
          {warehouse.aisles.filter(a => a.aisle === 'L').flatMap(a => a.bays.map((_, idx) => renderShelfBay(a, idx, xL)))}
        </>
      )}
      {hasR && (
        <>
          <SpriteLabel text="Aisle: R" position={[xR, 3.0, labelZ]} color={sc.labelDefault} scale={0.9} bgColor={sc.labelBg} />
          {warehouse.aisles.filter(a => a.aisle === 'R').flatMap(a => a.bays.map((_, idx) => renderShelfBay(a, idx, xR)))}
        </>
      )}

      <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2 - 0.1} minDistance={5} maxDistance={50} />
    </>
  );
}

// ═══════════ Exported Component ═══════════
export function InteractiveWarehouseScene({ warehouse, onSelectionChange, selectedLocations }: InteractiveWarehouseSceneProps) {
  const { theme } = useTheme();
  const sc = SCENE_COLORS[theme] || SCENE_COLORS.dark;

  // Per-location toggle (finest granularity)
  const handleToggle = useCallback((code: string) => {
    const newSelection = selectedLocations.includes(code)
      ? selectedLocations.filter(c => c !== code)
      : [...selectedLocations, code];
    onSelectionChange(newSelection);
  }, [selectedLocations, onSelectionChange]);

  return (
    <div className="w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        camera={{ position: [0, 15, 18], fov: 50, near: 0.1, far: 1000 }}
        style={{ background: sc.canvasBg }}
      >
        <InteractiveContent warehouse={warehouse} selectedLocations={selectedLocations} onToggle={handleToggle} sc={sc} />
      </Canvas>
    </div>
  );
}
