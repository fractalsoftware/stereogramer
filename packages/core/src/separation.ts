import type { ConvergenceMode } from './types.js';

/**
 * Maximum horizontal disparity ceiling: 33.33% of base separation width.
 * Prevents ocular strain in accordance with physiological limits.
 */
export const MAX_DISPARITY_FRACTION = 1.0 / 3.0;

/**
 * Calculates the horizontal stereo separation in pixels for a given normalized depth value.
 *
 * Implements the Thimbleby-Inglis-Witten similar-triangles formulation:
 * sep(z) = (1 - mu * z) / (2 - mu * z) * 2 * S
 * where S is base separation and mu modulates depth of field.
 *
 * Physiological Disparity Cap: Hard clamp guarantees maximum disparity does not exceed
 * 33% of base separation S, scaled by depthFactor.
 *
 * Convergence Symmetry: cross-eyed mode inverts the depth vector (z -> 1 - z).
 *
 * @param depth Normalized depth elevation in [0.0, 1.0] (0 = background, 1 = foreground).
 * @param baseSeparation Base horizontal pattern separation at depth = 0 (pixels).
 * @param depthFactor Depth intensity factor in [0.0, 1.0] (default 1.0).
 * @param convergenceMode Ocular convergence mode ('parallel' or 'cross', default 'parallel').
 * @returns Stereo separation in pixels (integer).
 */
export function calculateSeparation(
  depth: number,
  baseSeparation: number,
  depthFactor: number = 1.0,
  convergenceMode: ConvergenceMode = 'parallel'
): number {
  const S = Math.max(1, Math.round(baseSeparation));
  const f = Math.max(0, Math.min(1, depthFactor));
  let z = Number.isFinite(depth) ? Math.max(0, Math.min(1, depth)) : 0;

  if (convergenceMode === 'cross') {
    z = 1.0 - z;
  }

  const mu = 0.5 * f;
  if (mu <= 0) {
    return S;
  }

  const sep = Math.round(((1.0 - mu * z) / (2.0 - mu * z)) * 2.0 * S);
  const minSeparation = Math.floor(S * (1.0 - MAX_DISPARITY_FRACTION * f));
  return Math.max(minSeparation, Math.min(S, sep));
}
