import type { DepthMap, RawImageInput, SyntheticDepthOptions } from './types.js';
import { normalizeDepth } from './normalizer.js';
import { resampleBilinear } from './resampler.js';

/**
 * Generates a deterministic synthetic depth elevation field from an input image buffer.
 *
 * Combines a central spherical dome with luminance analysis to produce a fusible,
 * continuous depth map suitable for autostereogram generation.
 *
 * This provides a fast, zero-dependency, network-free fallback path for tests and offline environments.
 */
export function generateSyntheticDepth(
  image: RawImageInput,
  options: SyntheticDepthOptions = {}
): DepthMap {
  const { width: srcW, height: srcH } = image;

  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Invalid image dimensions for synthetic depth generation: ${srcW}x${srcH}`);
  }

  const rawBytes =
    image.data instanceof ArrayBuffer
      ? new Uint8ClampedArray(image.data)
      : image.data instanceof Uint8ClampedArray
      ? image.data
      : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  const minBytes = srcW * srcH * 4;
  if (rawBytes.length < minBytes) {
    throw new Error(
      `Image data length (${rawBytes.length}) is smaller than required ${srcW}x${srcH}x4 RGBA bytes`
    );
  }

  const mode = options.mode ?? 'hybrid';
  const invert = options.invert ?? false;

  const rawField = new Float32Array(srcW * srcH);

  const cx = (srcW - 1) / 2;
  const cy = (srcH - 1) / 2;
  const rx = Math.max(1, srcW / 2);
  const ry = Math.max(1, srcH / 2);

  for (let y = 0; y < srcH; y++) {
    const ny = (y - cy) / ry;
    const ny2 = ny * ny;
    const rowOffset = y * srcW;
    const byteRowOffset = y * srcW * 4;

    for (let x = 0; x < srcW; x++) {
      const nx = (x - cx) / rx;
      const r2 = nx * nx + ny2;

      // Spherical dome elevation: 1.0 at center, tapering to 0.0 at elliptical boundary
      const dome = r2 <= 1.0 ? Math.sqrt(1.0 - r2) : 0.0;

      // Standard perceptual luminance: (0.299 * R + 0.587 * G + 0.114 * B) / 255.0
      const pxOffset = byteRowOffset + x * 4;
      const r = rawBytes[pxOffset]!;
      const g = rawBytes[pxOffset + 1]!;
      const b = rawBytes[pxOffset + 2]!;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;

      let elevation: number;
      switch (mode) {
        case 'dome':
          elevation = dome;
          break;
        case 'luminance':
          elevation = lum;
          break;
        case 'hybrid':
        default:
          elevation = 0.6 * dome + 0.4 * lum;
          break;
      }

      rawField[rowOffset + x] = elevation;
    }
  }

  // Normalize depth values to strictly satisfy [0.0, 1.0] bounds invariant
  let normalized = normalizeDepth(rawField, { invert });

  // Resample to target dimensions if specified and different from source
  let finalWidth = srcW;
  let finalHeight = srcH;

  const { targetWidth, targetHeight } = options;
  if (
    targetWidth !== undefined &&
    targetHeight !== undefined &&
    targetWidth > 0 &&
    targetHeight > 0 &&
    (targetWidth !== srcW || targetHeight !== srcH)
  ) {
    normalized = resampleBilinear(normalized, srcW, srcH, targetWidth, targetHeight);
    finalWidth = targetWidth;
    finalHeight = targetHeight;
  }

  return {
    width: finalWidth,
    height: finalHeight,
    data: normalized,
  };
}
