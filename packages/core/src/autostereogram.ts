import type { AutostereogramOptions, DepthMap, RgbaImage } from './types.js';
import { generateSirds } from './sirds.js';
import { generateTexturedStereogram } from './textured.js';

/**
 * Unified autostereogram generator.
 *
 * When an image texture `pattern` is provided in options, generates a Textured Single Image
 * Stereogram (Textured SIS). Otherwise, generates a Single Image Random Dot Stereogram (SIRDS).
 *
 * @param depthMap Normalized elevation field (0.0 = background, 1.0 = foreground).
 * @param options Unified options (supports SIRDS noise palettes as well as texture patterns).
 * @returns RgbaImage containing the rendered autostereogram.
 */
export function generateAutostereogram(
  depthMap: DepthMap,
  options: AutostereogramOptions = {}
): RgbaImage {
  if (options.pattern) {
    return generateTexturedStereogram(depthMap, options.pattern, options);
  }
  return generateSirds(depthMap, options);
}
