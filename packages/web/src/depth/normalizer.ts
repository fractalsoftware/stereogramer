import type { NormalizeDepthOptions } from './types.js';

/**
 * Validates that all elements of a depth buffer strictly satisfy the [0.0, 1.0] bounds invariant
 * with no NaN or infinite values.
 *
 * In accordance with Depth Polarity:
 * 0.0 represents the furthest background plane.
 * 1.0 represents the closest foreground plane.
 */
export function validateDepthInvariant(data: Float32Array): boolean {
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v) || v < 0.0 || v > 1.0) {
      return false;
    }
  }
  return true;
}

/**
 * Computes the minimum and maximum finite values across a raw depth/disparity array.
 */
export function getDepthExtrema(rawDepth: Float32Array | ArrayLike<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < rawDepth.length; i++) {
    const v = rawDepth[i]!;
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  return { min, max };
}

/**
 * Min-max depth normalizer:
 * Converts raw model disparity/depth logits into a [0.0, 1.0] Float32Array
 * where 0.0 is the furthest background and 1.0 is the nearest foreground.
 *
 * Strictly clamps all output values and enforces domain boundary invariants.
 */
export function normalizeDepth(
  rawDepth: Float32Array | ArrayLike<number>,
  options: NormalizeDepthOptions = {}
): Float32Array {
  const len = rawDepth.length;
  const result = new Float32Array(len);

  if (len === 0) {
    return result;
  }

  const { invert = false, min: optMin, max: optMax } = options;

  let min = optMin;
  let max = optMax;

  if (min === undefined || max === undefined) {
    const extrema = getDepthExtrema(rawDepth);
    if (min === undefined) min = extrema.min;
    if (max === undefined) max = extrema.max;
  }

  // Handle degenerate case: array contains only non-finite values
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    result.fill(invert ? 1.0 : 0.0);
    return result;
  }

  // Handle degenerate case: uniform array where min === max
  if (max <= min) {
    // If the uniform value is already in [0, 1], preserve it clamped; otherwise map to 0.0 baseline
    let uniformVal = 0.0;
    if (min >= 0.0 && min <= 1.0) {
      uniformVal = min;
    }
    if (invert) {
      uniformVal = 1.0 - uniformVal;
    }
    result.fill(Math.min(1.0, Math.max(0.0, uniformVal)));
    return result;
  }

  const range = max - min;
  const scale = 1.0 / range;

  for (let i = 0; i < len; i++) {
    const v = rawDepth[i]!;
    let norm: number;

    if (!Number.isFinite(v)) {
      norm = 0.0;
    } else {
      norm = (v - min) * scale;
    }

    // Strictly clamp within [0.0, 1.0] to prevent floating point overshoot
    if (norm < 0.0) norm = 0.0;
    else if (norm > 1.0) norm = 1.0;

    if (invert) {
      norm = 1.0 - norm;
    }

    result[i] = norm;
  }

  return result;
}
