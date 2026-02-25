'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useMemo, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { WarehouseNode } from '@/lib/api/inventory';
import { LEVEL_COLORS } from '../../constants';

const SELECTED_COLOR = '#FFD700';
const HOVER_COLOR = '#FFFFFF';

const BAY_WIDTH = 1.2;
const LEVEL_HEIGHT = 1;
const SHELF_DEPTH = 0.8;
const AISLE_GAP = 2.5;

interface InteractiveWarehouseSceneProps {
  warehouse: WarehouseNode;
  onSelectionChange: (locations: string[]) => void;
  selectedLocations: string[];
}

interface LocationBox {
  code: string;
  position: [number, number, number];
  level: string;
}

function SelectableBox({
  code,
  position,
  level,
  isSelected,
  onToggle,
}: {
  code: string;
  position: [number, number, number];
  level: string;
  isSelected: boolean;
  onToggle: (code: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();

  const color = isSelected ? SELECTED_COLOR : hovered ? HOVER_COLOR : (LEVEL_COLORS[level] || '#999');
  const opacity = isSelected ? 0.7 : hovered ? 0.5 : 0.2;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(code);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        gl.domElement.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[BAY_WIDTH * 0.85, LEVEL_HEIGHT * 0.8, SHELF_DEPTH * 0.85]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        emissive={isSelected ? SELECTED_COLOR : hovered ? HOVER_COLOR : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
      />
      {hovered && (
        <Html center style={{ pointerEvents: 'none' }}>
          <div
            className="px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap"
            style={{
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              transform: 'translateY(-30px)',
            }}
          >
            {code}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function InteractiveContent({
  warehouse,
  selectedLocations,
  onToggle,
}: {
  warehouse: WarehouseNode;
  selectedLocations: string[];
  onToggle: (code: string) => void;
}) {
  // Build location boxes from warehouse tree
  const locationBoxes: LocationBox[] = useMemo(() => {
    const boxes: LocationBox[] = [];
    let aisleZ = 0;

    for (const aisle of warehouse.aisles) {
      const bayCount = aisle.bays.length;
      const startX = -(bayCount * BAY_WIDTH) / 2 + BAY_WIDTH / 2;

      for (let bi = 0; bi < aisle.bays.length; bi++) {
        const bay = aisle.bays[bi];
        for (let li = 0; li < bay.levels.length; li++) {
          const level = bay.levels[li];
          const y = li * LEVEL_HEIGHT + LEVEL_HEIGHT / 2;

          // Each bin/slot gets a location code
          for (const bin of level.bins) {
            for (const slot of bin.slots) {
              boxes.push({
                code: slot,
                position: [startX + bi * BAY_WIDTH, y, aisleZ],
                level: level.level,
              });
            }
          }
        }
      }
      aisleZ += AISLE_GAP;
    }
    return boxes;
  }, [warehouse]);

  // Deduplicate by (aisle, bay, level) for visual rendering
  // We render one box per level per bay, representing all bins/slots
  const visualBoxes = useMemo(() => {
    const map = new Map<string, LocationBox>();
    for (const box of locationBoxes) {
      const key = `${box.position[0]}-${box.position[1]}-${box.position[2]}`;
      if (!map.has(key)) map.set(key, box);
    }
    return Array.from(map.values());
  }, [locationBoxes]);

  // Build a map from visual position key to all location codes at that position
  const positionToLocations = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const box of locationBoxes) {
      const key = `${box.position[0]}-${box.position[1]}-${box.position[2]}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(box.code);
    }
    return map;
  }, [locationBoxes]);

  const isBoxSelected = useCallback((box: LocationBox) => {
    const key = `${box.position[0]}-${box.position[1]}-${box.position[2]}`;
    const codes = positionToLocations.get(key) || [];
    return codes.some(c => selectedLocations.includes(c));
  }, [selectedLocations, positionToLocations]);

  const handleToggle = useCallback((code: string) => {
    // Find all codes at this position and toggle them all
    const box = locationBoxes.find(b => b.code === code);
    if (!box) { onToggle(code); return; }
    const key = `${box.position[0]}-${box.position[1]}-${box.position[2]}`;
    const codes = positionToLocations.get(key) || [code];
    // Toggle: if any selected, deselect all; otherwise select all
    const anySelected = codes.some(c => selectedLocations.includes(c));
    if (anySelected) {
      // Remove all codes at this position
      for (const c of codes) onToggle(c);
    } else {
      // Add all codes at this position
      for (const c of codes) onToggle(c);
    }
  }, [locationBoxes, positionToLocations, selectedLocations, onToggle]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      <Grid
        position={[0, -0.01, 0]}
        args={[50, 50]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#606060"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#808080"
        fadeDistance={30}
        infiniteGrid
      />

      {/* Metal posts structure */}
      {warehouse.aisles.map((aisle, ai) => {
        const bayCount = aisle.bays.length;
        const startX = -(bayCount * BAY_WIDTH) / 2 + BAY_WIDTH / 2;
        const z = ai * AISLE_GAP;
        const maxLevels = Math.max(...aisle.bays.map(b => b.levels.length));
        const totalHeight = maxLevels * LEVEL_HEIGHT;

        return (
          <group key={`structure-${ai}`}>
            {aisle.bays.map((_, bi) => {
              const x = startX + bi * BAY_WIDTH;
              return [
                [-BAY_WIDTH / 2, -SHELF_DEPTH / 2],
                [BAY_WIDTH / 2, -SHELF_DEPTH / 2],
                [-BAY_WIDTH / 2, SHELF_DEPTH / 2],
                [BAY_WIDTH / 2, SHELF_DEPTH / 2],
              ].map(([dx, dz], pi) => (
                <mesh key={`post-${ai}-${bi}-${pi}`} position={[x + dx, totalHeight / 2, z + dz]}>
                  <boxGeometry args={[0.06, totalHeight, 0.06]} />
                  <meshStandardMaterial color="#8a8a8a" metalness={0.7} roughness={0.3} />
                </mesh>
              ));
            })}
          </group>
        );
      })}

      {/* Selectable location boxes */}
      {visualBoxes.map((box) => (
        <SelectableBox
          key={box.code}
          code={box.code}
          position={box.position}
          level={box.level}
          isSelected={isBoxSelected(box)}
          onToggle={handleToggle}
        />
      ))}

      <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export function InteractiveWarehouseScene({
  warehouse,
  onSelectionChange,
  selectedLocations,
}: InteractiveWarehouseSceneProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const handleToggle = useCallback((code: string) => {
    const newSelection = selectedLocations.includes(code)
      ? selectedLocations.filter(c => c !== code)
      : [...selectedLocations, code];
    onSelectionChange(newSelection);
  }, [selectedLocations, onSelectionChange]);

  const aisleCount = warehouse.aisles.length;
  const maxBays = Math.max(1, ...warehouse.aisles.map(a => a.bays.length));
  const distance = Math.max(8, maxBays * 1.2, aisleCount * 2);

  return (
    <div className="w-full h-full" style={{ minHeight: 400 }}>
      <Canvas
        camera={{
          position: [distance * 0.6, distance * 0.5, distance * 0.8],
          fov: 50,
          near: 0.1,
          far: 200,
        }}
        style={{ background: colors.bg }}
      >
        <InteractiveContent
          warehouse={warehouse}
          selectedLocations={selectedLocations}
          onToggle={handleToggle}
        />
      </Canvas>
    </div>
  );
}
