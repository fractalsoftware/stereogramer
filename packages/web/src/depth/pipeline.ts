import type { DepthMap, DepthPipelineOptions, RawImageInput } from './types.js';
import { normalizeDepth, validateDepthInvariant } from './normalizer.js';
import { resampleBilinear } from './resampler.js';
import { preprocessImage } from './preprocessor.js';
import { generateSyntheticDepth } from './synthetic.js';

export { normalizeDepth, validateDepthInvariant } from './normalizer.js';
export { resampleBilinear, resampleRgba } from './resampler.js';
export { preprocessImage, computeAspectFitDimensions } from './preprocessor.js';
export { generateSyntheticDepth } from './synthetic.js';

/**
 * Runs the end-to-end depth estimation pipeline.
 *
 * 1. Preprocesses the input image to the target model resolution while preserving aspect ratio.
 * 2. Executes depth estimation (synthetic fallback for Ticket 1 / offline mode).
 * 3. Enforces strict min-max normalization into [0.0, 1.0] Depth Polarity bounds.
 * 4. Bilinearly resamples the elevation field to match requested target dimensions.
 * 5. Dispatches fine-grained progress updates at each stage.
 */
export async function runDepthPipeline(
  image: RawImageInput,
  options: DepthPipelineOptions = {}
): Promise<DepthMap> {
  const { onProgress } = options;

  onProgress?.('init', 0.05, 'Initializing depth pipeline...');

  if (!image || image.width <= 0 || image.height <= 0) {
    throw new Error(
      `Invalid image dimensions: ${image ? `${image.width}x${image.height}` : 'null'}`
    );
  }

  const rawBytes =
    image.data instanceof ArrayBuffer
      ? new Uint8ClampedArray(image.data)
      : image.data instanceof Uint8ClampedArray
      ? image.data
      : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  if (rawBytes.length < image.width * image.height * 4) {
    throw new Error(
      `Corrupted image buffer: expected at least ${image.width * image.height * 4} bytes, got ${rawBytes.length}`
    );
  }

  onProgress?.('preprocessing', 0.2, 'Preprocessing input image...');

  const modelResolution = options.modelResolution ?? 518;
  const preprocessed = preprocessImage(
    {
      width: image.width,
      height: image.height,
      data: rawBytes,
    },
    modelResolution
  );

  onProgress?.('estimating', 0.5, 'Estimating depth elevation field...');

  // Ticket 1: deterministic synthetic depth elevation field
  // (In Ticket 2, this hooks into the Transformers.js ONNX runtime)
  const syntheticResult = generateSyntheticDepth(preprocessed, {
    mode: options.syntheticMode ?? 'hybrid',
    invert: options.invert ?? false,
  });

  onProgress?.('normalizing', 0.8, 'Normalizing depth map to [0.0, 1.0] bounds...');

  let normalizedData = normalizeDepth(syntheticResult.data, {
    invert: false, // Inversion already handled in estimation step if requested
  });

  if (!validateDepthInvariant(normalizedData)) {
    throw new Error('Depth normalization invariant violation: values outside [0.0, 1.0]');
  }

  let finalWidth = syntheticResult.width;
  let finalHeight = syntheticResult.height;

  const targetW = options.targetWidth;
  const targetH = options.targetHeight;

  if (
    targetW !== undefined &&
    targetH !== undefined &&
    targetW > 0 &&
    targetH > 0 &&
    (targetW !== finalWidth || targetH !== finalHeight)
  ) {
    onProgress?.('resampling', 0.9, `Resampling depth map to ${targetW}x${targetH}...`);
    normalizedData = resampleBilinear(normalizedData, finalWidth, finalHeight, targetW, targetH);
    finalWidth = targetW;
    finalHeight = targetH;
  }

  onProgress?.('complete', 1.0, 'Depth estimation complete');

  return {
    width: finalWidth,
    height: finalHeight,
    data: normalizedData,
  };
}
