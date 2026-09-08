import type {
  CheckerTextureOptions,
  MosaicTextureOptions,
  PatternRecipe,
  PerlinTextureOptions,
  RgbaColor,
  RgbaImage,
  StripesTextureOptions,
  VoronoiTextureOptions,
} from './types.js';

/**
 * Default vibrant 4-tone vertical color stripes palette.
 */
export const DEFAULT_STRIPES_COLORS: RgbaColor[] = [
  [239, 68, 68, 255],   // red
  [245, 158, 11, 255],  // amber
  [16, 185, 129, 255],  // emerald
  [99, 102, 241, 255],  // indigo
];

/**
 * Hash function returning a pseudo-random 2D unit gradient vector [gx, gy].
 */
function grad2D(ix: number, iy: number, seed: number = 42): [number, number] {
  let h = (ix * 374761393 + iy * 668265263 + seed * 966826527) ^ 0x5bf03635;
  h = (h ^ (h >>> 13)) * 1274126177;
  const angle = ((h >>> 0) / 4294967296) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Computes single-octave toroidally periodic 2D gradient noise in [0, 1].
 */
function periodicNoise2D(
  x: number,
  y: number,
  width: number,
  height: number,
  periodX: number,
  periodY: number,
  seed: number
): number {
  const u = (x / width) * periodX;
  const v = (y / height) * periodY;

  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = (i0 + 1) % periodX;
  const j1 = (j0 + 1) % periodY;
  const i0w = ((i0 % periodX) + periodX) % periodX;
  const j0w = ((j0 % periodY) + periodY) % periodY;

  const fu = u - i0;
  const fv = v - j0;

  const su = smoothstep(fu);
  const sv = smoothstep(fv);

  const [g00x, g00y] = grad2D(i0w, j0w, seed);
  const [g10x, g10y] = grad2D(i1, j0w, seed);
  const [g01x, g01y] = grad2D(i0w, j1, seed);
  const [g11x, g11y] = grad2D(i1, j1, seed);

  const n00 = g00x * fu + g00y * fv;
  const n10 = g10x * (fu - 1) + g10y * fv;
  const n01 = g01x * fu + g01y * (fv - 1);
  const n11 = g11x * (fu - 1) + g11y * (fv - 1);

  const nx0 = n00 * (1 - su) + n10 * su;
  const nx1 = n01 * (1 - su) + n11 * su;
  const n = nx0 * (1 - sv) + nx1 * sv;

  return Math.max(0, Math.min(1, n * 0.7071 + 0.5));
}

/**
 * Generates a toroidally periodic procedural Perlin noise texture with toroidal seamlessness.
 */
export function generatePerlinTexture(
  width: number,
  height: number,
  options: PerlinTextureOptions = {}
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const octaves = Math.max(1, options.octaves ?? 3);
  const baseScale = Math.max(2, Math.round(options.scale ?? 4));
  const colorA: RgbaColor = options.colorA ?? [56, 189, 248, 255]; // cyan
  const colorB: RgbaColor = options.colorB ?? [15, 23, 42, 255];   // dark slate
  const baseSeed = Math.round(options.seed ?? 100);

  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      let nSum = 0;
      let ampSum = 0;
      let amp = 1.0;
      let freq = baseScale;

      for (let oct = 0; oct < octaves; oct++) {
        nSum += periodicNoise2D(x, y, w, h, freq, freq, baseSeed + oct * 57) * amp;
        ampSum += amp;
        amp *= 0.5;
        freq *= 2;
      }

      const t = nSum / ampSum;
      const offset = rowOffset + x * 4;

      data[offset] = Math.round(colorB[0] * (1 - t) + colorA[0] * t);
      data[offset + 1] = Math.round(colorB[1] * (1 - t) + colorA[1] * t);
      data[offset + 2] = Math.round(colorB[2] * (1 - t) + colorA[2] * t);
      data[offset + 3] = 255;
    }
  }

  return { width: w, height: h, data };
}

/**
 * Generates a toroidally periodic procedural Voronoi cellular texture with toroidal seamlessness.
 */
