import type { DepthMap, RgbaColor, RgbaImage } from './types.js';

/**
 * Creates a DepthMap with dimensions width x height initialized to defaultValue.
 */
export function createDepthMap(width: number, height: number, defaultValue: number = 0.0): DepthMap {
  const clampedW = Math.max(1, Math.round(width));
  const clampedH = Math.max(1, Math.round(height));
  const data = new Float32Array(clampedW * clampedH);
  if (defaultValue !== 0.0) {
    const val = Math.max(0.0, Math.min(1.0, defaultValue));
    data.fill(val);
  }
  return { width: clampedW, height: clampedH, data };
}

/**
 * Creates a flat uniform depth map of specified elevation Z in [0.0, 1.0].
 */
export function createFlatDepthMap(width: number, height: number, depth: number = 0.0): DepthMap {
  return createDepthMap(width, height, depth);
}

/**
 * Creates a depth map containing a centered 3D sphere.
 */
export function createSphereDepthMap(
  width: number,
  height: number,
  options: {
    radius?: number;
    peakDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const cx = width / 2;
  const cy = height / 2;
  const r = options.radius ?? Math.min(width, height) * 0.35;
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;
  const rSq = r * r;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dSq = dx * dx + dySq;
      if (dSq <= rSq) {
        // Spherical surface elevation: z = sqrt(r^2 - d^2) / r
        const elevation = Math.sqrt(rSq - dSq) / r;
        map.data[rowOffset + x] = bg + elevation * (peak - bg);
      }
    }
  }

  return map;
}

/**
 * Creates a depth map containing an elevated rectangular box.
 */
export function createBoxDepthMap(
  width: number,
  height: number,
  options: {
    boxWidth?: number;
    boxHeight?: number;
    boxDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const bw = options.boxWidth ?? Math.round(width * 0.4);
  const bh = options.boxHeight ?? Math.round(height * 0.4);
  const depth = options.boxDepth ?? 0.8;

  const startX = Math.round((width - bw) / 2);
  const endX = startX + bw;
  const startY = Math.round((height - bh) / 2);
  const endY = startY + bh;

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * width;
    for (let x = startX; x < endX; x++) {
      map.data[rowOffset + x] = depth;
    }
  }

  return map;
}

/**
 * Creates a depth map representing a slanted plane from left to right or top to bottom.
 */
export function createSlantedPlaneDepthMap(
  width: number,
  height: number,
  options: {
    minDepth?: number;
    maxDepth?: number;
    axis?: 'horizontal' | 'vertical';
  } = {}
): DepthMap {
  const map = createDepthMap(width, height);
  const min = options.minDepth ?? 0.0;
  const max = options.maxDepth ?? 1.0;
  const axis = options.axis ?? 'horizontal';

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const t = axis === 'horizontal' ? x / (width - 1 || 1) : y / (height - 1 || 1);
      map.data[rowOffset + x] = min + t * (max - min);
    }
  }

  return map;
}

/**
 * Creates an RGBA checkerboard test pattern image.
 *
 * @param width Pattern width in pixels.
 * @param height Pattern height in pixels.
 * @param cellSize Grid cell dimension in pixels (default 8).
 * @param colorA First cell color (default white).
 * @param colorB Second cell color (default dark slate).
 * @returns RgbaImage pattern buffer.
 */
export function createCheckerboardPattern(
  width: number,
  height: number,
  cellSize: number = 8,
  colorA: RgbaColor = [255, 255, 255, 255],
  colorB: RgbaColor = [30, 41, 59, 255]
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const cell = Math.max(1, Math.round(cellSize));
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const cellY = Math.floor(y / cell);
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const cellX = Math.floor(x / cell);
      const isA = (cellX + cellY) % 2 === 0;
      const color = isA ? colorA : colorB;
      const offset = rowOffset + x * 4;

      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }

  return { width: w, height: h, data };
}

