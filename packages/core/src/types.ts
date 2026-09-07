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
   * Palette of RGBA colors used for the random dot substrate.
   * Default: Black and White ([ [0, 0, 0, 255], [255, 255, 255, 255] ]).
   */
  palette?: RgbaColor[];

  /**
   * Custom pseudo-random number generator returning a float in [0.0, 1.0).
   * Useful for deterministic testing.
   * Default: Math.random.
   */
  random?: () => number;
}

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