export function generateVoronoiTexture(
  width: number,
  height: number,
  options: VoronoiTextureOptions = {}
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const numCells = Math.max(4, options.numCells ?? options.count ?? 16);
  const colorA: RgbaColor = options.colorA ?? [236, 72, 153, 255]; // pink
  const colorB: RgbaColor = options.colorB ?? [30, 41, 59, 255];   // slate border
  const baseSeed = options.seed !== undefined ? Math.round(options.seed) >>> 0 : 0;

  // Seed cell centers deterministically
  const cellX = new Float32Array(numCells);
  const cellY = new Float32Array(numCells);
  for (let i = 0; i < numCells; i++) {
    // Halton sequence or deterministic LCG
    const seed = ((i ^ (baseSeed * 2654435761 >>> 0)) * 1664525 + 1013904223) >>> 0;
    const seed2 = (seed * 1664525 + 1013904223) >>> 0;
    cellX[i] = (seed / 4294967296) * w;
    cellY[i] = (seed2 / 4294967296) * h;
  }

  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      let d1 = Infinity;
      let d2 = Infinity;

      for (let i = 0; i < numCells; i++) {
        // Toroidal periodic distance metric
        const rawDx = Math.abs(x - cellX[i]!);
        const dx = Math.min(rawDx, w - rawDx);
        const rawDy = Math.abs(y - cellY[i]!);
        const dy = Math.min(rawDy, h - rawDy);
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }

      // Border proximity: (d2 - d1)
      const edge = Math.min(1.0, (d2 - d1) / (Math.min(w, h) * 0.12));
      const t = edge;
      const offset = rowOffset + x * 4;

      data[offset] = Math.round(colorB[0] * (1 - t) + colorA[0] * t);
      data[offset + 1] = Math.round(colorB[1] * (1 - t) + colorA[1] * t);
      data[offset + 2] = Math.round(colorB[2] * (1 - t) + colorA[2] * t);
      data[offset + 3] = 255;
    }
  }

  return { width: w, height: h, data };
}

/**
 * Generates a procedural checkerboard texture tile with toroidal seamlessness.
 */
export function generateCheckerboardTexture(
  width: number,
  height: number,
  cellSizeOrOptions: number | CheckerTextureOptions = 10,
  overrideColorA?: RgbaColor,
  overrideColorB?: RgbaColor
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  let cell = 10;
  let colorA: RgbaColor = [56, 189, 248, 255];
  let colorB: RgbaColor = [30, 41, 59, 255];
  let seed = 0;

  if (typeof cellSizeOrOptions === 'object' && cellSizeOrOptions !== null) {
    cell = Math.max(1, Math.round(cellSizeOrOptions.cellSize ?? cellSizeOrOptions.scale ?? 10));
    colorA = cellSizeOrOptions.colorA ?? colorA;
    colorB = cellSizeOrOptions.colorB ?? colorB;
    seed = Math.round(cellSizeOrOptions.seed ?? 0);
  } else if (typeof cellSizeOrOptions === 'number') {
    cell = Math.max(1, Math.round(cellSizeOrOptions));
    colorA = overrideColorA ?? colorA;
    colorB = overrideColorB ?? colorB;
  }

  // Integer cell counts across dimensions to guarantee toroidal seamlessness across boundaries.
  // For alternating checkerboard continuity, an even number of cells is enforced when dimension >= 2.
  let cols = Math.max(1, Math.round(w / cell));
  if (cols > 1 && cols % 2 !== 0) {
    cols += (w / cell >= cols) ? 1 : -1;
  }
  if (cols % 2 !== 0 && w >= 2) {
    cols = (cols === 1) ? 2 : cols + 1;
  }

  let rows = Math.max(1, Math.round(h / cell));
  if (rows > 1 && rows % 2 !== 0) {
    rows += (h / cell >= rows) ? 1 : -1;
  }
  if (rows % 2 !== 0 && h >= 2) {
    rows = (rows === 1) ? 2 : rows + 1;
  }

  const shift = seed !== 0 ? ((Math.floor(seed) % 2) + 2) % 2 : 0;
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / h));
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / w));
      const isA = (cx + cy + shift) % 2 === 0;
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

/**
 * Generates a procedural color stripes texture tile with toroidal seamlessness.
 */
