import type { BilinearResampleOptions } from './types.js';

/**
 * Resamples a 2D normalized depth Float32Array of size (srcW x srcH)
 * to target dimensions (dstW x dstH) using bilinear interpolation.
 *
 * Guarantees that all output values strictly adhere to the [0.0, 1.0] bounds invariant.
 */
export function resampleBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  options: BilinearResampleOptions = {}
): Float32Array {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    throw new Error(
      `Invalid dimensions for bilinear resampling: src=${srcW}x${srcH}, dst=${dstW}x${dstH}. Dimensions must be positive integers.`
    );
  }

  if (src.length !== srcW * srcH) {
    throw new Error(
      `Source buffer length (${src.length}) does not match specified dimensions (${srcW}x${srcH} = ${srcW * srcH})`
    );
  }

  // Fast path: identical dimensions
  if (srcW === dstW && srcH === dstH) {
    return new Float32Array(src);
  }

  const { alignCorners = true } = options;
  const dst = new Float32Array(dstW * dstH);

  const xScale = alignCorners
    ? dstW > 1
      ? (srcW - 1) / (dstW - 1)
      : 0
    : srcW / dstW;

  const yScale = alignCorners
    ? dstH > 1
      ? (srcH - 1) / (dstH - 1)
      : 0
    : srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    let v: number;
    if (alignCorners) {
      v = y * yScale;
    } else {
      v = (y + 0.5) * yScale - 0.5;
      if (v < 0) v = 0;
      if (v > srcH - 1) v = srcH - 1;
    }

    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const dy = v - y0;

    const row0Offset = y0 * srcW;
    const row1Offset = y1 * srcW;
    const dstRowOffset = y * dstW;

    for (let x = 0; x < dstW; x++) {
      let u: number;
      if (alignCorners) {
        u = x * xScale;
      } else {
        u = (x + 0.5) * xScale - 0.5;
        if (u < 0) u = 0;
        if (u > srcW - 1) u = srcW - 1;
      }

      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const dx = u - x0;

      const v00 = src[row0Offset + x0]!;
      const v10 = src[row0Offset + x1]!;
      const v01 = src[row1Offset + x0]!;
      const v11 = src[row1Offset + x1]!;

      // Bilinear formula:
      // top = (1 - dx) * v00 + dx * v10
      // bottom = (1 - dx) * v01 + dx * v11
      // val = (1 - dy) * top + dy * bottom
      const top = v00 * (1.0 - dx) + v10 * dx;
      const bottom = v01 * (1.0 - dx) + v11 * dx;
      let val = top * (1.0 - dy) + bottom * dy;

      // Invariant clamp to [0.0, 1.0]
      if (val < 0.0) val = 0.0;
      else if (val > 1.0) val = 1.0;

      dst[dstRowOffset + x] = val;
    }
  }

  return dst;
}

/**
 * Bilinearly resamples an RGBA Uint8/Uint8ClampedArray image buffer.
 */
export function resampleRgba(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    throw new Error(`Invalid dimensions for RGBA resampling: ${srcW}x${srcH} -> ${dstW}x${dstH}`);
  }

  if (src.length < srcW * srcH * 4) {
    throw new Error(`Source RGBA buffer length (${src.length}) is smaller than ${srcW}x${srcH}x4`);
  }

  if (srcW === dstW && srcH === dstH) {
    return new Uint8ClampedArray(src);
  }

  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const yScale = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  for (let y = 0; y < dstH; y++) {
    const v = y * yScale;
    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const dy = v - y0;

    const row0Offset = y0 * srcW * 4;
    const row1Offset = y1 * srcW * 4;
    const dstRowOffset = y * dstW * 4;

    for (let x = 0; x < dstW; x++) {
      const u = x * xScale;
      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const dx = u - x0;

      const idx00 = row0Offset + x0 * 4;
      const idx10 = row0Offset + x1 * 4;
      const idx01 = row1Offset + x0 * 4;
      const idx11 = row1Offset + x1 * 4;
      const outIdx = dstRowOffset + x * 4;

      for (let c = 0; c < 4; c++) {
        const c00 = src[idx00 + c]!;
        const c10 = src[idx10 + c]!;
        const c01 = src[idx01 + c]!;
        const c11 = src[idx11 + c]!;

        const top = c00 * (1.0 - dx) + c10 * dx;
        const bottom = c01 * (1.0 - dx) + c11 * dx;
        dst[outIdx + c] = Math.round(top * (1.0 - dy) + bottom * dy);
      }
    }
  }

  return dst;
}
