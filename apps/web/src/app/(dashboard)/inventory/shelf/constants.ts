/**
 * Shared shelf-level color constants.
 * Used across WarehouseCard, AisleConfigPanel, WarehouseModal, and Three.js scenes.
 *
 * These are semantic colors representing physical warehouse shelf levels:
 *   G = Ground (green), M = Middle (blue), T = Top (orange)
 */
export const LEVEL_COLORS: Record<string, string> = {
  G: '#4CAF50',
  M: '#2196F3',
  T: '#FF9800',
};

/** Numeric hex variants for Three.js materials */
export const LEVEL_COLORS_HEX: Record<string, number> = {
  G: 0x4caf50,
  M: 0x2196f3,
  T: 0xff9800,
};

export const AVAILABLE_LEVELS = ['G', 'M', 'T'] as const;
