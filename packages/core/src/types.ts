/**
 * Convergence mode for viewing an autostereogram:
 * - 'parallel': Wall-eyed viewing (eyes diverge towards infinity).
 * - 'cross': Cross-eyed viewing (eyes converge in front of the image plane).
 */
export type ConvergenceMode = 'parallel' | 'cross';

/**
 * RGBA color tuple: [Red, Green, Blue, Alpha], each 0..255.
 */
export type RgbaColor = [number, number, number, number];

/**
 * Normalized elevation depth map.
 * In accordance with Depth Polarity, 0.0 represents the farthest background plane,
 * and 1.0 represents the closest foreground plane.
 */
export interface DepthMap {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/**
 * Raw RGBA pixel image buffer with dimension descriptors.
 */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * Configuration options for generating a Single Image Random Dot Stereogram (SIRDS).
 */
export interface SirdsOptions {
  /**
   * Ocular convergence alignment mode.
   * Default: 'parallel'.
   */
  convergenceMode?: ConvergenceMode;

  /**
   * Base horizontal pattern separation in pixels at the background plane (depth = 0).
   * Default: Math.round(width / 8).
   */
  patternSeparation?: number;

  /**
   * Depth intensity factor in [0.0, 1.0], modulating horizontal disparity.
   * Default: 1.0.
   */
  depthFactor?: number;

  /**
   * Pixel block dimension of individual noise elements in a SIRDS.
   * Default: 1.
   */
  dotScale?: number;

  /**
   * Enable geometric Hidden Surface Removal (HSR).
   * When true (default), ray casting detects and breaks occluded constraint links
   * behind foreground surface steps, eliminating ghost echoes and visual shearing.
   * Default: true.
   */
  hsr?: boolean;

  /**
   * Palette of RGBA colors or named preset used for the random dot substrate.
   * Default: Black and White ('bw').
   */
  palette?: RgbaColor[] | SirdsPaletteName;

  /**
   * Custom pseudo-random number generator returning a float in [0.0, 1.0).
   * Useful for deterministic testing.
   * Default: Math.random.
   */
  random?: () => number;
}

/**
 * Named color palettes for SIRDS noise substrate.
 */
export type SirdsPaletteName = 'bw' | 'grayscale' | 'rgb' | 'duotone';

/**
 * Procedural generator algorithm types for autostereogram substrates.
 */
export type PatternGeneratorType =
  | 'perlin'
  | 'voronoi'
  | 'checker'
  | 'stripes'
  | 'mosaic';

/**
 * Options for generating seamless procedural Perlin noise textures.
 */
export interface PerlinTextureOptions {
  /** Frequency / feature scale. Default: 4. */
  scale?: number;
  /** Octaves of noise summation. Default: 3. */
  octaves?: number;
  /** Primary foreground color. Default: [56, 189, 248, 255] (sky cyan). */
  colorA?: RgbaColor;
  /** Background / secondary color. Default: [15, 23, 42, 255] (slate dark). */
  colorB?: RgbaColor;
  /** Random seed for procedural variations. Default: 100. */
  seed?: number;
}

/**
 * Options for generating seamless procedural Voronoi cellular textures.
 */
export interface VoronoiTextureOptions {
  /** Number of cell seed centers. Default: 16. */
  numCells?: number;
  /** Alias for numCells (cell center count). */
  count?: number;
  /** Cell interior color. Default: [236, 72, 153, 255] (pink). */
  colorA?: RgbaColor;
  /** Cell boundary edge color. Default: [30, 41, 59, 255] (slate). */
  colorB?: RgbaColor;
  /** Random seed for cell center placement. Default: 0. */
  seed?: number;
}

/**
 * Options for generating procedural checkerboard tile textures.
 */
export interface CheckerTextureOptions {
  /** Size of each square cell in pixels. Default: 10. */
  cellSize?: number;
  /** Feature scale (alias for cellSize). */
  scale?: number;
  /** Primary square color. Default: [56, 189, 248, 255] (sky cyan). */
  colorA?: RgbaColor;
  /** Secondary square color. Default: [30, 41, 59, 255] (slate dark). */
  colorB?: RgbaColor;
  /** Random seed for procedural variation. Default: 0. */
  seed?: number;
}

/**
 * Options for generating procedural color stripe textures.
 */
export interface StripesTextureOptions {
  /** Width of each stripe band in pixels. Default: 10. */
  stripeWidth?: number;
  /** Feature scale / stripe width (alias for stripeWidth). */
  scale?: number;
  /** Cell size (alias for stripeWidth). */
  cellSize?: number;
  /** Palette of colors for the stripe bands. */
  colors?: RgbaColor[];
  /** Primary color (used if colors array is omitted). */
  colorA?: RgbaColor;
  /** Secondary color (used if colors array is omitted). */
  colorB?: RgbaColor;
  /** Stripe orientation: 'vertical' (standard for autostereograms) or 'horizontal'. Default: 'vertical'. */
  direction?: 'vertical' | 'horizontal';
  /** Random seed for phase / color variation. Default: 0. */
  seed?: number;
}

/**
 * Options for generating procedural dot mosaic textures.
 */
export interface MosaicTextureOptions {
  /** Grid cell dimension in pixels. Default: 20. */
  cellSize?: number;
  /** Dot radius in pixels. Default: 7. */
  dotRadius?: number;
  /** Feature scale (alias for cellSize). */
  scale?: number;
  /** Dot foreground color. Default: [236, 72, 153, 255] (pink). */
  colorA?: RgbaColor;
  /** Background color. Default: [15, 23, 42, 255] (slate dark). */
  colorB?: RgbaColor;
  /** Random seed for procedural variation. Default: 0. */
  seed?: number;
}

/**
 * Canonical discriminated union representing a declarative procedural substrate recipe.
 * Synchronized dynamically with Pattern Separation.
 */
export type PatternRecipe =
  | ({ type: 'perlin' } & PerlinTextureOptions)
  | ({ type: 'voronoi' } & VoronoiTextureOptions)
  | ({ type: 'checker' } & CheckerTextureOptions)
  | ({ type: 'stripes' } & StripesTextureOptions)
  | ({ type: 'mosaic' } & MosaicTextureOptions);

/**
 * Configuration options for generating a Textured Single Image Stereogram (Textured SIS).
 */
export interface TexturedStereogramOptions {
  /**
   * Ocular convergence alignment mode.
   * Default: 'parallel'.
   */
  convergenceMode?: ConvergenceMode;

