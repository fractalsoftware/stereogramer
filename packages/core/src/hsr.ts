import type { ConvergenceMode } from './types.js';

/**
 * Checks visibility for a pixel using Thimbleby-Inglis-Witten geometric ray testing.
 *
 * Hidden Surface Removal (HSR):
 * Projects lines of sight from virtual left and right eye positions to the 3D surface point (x, z).
 * If any intervening surface feature at offset t has elevation exceeding the ray height zt,
 * the sightline is occluded and the constraint must be discarded.
 *
 * @param x Horizontal pixel coordinate.
 * @param z Effective normalized depth at x in [0.0, 1.0].
 * @param depthRow Flat array of normalized depth values along the current scanline.
 * @param width Scanline width in pixels.
 * @param baseSeparation Base pattern separation in pixels (eyeSep = 2 * baseSeparation).
 * @param depthFactor User depth intensity in [0.0, 1.0].
 * @param convergenceMode 'parallel' or 'cross'.
 * @returns true if the surface point is visible to both eyes without occlusion.
 */
export function isSurfaceVisible(
  x: number,
  z: number,
  depthRow: Float32Array,
  width: number,
  baseSeparation: number,
  depthFactor: number = 1.0,
  convergenceMode: ConvergenceMode = 'parallel'
): boolean {
  const f = Math.max(0, Math.min(1, depthFactor));
  const mu = 0.5 * f;
  if (mu <= 0) {
    return true;
  }

  const eyeSep = 2.0 * Math.max(1, baseSeparation);
  const slope = (2.0 * (2.0 - mu * z)) / (mu * eyeSep);
  const isCross = convergenceMode === 'cross';

  let t = 1;
  while (true) {
    const zt = z + slope * t;
    if (zt >= 1.0) {
      break;
    }

    const left = x - t;
    const right = x + t;

    if (left < 0 && right >= width) {
      break;
    }

    if (left >= 0) {
      let zLeft = depthRow[left]!;
      if (isCross) {
        zLeft = 1.0 - zLeft;
      }
      if (zLeft >= zt) {
        return false;
      }
    }

    if (right < width) {
      let zRight = depthRow[right]!;
      if (isCross) {
        zRight = 1.0 - zRight;
      }
      if (zRight >= zt) {
        return false;
      }
    }

    t++;
  }

  return true;
}
