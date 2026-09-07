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
