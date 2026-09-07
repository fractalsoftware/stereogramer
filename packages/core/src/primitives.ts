import type {
  DepthMap,
  DepthPrimitive,
  RgbaColor,
  RgbaImage,
  SvgRasterOptions,
  TextRasterOptions,
} from './types.js';

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
 * Creates a depth map containing a 3D circular Torus (donut ring).
 */
export function createTorusDepthMap(
  width: number,
  height: number,
  options: {
    majorRadius?: number;
    minorRadius?: number;
    peakDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const cx = width / 2;
  const cy = height / 2;
  const R = options.majorRadius ?? Math.min(width, height) * 0.28;
  const r = options.minorRadius ?? R * 0.45;
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;
  const rSq = r * r;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const d = Math.sqrt(dx * dx + dySq);
      const dr = Math.abs(d - R);
      if (dr <= r) {
        const elevation = Math.sqrt(rSq - dr * dr) / r;
        map.data[rowOffset + x] = bg + elevation * (peak - bg);
      }
    }
  }

  return map;
}

/**
 * Creates a depth map containing a 3D Cone.
 */
export function createConeDepthMap(
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
  const r = options.radius ?? Math.min(width, height) * 0.38;
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const d = Math.sqrt(dx * dx + dySq);
      if (d <= r) {
        const elevation = 1.0 - d / r;
        map.data[rowOffset + x] = bg + elevation * (peak - bg);
      }
    }
  }

  return map;
}

/**
 * Creates a depth map containing a 3D Cylinder with rounded cross-section.
 */
export function createCylinderDepthMap(
  width: number,
  height: number,
  options: {
    radius?: number;
    length?: number;
    orientation?: 'horizontal' | 'vertical';
    peakDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const cx = width / 2;
  const cy = height / 2;
  const r = options.radius ?? Math.min(width, height) * 0.25;
  const length = options.length ?? Math.min(width, height) * 0.65;
  const orientation = options.orientation ?? 'vertical';
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;
  const rSq = r * r;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      if (orientation === 'vertical') {
        if (Math.abs(dy) <= length / 2 && Math.abs(dx) <= r) {
          const elevation = Math.sqrt(rSq - dx * dx) / r;
          map.data[rowOffset + x] = bg + elevation * (peak - bg);
        }
      } else {
        if (Math.abs(dx) <= length / 2 && Math.abs(dy) <= r) {
          const elevation = Math.sqrt(rSq - dy * dy) / r;
          map.data[rowOffset + x] = bg + elevation * (peak - bg);
        }
      }
    }
  }

  return map;
}

/**
 * Creates a depth map containing a 4-sided 3D Pyramid.
 */
export function createPyramidDepthMap(
  width: number,
  height: number,
  options: {
    baseSize?: number;
    peakDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const cx = width / 2;
  const cy = height / 2;
  const size = options.baseSize ?? Math.min(width, height) * 0.35;
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;

  for (let y = 0; y < height; y++) {
    const dy = Math.abs(y - cy);
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - cx);
      const t = Math.max(dx, dy) / size;
      if (t <= 1.0) {
        const elevation = 1.0 - t;
        map.data[rowOffset + x] = bg + elevation * (peak - bg);
      }
    }
  }

  return map;
}

/**
 * Creates a depth map containing a 3D puffy Heart.
 */
export function createHeartDepthMap(
  width: number,
  height: number,
  options: {
    scale?: number;
    peakDepth?: number;
    backgroundDepth?: number;
  } = {}
): DepthMap {
  const map = createDepthMap(width, height, options.backgroundDepth ?? 0.0);
  const cx = width / 2;
  const cy = height / 2 - Math.min(width, height) * 0.03;
  const s = options.scale ?? Math.min(width, height) * 0.28;
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;

  for (let y = 0; y < height; y++) {
    const v = -(y - cy) / s;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const u = (x - cx) / s;
      const uSq = u * u;
      const vSq = v * v;
      const term = uSq + vSq - 1.0;
      const val = term * term * term - uSq * v * v * v;
      if (val <= 0.0) {
        const elevation = Math.min(1.0, Math.sqrt(Math.max(0, -val) * 1.5));
        map.data[rowOffset + x] = bg + elevation * (peak - bg);
      }
    }
  }

  return map;
}

