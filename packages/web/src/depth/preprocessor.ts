import type { RawImageInput } from './types.js';
import { resampleRgba } from './resampler.js';

/**
 * Calculates aspect-ratio-preserving dimensions that fit within maxDim x maxDim.
 */
export function computeAspectFitDimensions(
  srcW: number,
  srcH: number,
  maxDim: number = 518
): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Invalid dimensions for aspect fit: ${srcW}x${srcH}`);
  }

  const maxDimension = Math.max(srcW, srcH);
  if (maxDimension <= maxDim) {
    return { width: srcW, height: srcH };
  }

  const scale = maxDim / maxDimension;
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  return { width, height };
}

/**
 * Preprocesses an input image buffer:
 * Ensures typed array format and scales to the model's preferred resolution
 * while strictly maintaining aspect ratio and memory efficiency.
 */
export function preprocessImage(
  image: RawImageInput,
  targetResolution: number = 518
): { width: number; height: number; data: Uint8ClampedArray } {
  if (image.width <= 0 || image.height <= 0) {
    throw new Error(`Invalid image dimensions: ${image.width}x${image.height}`);
  }

  const rawBytes =
    image.data instanceof ArrayBuffer
      ? new Uint8ClampedArray(image.data)
      : image.data instanceof Uint8ClampedArray
      ? image.data
      : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  const minBytesNeeded = image.width * image.height * 4;
  if (rawBytes.length < minBytesNeeded) {
    throw new Error(
      `Image data length (${rawBytes.length}) is smaller than required RGBA size (${minBytesNeeded} bytes for ${image.width}x${image.height})`
    );
  }

  const { width: fitW, height: fitH } = computeAspectFitDimensions(
    image.width,
    image.height,
    targetResolution
  );

  if (fitW === image.width && fitH === image.height) {
    return {
      width: fitW,
      height: fitH,
      data: rawBytes,
    };
  }

  const scaledData = resampleRgba(rawBytes, image.width, image.height, fitW, fitH);

  return {
    width: fitW,
    height: fitH,
    data: scaledData,
  };
}