  /**
   * Base horizontal pattern separation in pixels at the background plane (depth = 0).
   * Default: ~1/7 to 1/8 of stereogram width (Math.round(width / 8)).
   */
  patternSeparation?: number;

  /**
   * Depth intensity factor in [0.0, 1.0], modulating horizontal disparity.
   * Default: 1.0.
   */
  depthFactor?: number;

  /**
   * Enable geometric Hidden Surface Removal (HSR).
   * When true (default), ray casting detects and breaks occluded constraint links
   * behind foreground surface steps, eliminating ghost echoes and visual shearing.
   * Default: true.
   */
  hsr?: boolean;
}

/**
 * Unified configuration options for generating an autostereogram (SIRDS or Textured SIS).
 */
export interface AutostereogramOptions extends SirdsOptions {
  /**
   * Optional pattern image buffer for generating a Textured Single Image Stereogram (SIS).
   * When omitted, a Single Image Random Dot Stereogram (SIRDS) is generated.
   */
  pattern?: RgbaImage;
}

/**
 * Procedural geometric 3D primitives supported by the depth engine.
 */
export type DepthPrimitive =
  | 'sphere'
  | 'torus'
  | 'cone'
  | 'cylinder'
  | 'pyramid'
  | 'heart'
  | 'slanted'
  | 'box';

/**
 * Options for text rasterization into depth maps.
 */
export interface TextRasterOptions {
  /** Font size in pixels. Default: Math.round(height * 0.35). */
  fontSize?: number;
  /** Font weight (e.g. 'normal', 'bold', '900'). Default: 'bold'. */
  fontWeight?: string | number;
  /** Font family. Default: 'sans-serif'. */
  fontFamily?: string;
  /** Maximum elevation for text surface in [0.0, 1.0]. Default: 1.0. */
  peakDepth?: number;
  /** Background plane elevation in [0.0, 1.0]. Default: 0.0. */
  backgroundDepth?: number;
}

/**
 * Options for SVG path rasterization into depth maps.
 */
export interface SvgRasterOptions {
  /** Maximum elevation for shape surface in [0.0, 1.0]. Default: 1.0. */
  peakDepth?: number;
  /** Background plane elevation in [0.0, 1.0]. Default: 0.0. */
  backgroundDepth?: number;
  /** Fill rule: 'nonzero' | 'evenodd'. Default: 'nonzero'. */
  fillRule?: 'nonzero' | 'evenodd';
}