/**
 * Factory creating procedural 3D geometric depth maps by primitive type name.
 */
export function createPrimitiveDepthMap(
  type: DepthPrimitive,
  width: number,
  height: number,
  options: Record<string, any> = {}
): DepthMap {
  switch (type) {
    case 'sphere':
      return createSphereDepthMap(width, height, options);
    case 'torus':
      return createTorusDepthMap(width, height, options);
    case 'cone':
      return createConeDepthMap(width, height, options);
    case 'cylinder':
      return createCylinderDepthMap(width, height, options);
    case 'pyramid':
      return createPyramidDepthMap(width, height, options);
    case 'heart':
      return createHeartDepthMap(width, height, options);
    case 'slanted':
      return createSlantedPlaneDepthMap(width, height, options);
    case 'box':
      return createBoxDepthMap(width, height, options);
    default:
      return createSphereDepthMap(width, height, options);
  }
}

/**
 * Applies a separable Gaussian blur filter to smooth depth transitions and eliminate harsh cliffs.
 *
 * @param depthMap Input depth map.
 * @param radius Blur standard deviation radius in pixels.
 * @returns Filtered DepthMap with softened depth transitions.
 */
export function applyGaussianBlur(depthMap: DepthMap, radius: number): DepthMap {
  if (radius <= 0) {
    return {
      width: depthMap.width,
      height: depthMap.height,
      data: new Float32Array(depthMap.data),
    };
  }

  const { width, height, data } = depthMap;
  const sigma = Math.max(0.5, radius / 2);
  const k = Math.min(Math.ceil(3 * sigma), 50);

  // Compute 1D Gaussian kernel
  const weights = new Float32Array(2 * k + 1);
  let weightSum = 0;
  for (let i = -k; i <= k; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights[i + k] = w;
    weightSum += w;
  }
  for (let i = 0; i < weights.length; i++) {
    weights[i] /= weightSum;
  }

  // Pass 1: Horizontal 1D convolution
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = -k; i <= k; i++) {
        const nx = Math.min(width - 1, Math.max(0, x + i));
        sum += data[rowOffset + nx]! * weights[i + k]!;
      }
      temp[rowOffset + x] = sum;
    }
  }

  // Pass 2: Vertical 1D convolution
  const result = new Float32Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let j = -k; j <= k; j++) {
        const ny = Math.min(height - 1, Math.max(0, y + j));
        sum += temp[ny * width + x]! * weights[j + k]!;
      }
      result[y * width + x] = Math.max(0, Math.min(1, sum));
    }
  }

  return { width, height, data: result };
}

/**
 * Applies continuous bevel extrusion using Euclidean distance transform to soften
 * vertical boundary cliffs on flat silhouettes, text, or shapes.
 *
 * @param depthMap Input depth map.
 * @param bevelWidth Distance from silhouette edge over which elevation ramps up.
 * @param maxElevation Peak elevation scale factor [0.0 - 1.0].
 * @returns Beveled DepthMap.
 */
export function applyBevel(
  depthMap: DepthMap,
  bevelWidth: number,
  maxElevation: number = 1.0
): DepthMap {
  if (bevelWidth <= 0) {
    return {
      width: depthMap.width,
      height: depthMap.height,
      data: new Float32Array(depthMap.data),
    };
  }

  const { width, height, data } = depthMap;
  const dist = new Float32Array(width * height).fill(Infinity);

  // Mark background boundary pixels
  for (let i = 0; i < data.length; i++) {
    if (data[i]! <= 0.05) {
      dist[i] = 0;
    }
  }

  const dOrth = 1.0;
  const dDiag = 1.41421356;

  // Pass 1: Top-left to bottom-right
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (dist[idx]! === 0) continue;
      let d = dist[idx]!;
      if (x > 0) d = Math.min(d, dist[idx - 1]! + dOrth);
      if (y > 0) {
        const topRow = (y - 1) * width;
        d = Math.min(d, dist[topRow + x]! + dOrth);
        if (x > 0) d = Math.min(d, dist[topRow + x - 1]! + dDiag);
        if (x < width - 1) d = Math.min(d, dist[topRow + x + 1]! + dDiag);
      }
      dist[idx] = d;
    }
  }

  // Pass 2: Bottom-right to top-left
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x--) {
      const idx = row + x;
      if (dist[idx]! === 0) continue;
      let d = dist[idx]!;
      if (x < width - 1) d = Math.min(d, dist[idx + 1]! + dOrth);
      if (y < height - 1) {
        const botRow = (y + 1) * width;
        d = Math.min(d, dist[botRow + x]! + dOrth);
        if (x > 0) d = Math.min(d, dist[botRow + x - 1]! + dDiag);
        if (x < width - 1) d = Math.min(d, dist[botRow + x + 1]! + dDiag);
      }
      dist[idx] = d;
    }
  }

  const result = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const orig = data[i]!;
    if (orig <= 0.05) {
      result[i] = orig;
    } else {
      const d = dist[i]!;
      const bevelFactor = Math.min(1.0, d / bevelWidth);
      result[i] = orig * bevelFactor * maxElevation;
    }
  }

  return { width, height, data: result };
}

