import { env, pipeline, RawImage } from '@huggingface/transformers';
import type {
  DepthEstimationStage,
  DepthMap,
  DepthPipelineOptions,
  RawImageInput,
} from './types.js';
import { toUint8ClampedArray } from './utils.js';

export const DEFAULT_DEPTH_MODEL = 'onnx-community/Depth-Anything-V2-Small-ONNX';
export const DEFAULT_MODEL_DTYPE = 'q8';
export const DEFAULT_EXECUTION_DEVICE = 'auto' as const;

/**
 * Global singleton cache for the loaded transformers pipeline instance.
 */
let cachedPipelineInstance: any = null;
let cachedPipelineKey: string | null = null;

/**
 * Configures Transformers.js environment flags.
 * - Enables persistent browser caching for model weights
 * - Disables local filesystem searches in browser/worker contexts
 */
export function configureTransformersEnv(): void {
  // Persistent browser caching enabled (Cache API / IndexedDB) when available in the environment
  if (typeof caches !== 'undefined') {
    env.useBrowserCache = true;
  }

  // In browser or Web Worker environments, disallow local filesystem searches
  if (
    typeof window !== 'undefined' ||
    typeof self !== 'undefined' ||
    typeof (globalThis as any).importScripts === 'function'
  ) {
    env.allowLocalModels = false;
  }
}

// Automatically configure environment on module load
configureTransformersEnv();

/**
 * Options for configuring and instantiating the depth model pipeline.
 */
export interface DepthModelPipelineOptions {
  model?: string;
  dtype?: string;
  device?: 'auto' | 'webgpu' | 'wasm';
  onProgress?: (stage: DepthEstimationStage, progress: number, message?: string) => void;
  pipelineFactory?: (task: string, model: string, options: any) => Promise<any>;
}

/**
 * Creates and initializes a Transformers.js depth-estimation pipeline.
 *
 * Implements hardware acceleration priority:
 * 1. Attempts WebGPU initialization first when available.
 * 2. Gracefully falls back to WASM multi-threaded CPU inference if WebGPU
 *    is unsupported or context creation fails.
 * 3. Streams download progress notifications (stage: 'loading-model', percentage: 0..100).
 */
export async function createDepthModelPipeline(
  options: DepthModelPipelineOptions = {}
): Promise<any> {
  configureTransformersEnv();

  const model = options.model ?? DEFAULT_DEPTH_MODEL;
  const dtype = options.dtype ?? DEFAULT_MODEL_DTYPE;
  const device = options.device ?? DEFAULT_EXECUTION_DEVICE;
  const factory = options.pipelineFactory ?? pipeline;

  const progressCallback = (info: any) => {
    if (!options.onProgress || !info) return;

    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.round(info.progress);
      options.onProgress('loading-model', pct, `Downloading model weights (${pct}%)...`);
    } else if (info.status === 'initiate') {
      options.onProgress('loading-model', 0, `Initiating model download: ${info.file ?? model}...`);
    } else if (info.status === 'done') {
      options.onProgress('loading-model', 100, `Model download complete: ${info.file ?? model}`);
    } else if (info.status === 'download') {
      options.onProgress('loading-model', 0, `Downloading: ${info.file ?? model}...`);
    }
  };

  if (device === 'wasm') {
    return await factory('depth-estimation', model, {
      device: 'wasm',
      dtype,
      progress_callback: progressCallback,
    });
  }

  // Check if WebGPU is available in the current environment
  const hasWebGPU =
    typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;

  if (device === 'auto' && !hasWebGPU) {
    // Fast path to WASM when WebGPU is not supported by the client browser/worker
    return await factory('depth-estimation', model, {
      device: 'wasm',
      dtype,
      progress_callback: progressCallback,
    });
  }

  // Try WebGPU first
  try {
    return await factory('depth-estimation', model, {
      device: 'webgpu',
      dtype,
      progress_callback: progressCallback,
    });
  } catch (gpuError) {
    console.warn(
      'WebGPU depth estimation initialization failed, gracefully falling back to WASM:',
      gpuError
    );
    return await factory('depth-estimation', model, {
      device: 'wasm',
      dtype,
      progress_callback: progressCallback,
    });
  }
}