export function generateStripesTexture(
  width: number,
  height: number,
  options: StripesTextureOptions = {}
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const stripeWidth = Math.max(
    1,
    Math.round(options.stripeWidth ?? options.scale ?? options.cellSize ?? 10)
  );
  const isVertical = options.direction !== 'horizontal';
  const seed = Math.round(options.seed ?? 0);

  // Color precedence:
  // 1. Explicit multi-color palette (options.colors) if non-empty
  // 2. Two-tone pair [options.colorA, options.colorB] if either is defined
  // 3. Fallback to DEFAULT_STRIPES_COLORS
  let colors: RgbaColor[];
  if (options.colors && options.colors.length > 0) {
    colors = options.colors;
  } else if (options.colorA || options.colorB) {
    const defaultColorA: RgbaColor = [239, 68, 68, 255];
    const defaultColorB: RgbaColor = [15, 23, 42, 255];
    colors = [
      options.colorA ?? defaultColorA,
      options.colorB ?? defaultColorB,
    ];
  } else {
    colors = DEFAULT_STRIPES_COLORS;
  }

  const numColors = colors.length;
  const shift = ((seed % numColors) + numColors) % numColors;
  const dim = isVertical ? w : h;

  // Fit an integer number of stripes across dim so stripes wrap toroidally without truncated half-stripes
  const totalStripes = Math.max(1, Math.round(dim / stripeWidth));

  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const coord = isVertical ? x : y;
      const stripeIndex = Math.min(totalStripes - 1, Math.floor((coord * totalStripes) / dim));
      const band = ((stripeIndex + shift) % numColors + numColors) % numColors;
      const color = colors[band]!;
      const offset = rowOffset + x * 4;

      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }

  return { width: w, height: h, data };
}

/**
 * Generates a toroidally periodic procedural dot mosaic texture with toroidal seamlessness.
 */
export function generateMosaicTexture(
  width: number,
  height: number,
  options: MosaicTextureOptions = {}
): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const cellSize = Math.max(2, Math.round(options.cellSize ?? options.scale ?? 20));
  const dotRadius =
    options.dotRadius !== undefined
      ? Math.max(1, options.dotRadius)
      : Math.max(1, Math.round(cellSize * 0.35));
  const colorA: RgbaColor = options.colorA ?? [236, 72, 153, 255]; // pink
  const colorB: RgbaColor = options.colorB ?? [15, 23, 42, 255];   // slate dark
  const seed = Math.round(options.seed ?? 0);

  const cellCountX = Math.max(1, Math.round(w / cellSize));
  const cellCountY = Math.max(1, Math.round(h / cellSize));
  const stepX = w / cellCountX;
  const stepY = h / cellCountY;

  const data = new Uint8ClampedArray(w * h * 4);
  const hasVariation = seed !== 0;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    const v = (y / h) * cellCountY;
    const cellJ = Math.floor(v) % cellCountY;
    const cy = (v - Math.floor(v) - 0.5) * stepY;

    for (let x = 0; x < w; x++) {
      const u = (x / w) * cellCountX;
      const cellI = Math.floor(u) % cellCountX;
      const cx = (u - Math.floor(u) - 0.5) * stepX;

      let radius = dotRadius;
      if (hasVariation) {
        const hVal =
          ((cellI * 374761393 + cellJ * 668265263 + seed * 966826527) ^ 0x5bf03635) >>> 0;
        const norm = (hVal % 1000) / 1000;
        radius = dotRadius * (0.6 + 0.8 * norm);
      }

      const dist = Math.sqrt(cx * cx + cy * cy);
      const isDot = dist < radius;
      const color = isDot ? colorA : colorB;
      const offset = rowOffset + x * 4;

      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }

  return { width: w, height: h, data };
}

/**
 * Synthesizes a seamless Pattern Tile deterministically on demand
 * using a declarative PatternRecipe descriptor.
 */
export function generatePatternTile(
  width: number,
  height: number,
  recipe: PatternRecipe
): RgbaImage {
  switch (recipe.type) {
    case 'perlin':
      return generatePerlinTexture(width, height, recipe);
    case 'voronoi':
      return generateVoronoiTexture(width, height, recipe);
    case 'checker':
      return generateCheckerboardTexture(width, height, recipe);
    case 'stripes':
      return generateStripesTexture(width, height, recipe);
    case 'mosaic':
      return generateMosaicTexture(width, height, recipe);
    default: {
      const _exhaustive: never = recipe;
      throw new Error(`Unsupported pattern generator type: ${(recipe as any).type}`);
    }
  }
}