/**
 * 5x7 bitmap font table for core fallback rasterization in headless environments.
 */
const BITMAP_5X7: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  '!': [0, 0, 0x5f, 0, 0],
  '?': [0x02, 0x01, 0x51, 0x09, 0x06],
  '#': [0x14, 0x7f, 0x14, 0x7f, 0x14],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  'A': [0x7e, 0x11, 0x11, 0x11, 0x7e],
  'B': [0x7f, 0x49, 0x49, 0x49, 0x36],
  'C': [0x3e, 0x41, 0x41, 0x41, 0x22],
  'D': [0x7f, 0x41, 0x41, 0x22, 0x1c],
  'E': [0x7f, 0x49, 0x49, 0x49, 0x41],
  'F': [0x7f, 0x09, 0x09, 0x09, 0x01],
  'G': [0x3e, 0x41, 0x49, 0x49, 0x7a],
  'H': [0x7f, 0x08, 0x08, 0x08, 0x7f],
  'I': [0x00, 0x41, 0x7f, 0x41, 0x00],
  'J': [0x20, 0x40, 0x41, 0x3f, 0x01],
  'K': [0x7f, 0x08, 0x14, 0x22, 0x41],
  'L': [0x7f, 0x40, 0x40, 0x40, 0x40],
  'M': [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  'N': [0x7f, 0x04, 0x08, 0x10, 0x7f],
  'O': [0x3e, 0x41, 0x41, 0x41, 0x3e],
  'P': [0x7f, 0x09, 0x09, 0x09, 0x06],
  'Q': [0x3e, 0x41, 0x51, 0x21, 0x5e],
  'R': [0x7f, 0x09, 0x19, 0x29, 0x46],
  'S': [0x46, 0x49, 0x49, 0x49, 0x31],
  'T': [0x01, 0x01, 0x7f, 0x01, 0x01],
  'U': [0x3f, 0x40, 0x40, 0x40, 0x3f],
  'V': [0x1f, 0x20, 0x40, 0x20, 0x1f],
  'W': [0x7f, 0x20, 0x18, 0x20, 0x7f],
  'X': [0x63, 0x14, 0x08, 0x14, 0x63],
  'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
  'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
};

