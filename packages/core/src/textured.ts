import type { DepthMap, RgbaImage, TexturedStereogramOptions } from './types.js';
import { calculateSeparation, getDefaultPatternSeparation } from './separation.js';
import { isSurfaceVisible } from './hsr.js';

/**
 * Generates a Textured Single Image Stereogram (Textured SIS) from a depth map
 * and a pattern texture image buffer.
 *
 * Implements the Thimbleby-Inglis-Witten (TIW) algorithm with ray-marching
 * Hidden Surface Removal (HSR). Disjoint-set equivalence chains inherit
 * colors from the pattern buffer tiled horizontally and vertically.
 *
 * Flat depth maps reproduce the pattern with exact periodic repetition at
 * the calculated separation period without distortion.
 *
 * @param depthMap Normalized elevation field (0.0 = background, 1.0 = foreground).
 * @param pattern RGBA texture pattern pixel buffer.
 * @param options Generation options (convergence mode, separation override, depth factor).
 * @returns RgbaImage containing the rendered autostereogram.
 */
export function generateTexturedStereogram(
  depthMap: DepthMap,
  pattern: RgbaImage,
  options: TexturedStereogramOptions = {}
): RgbaImage {
  const { width, height, data: depthData } = depthMap;

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid depth map dimensions: ${width}x${height}`);
  }
  if (depthData.length < width * height) {
    throw new Error(
      `Depth map buffer size mismatch: expected at least ${width * height} elements, got ${depthData.length}`
    );
  }

  const { width: patWidth, height: patHeight, data: patData } = pattern;

  if (patWidth <= 0 || patHeight <= 0) {
    throw new Error(`Invalid pattern dimensions: ${patWidth}x${patHeight}`);
  }
  if (patData.length < patWidth * patHeight * 4) {
    throw new Error(
      `Pattern buffer size mismatch: expected at least ${patWidth * patHeight * 4} bytes, got ${patData.length}`
    );
  }

  const convergenceMode = options.convergenceMode ?? 'parallel';
  const depthFactor = options.depthFactor ?? 1.0;
  const hsr = options.hsr !== false;
  const baseSeparation = Math.max(
    1,
    Math.round(options.patternSeparation ?? getDefaultPatternSeparation(width))
  );

  const outPixels = new Uint8ClampedArray(width * height * 4);

  // Scanline working buffers (allocated once to avoid GC pressure)
  const same = new Int32Array(width);
  const rowDepth = new Float32Array(width);
  const leftmost = new Int32Array(width);

  // Path compression find helper
  function findRoot(x: number): number {
    let r = x;
    while (same[r] !== r) {
      r = same[r]!;
    }
    // Path compression
    let curr = x;
    while (curr !== r) {
      const next = same[curr]!;
      same[curr] = r;
      curr = next;
    }
    return r;
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const patY = ((y % patHeight) + patHeight) % patHeight;
    const patRowOffset = patY * patWidth * 4;

    // 1. Copy scanline depth data
    for (let x = 0; x < width; x++) {
      rowDepth[x] = depthData[rowOffset + x]!;
    }

    // 2. Initialize disjoint-set constraints: each pixel starts linked to itself
    for (let x = 0; x < width; x++) {
      same[x] = x;
    }

    // 3. Compute scanline geometric constraints with Hidden Surface Removal
    for (let x = 0; x < width; x++) {
      const rawZ = rowDepth[x]!;
      const z = convergenceMode === 'cross' ? 1.0 - rawZ : rawZ;
      const sep = calculateSeparation(rawZ, baseSeparation, depthFactor, convergenceMode);

      // Symmetric ocular projection offset
      const offset = Math.floor(sep / 2);
      let left = x - offset;
      let right = left + sep;

      if (left >= 0 && right < width) {
        const visible = !hsr || isSurfaceVisible(
          x,
          z,
          rowDepth,
          width,
          baseSeparation,
          depthFactor,
          convergenceMode
        );

        if (visible) {
          // TIW Disjoint-Set Union: merge left and right equivalence classes
          for (let k = same[left]!; k !== left && k !== right; k = same[left]!) {
            if (k < right) {
              left = k;
            } else {
              left = right;
              right = k;
            }
          }
          same[left] = right;
        }
      }
    }

    // 4. Resolve equivalence classes to determine canonical root and leftmost pixel.
    // Reset leftmost lookup table
    leftmost.fill(-1);

    // Forward pass: find the minimum (leftmost) coordinate in each equivalence class
    for (let x = 0; x < width; x++) {
      const root = findRoot(x);
      if (leftmost[root] === -1) {
        leftmost[root] = x;
      }
    }

    // 5. Assign RGBA colors: every pixel in a constraint chain inherits the color
    // from the pattern buffer tiled horizontally at the chain's canonical leftmost coordinate.
    const outRowByteOffset = rowOffset * 4;
    for (let x = 0; x < width; x++) {
      const root = same[x]!; // Compressed to root by findRoot in the previous pass
      const minX = leftmost[root]!;
      const patX = minX % patWidth;
      const patOffset = patRowOffset + patX * 4;
      const outOffset = outRowByteOffset + x * 4;

      outPixels[outOffset] = patData[patOffset]!;
      outPixels[outOffset + 1] = patData[patOffset + 1]!;
      outPixels[outOffset + 2] = patData[patOffset + 2]!;
      outPixels[outOffset + 3] = patData[patOffset + 3]!;
    }
  }

  return {
    width,
    height,
    data: outPixels,
  };
}