/**
 * Retrieves the cached pipeline or initializes a new one.
 * Ensures repeat calls reuse the cached in-memory pipeline.
 */
export async function getOrCreateModelPipeline(
  options: DepthModelPipelineOptions = {}
): Promise<any> {
  const model = options.model ?? DEFAULT_DEPTH_MODEL;
  const dtype = options.dtype ?? DEFAULT_MODEL_DTYPE;
  const device = options.device ?? DEFAULT_EXECUTION_DEVICE;
  const key = `${model}|${dtype}|${device}`;

  // When a custom factory is provided (e.g. in tests), bypass global singleton cache
  if (options.pipelineFactory) {
    return await createDepthModelPipeline(options);
  }

  if (cachedPipelineInstance && cachedPipelineKey === key) {
    options.onProgress?.('loading-model', 100, 'Model loaded from memory cache');
    return cachedPipelineInstance;
  }

  const pipelinePromise = createDepthModelPipeline(options);
  cachedPipelineInstance = await pipelinePromise;
  cachedPipelineKey = key;
  return cachedPipelineInstance;
}

/**
 * Resets the in-memory cached pipeline instance.
 * Useful for tests and memory disposal.
 */
export function resetModelPipeline(): void {
  cachedPipelineInstance = null;
  cachedPipelineKey = null;
}

/**
 * Executes depth estimation inference on an input image using the loaded model pipeline.
 * Handles tensor extraction, intermediate memory disposal, and dimension calculation.
 */
export async function inferDepthFromModel(
  pipelineInstance: any,
  imageInput: RawImageInput
): Promise<{ width: number; height: number; rawDepth: Float32Array }> {
  let rawImg: RawImage;
  if (imageInput instanceof RawImage) {
    rawImg = imageInput;
  } else {
    const rawBytes = toUint8ClampedArray(imageInput.data);

    rawImg = new RawImage(rawBytes, imageInput.width, imageInput.height, 4);
  }

  const output = await pipelineInstance(rawImg);
  const resultItem = Array.isArray(output) ? output[0] : output;

  if (!resultItem) {
    throw new Error('Depth estimation pipeline returned empty output');
  }

  let rawDepth: Float32Array;
  let outWidth: number;
  let outHeight: number;
  const toDispose: Array<{ dispose?: () => void }> = [];

  if (resultItem.predicted_depth) {
    const tensor = resultItem.predicted_depth;
    toDispose.push(tensor);
    const dims = tensor.dims || tensor.shape || [];
    outHeight = dims[dims.length - 2] ?? imageInput.height;
    outWidth = dims[dims.length - 1] ?? imageInput.width;
    rawDepth = new Float32Array(tensor.data);
  } else if (resultItem.dims || resultItem.shape) {
    const dims = resultItem.dims || resultItem.shape || [];
    outHeight = dims[dims.length - 2] ?? imageInput.height;
    outWidth = dims[dims.length - 1] ?? imageInput.width;
    rawDepth = new Float32Array(resultItem.data);
    toDispose.push(resultItem);
  } else if (resultItem.depth && resultItem.depth.data) {
    outWidth = resultItem.depth.width ?? imageInput.width;
    outHeight = resultItem.depth.height ?? imageInput.height;
    rawDepth = new Float32Array(resultItem.depth.data);
  } else if (resultItem.data && resultItem.width && resultItem.height) {
    outWidth = resultItem.width;
    outHeight = resultItem.height;
    rawDepth = new Float32Array(resultItem.data);
  } else {
    throw new Error('Unsupported model output format from depth estimation pipeline');
  }

  // Intermediate memory cleanup: safely dispose intermediate ONNX tensors
  for (const item of toDispose) {
    if (typeof item?.dispose === 'function') {
      try {
        item.dispose();
      } catch {
        // Discard cleanup errors
      }
    }
  }

  return { width: outWidth, height: outHeight, rawDepth };
}