function renderBitmapTextFallback(
  target: DepthMap,
  text: string,
  fontSize: number,
  peak: number,
  bg: number
): void {
  const upper = text.toUpperCase();
  const scale = Math.max(1, Math.floor(fontSize / 8));
  const charWidth = 6 * scale;
  const totalTextWidth = upper.length * charWidth;
  const startX = Math.round((target.width - totalTextWidth) / 2);
  const startY = Math.round((target.height - 7 * scale) / 2);

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]!;
    const glyph = BITMAP_5X7[ch] || BITMAP_5X7['?']!;
    const charOffsetX = startX + i * charWidth;

    for (let col = 0; col < 5; col++) {
      const colBits = glyph[col]!;
      for (let row = 0; row < 7; row++) {
        if ((colBits & (1 << row)) !== 0) {
          // Fill scaled pixel block
          for (let sy = 0; sy < scale; sy++) {
            const py = startY + row * scale + sy;
            if (py < 0 || py >= target.height) continue;
            const rowOffset = py * target.width;
            for (let sx = 0; sx < scale; sx++) {
              const px = charOffsetX + col * scale + sx;
              if (px >= 0 && px < target.width) {
                target.data[rowOffset + px] = peak;
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Rasterizes text strings into a 2D DepthMap with customizable font styling and elevation.
 *
 * @param text The text string to render.
 * @param width Target depth map width in pixels.
 * @param height Target depth map height in pixels.
 * @param options Styling and elevation options.
 * @returns 2D DepthMap containing rendered text relief.
 */
export function rasterizeText(
  text: string,
  width: number,
  height: number,
  options: TextRasterOptions = {}
): DepthMap {
  const fontSize = options.fontSize ?? Math.round(height * 0.35);
  const fontWeight = options.fontWeight ?? 'bold';
  const fontFamily = options.fontFamily ?? 'sans-serif';
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;

  const result = createDepthMap(width, height, bg);

  const GlobalOffscreenCanvas = (globalThis as any).OffscreenCanvas;
  if (typeof GlobalOffscreenCanvas !== 'undefined') {
    try {
      const canvas = new GlobalOffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);

        const imgData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < width * height; i++) {
          const lum = imgData.data[i * 4]! / 255.0;
          result.data[i] = bg + lum * (peak - bg);
        }
        return result;
      }
    } catch {
      // Fall through to bitmap font fallback
    }
  }

  renderBitmapTextFallback(result, text, fontSize, peak, bg);
  return result;
}

/**
 * Rasterizes an SVG path data string into a 2D DepthMap.
 *
 * @param pathData SVG path definition string (e.g. 'M 50 50 L 100 50 ... Z').
 * @param width Target depth map width in pixels.
 * @param height Target depth map height in pixels.
 * @param options Rasterization and elevation options.
 * @returns 2D DepthMap containing the rasterized vector silhouette.
 */
export function rasterizeSvgPath(
  pathData: string,
  width: number,
  height: number,
  options: SvgRasterOptions = {}
): DepthMap {
  const peak = options.peakDepth ?? 1.0;
  const bg = options.backgroundDepth ?? 0.0;
  const fillRule = options.fillRule ?? 'nonzero';

  const result = createDepthMap(width, height, bg);

  const GlobalOffscreenCanvas = (globalThis as any).OffscreenCanvas;
  const GlobalPath2D = (globalThis as any).Path2D;
  if (typeof GlobalOffscreenCanvas !== 'undefined' && typeof GlobalPath2D !== 'undefined') {
    try {
      const canvas = new GlobalOffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        const path = new GlobalPath2D(pathData);
        ctx.fill(path, fillRule);

        const imgData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < width * height; i++) {
          const lum = imgData.data[i * 4]! / 255.0;
          result.data[i] = bg + lum * (peak - bg);
        }
        return result;
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: Parse polygon coordinates if format is M x y L x y ... Z
  renderSvgPolylineFallback(result, pathData, peak, bg);
  return result;
}

function renderSvgPolylineFallback(
  target: DepthMap,
  pathData: string,
  peak: number,
  bg: number
): void {
  // Extract coordinate numbers from command tokens
  const nums = pathData.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!nums || nums.length < 6) return;

  const points: [number, number][] = [];
  for (let i = 0; i < nums.length - 1; i += 2) {
    points.push([parseFloat(nums[i]!), parseFloat(nums[i + 1]!)]);
  }

  // Scanline polygon fill
  const { width, height, data } = target;
  for (let y = 0; y < height; y++) {
    const nodeX: number[] = [];
    let j = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const [xi, yi] = points[i]!;
      const [xj, yj] = points[j]!;
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        nodeX.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      j = i;
    }
    nodeX.sort((a, b) => a - b);
    for (let k = 0; k < nodeX.length; k += 2) {
      if (k + 1 >= nodeX.length) break;
      const startX = Math.max(0, Math.ceil(nodeX[k]!));
      const endX = Math.min(width - 1, Math.floor(nodeX[k + 1]!));
      const rowOffset = y * width;
      for (let x = startX; x <= endX; x++) {
        data[rowOffset + x] = peak;
      }
    }
  }
}

/**
 * Creates an RGBA checkerboard test pattern image.
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
