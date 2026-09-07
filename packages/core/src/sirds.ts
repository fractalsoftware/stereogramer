import { calculateSeparation } from './separation.js';
import { isSurfaceVisible } from './hsr.js';
import type { DepthMap, RgbaColor, RgbaImage, SirdsOptions, ConvergenceMode } from './types.js';

export const DEFAULT_PALETTE: RgbaColor[] = [
  [0, 0, 0, 255],       // Black
  [255, 255, 255, 255], // White
];

export interface ScanlineConstraintOptions {
  baseSeparation: number;
  depthFactor?: number;
  convergenceMode?: ConvergenceMode;
  hsr?: boolean;
}

/**
 * Computes disjoint-set pixel equivalence constraints for a single scanline
 * using the Thimbleby-Inglis-Witten (TIW) algorithm with Hidden Surface Removal.
 *
 * Each element in the returned Int32Array points to itself (if unconstrained)
 * or to a pixel to its right (link > x) that must share the same color.
 */
export function computeScanlineConstraints(
  depthRow: Float32Array,
  width: number,
  y: number,
  options: ScanlineConstraintOptions
): Int32Array {
  const { baseSeparation, depthFactor = 1.0, convergenceMode = 'parallel', hsr = true } = options;
  const same = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    same[x] = x;
  }

  for (let x = 0; x < width; x++) {
    const rawZ = depthRow[x] ?? 0;
    const z = convergenceMode === 'cross' ? 1.0 - rawZ : rawZ;
    const sep = calculateSeparation(rawZ, baseSeparation, depthFactor, convergenceMode);

    // Stagger odd/even scanlines by half-pixel parity to eliminate vertical banding
    const offset = Math.floor((sep + (sep & y & 1)) / 2);
    let left = x - offset;
    let right = left + sep;

    if (left >= 0 && right < width) {
      const visible = !hsr || isSurfaceVisible(
        x,
        z,
        depthRow,
        width,
        baseSeparation,
        depthFactor,
        convergenceMode
      );

      if (visible) {
        // Enforce equivalence constraint between left and right pixels
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

  return same;
}

/**
 * Generates a Single Image Random Dot Stereogram (SIRDS) from a normalized depth map.
 *
 * Implements the CPU-based Thimbleby-Inglis-Witten (TIW) constraint-linking algorithm
 * with geometric Hidden Surface Removal (HSR) and Disjoint-Set pixel clustering.
 *
 * Guaranteed O(W * H) runtime and zero external dependencies.
 */
export function generateSirds(depthMap: DepthMap, options: SirdsOptions = {}): RgbaImage {
  const { width, height, data } = depthMap;
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid depth map dimensions: ${width}x${height}`);
  }

  const dotScale = Math.max(1, Math.floor(options.dotScale ?? 1));
  const palette = options.palette && options.palette.length > 0 ? options.palette : DEFAULT_PALETTE;
  const random = options.random ?? Math.random;
  const convergenceMode = options.convergenceMode ?? 'parallel';
  const depthFactor = options.depthFactor ?? 1.0;
  const hsr = options.hsr !== false;
  const baseSeparation = Math.max(1, Math.round(options.patternSeparation ?? Math.round(width / 8)));

  const outPixels = new Uint8ClampedArray(width * height * 4);

  if (dotScale <= 1) {
    const same = new Int32Array(width);
    const colorIndices = new Int16Array(width);
    const rowDepth = new Float32Array(width);
    const numColors = palette.length;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        rowDepth[x] = data[rowOffset + x]!;
      }

      for (let x = 0; x < width; x++) {
        same[x] = x;
      }

      for (let x = 0; x < width; x++) {
        const rawZ = rowDepth[x]!;
        const z = convergenceMode === 'cross' ? 1.0 - rawZ : rawZ;
        const sep = calculateSeparation(rawZ, baseSeparation, depthFactor, convergenceMode);

        const offset = Math.floor((sep + (sep & y & 1)) / 2);
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

      // Backward scan: since same[x] > x for all constrained pixels,
      // higher indices have already received their resolved color.
      for (let x = width - 1; x >= 0; x--) {
        const link = same[x]!;
        if (link === x) {
          colorIndices[x] = Math.floor(random() * numColors);
        } else {
          colorIndices[x] = colorIndices[link]!;
        }

        const color = palette[colorIndices[x]!]!;
        const pixelOffset = (rowOffset + x) * 4;
        outPixels[pixelOffset] = color[0];
        outPixels[pixelOffset + 1] = color[1];
        outPixels[pixelOffset + 2] = color[2];
        outPixels[pixelOffset + 3] = color[3];
      }
    }
  } else {
    // Scaled dot block size
    const scaledW = Math.max(1, Math.floor(width / dotScale));
    const scaledH = Math.max(1, Math.floor(height / dotScale));
    const scaledSep = Math.max(1, Math.round(baseSeparation / dotScale));

    const scaledDepth = new Float32Array(scaledW * scaledH);
    for (let sy = 0; sy < scaledH; sy++) {
      const origY = Math.min(height - 1, sy * dotScale);
      for (let sx = 0; sx < scaledW; sx++) {
        const origX = Math.min(width - 1, sx * dotScale);
        scaledDepth[sy * scaledW + sx] = data[origY * width + origX]!;
      }
    }

    const scaledImage = generateSirds(
      { width: scaledW, height: scaledH, data: scaledDepth },
      {
        ...options,
        dotScale: 1,
        patternSeparation: scaledSep,
      }
    );

    for (let y = 0; y < height; y++) {
      const sy = Math.min(scaledH - 1, Math.floor(y / dotScale));
      const rowOffset = y * width * 4;
      const sRowOffset = sy * scaledW * 4;
      for (let x = 0; x < width; x++) {
        const sx = Math.min(scaledW - 1, Math.floor(x / dotScale));
        const srcOffset = sRowOffset + sx * 4;
        const dstOffset = rowOffset + x * 4;
        outPixels[dstOffset] = scaledImage.data[srcOffset]!;
        outPixels[dstOffset + 1] = scaledImage.data[srcOffset + 1]!;
        outPixels[dstOffset + 2] = scaledImage.data[srcOffset + 2]!;
        outPixels[dstOffset + 3] = scaledImage.data[srcOffset + 3]!;
      }
    }
  }

  return { width, height, data: outPixels };
}
