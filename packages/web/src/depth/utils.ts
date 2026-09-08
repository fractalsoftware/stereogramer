/**
 * Shared utility functions for buffer conversions in depth processing.
 */

/**
 * Converts an ArrayBuffer, Uint8ClampedArray, or Uint8Array into a Uint8ClampedArray view.
 */
export function toUint8ClampedArray(
  data: ArrayBuffer | Uint8ClampedArray | Uint8Array
): Uint8ClampedArray {
  if (data instanceof ArrayBuffer) {
    return new Uint8ClampedArray(data);
  }
  if (data instanceof Uint8ClampedArray) {
    return data;
  }
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}
