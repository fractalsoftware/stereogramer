import type { RgbaColor, SirdsPaletteName } from './types.js';

export const SIRDS_PALETTES: Record<SirdsPaletteName, RgbaColor[]> = {
  bw: [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
  ],
  grayscale: Array.from({ length: 16 }, (_, i) => {
    const v = Math.round((i / 15) * 255);
    return [v, v, v, 255] as RgbaColor;
  }),
  rgb: [
    [239, 68, 68, 255],   // red
    [249, 115, 22, 255],  // orange
    [245, 158, 11, 255],  // amber
    [16, 185, 129, 255],  // green
    [6, 182, 212, 255],   // cyan
    [59, 130, 246, 255],  // blue
    [139, 92, 246, 255],  // violet
    [236, 72, 153, 255],  // pink
    [255, 255, 255, 255], // white
    [15, 23, 42, 255],    // dark slate
  ],
  duotone: Array.from({ length: 16 }, (_, i) => {
    const t = i / 15;
    const r = Math.round(6 * (1 - t) + 245 * t);
    const g = Math.round(182 * (1 - t) + 158 * t);
    const b = Math.round(212 * (1 - t) + 11 * t);
    return [r, g, b, 255] as RgbaColor;
  }),
};

/**
 * Resolves a palette input (custom array or named preset) to a list of RGBA colors.
 */
export function resolveSirdsPalette(
  palette?: RgbaColor[] | SirdsPaletteName
): RgbaColor[] {
  if (!palette) {
    return SIRDS_PALETTES.bw;
  }
  if (typeof palette === 'string') {
    return SIRDS_PALETTES[palette] || SIRDS_PALETTES.bw;
  }
  return palette.length > 0 ? palette : SIRDS_PALETTES.bw;
}
