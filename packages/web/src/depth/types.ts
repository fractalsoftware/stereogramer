import type { DepthMap } from '@stereogramer/core';

export const ESTIMATE_DEPTH = 'ESTIMATE_DEPTH' as const;
export const PROGRESS = 'PROGRESS' as const;
export const DEPTH_READY = 'DEPTH_READY' as const;
export const ERROR = 'ERROR' as const;

export type EstimateDepthType = typeof ESTIMATE_DEPTH;
export type ProgressType = typeof PROGRESS;
export type DepthReadyType = typeof DEPTH_READY;
export type ErrorType = typeof ERROR;

export type DepthMessageType =
  | EstimateDepthType
  | ProgressType
  | DepthReadyType
  | ErrorType;

/**
 * Fine-grained execution stages during depth estimation pipeline execution.
 */
export type DepthEstimationStage =
  | 'init'
  | 'loading-model'
  | 'preprocessing'
  | 'estimating'
  | 'normalizing'
  | 'resampling'
  | 'complete';

/**
 * Raw RGBA image buffer representation received from main thread or canvas.
 */
export interface RawImageInput {
  width: number;
  height: number;
  data: ArrayBuffer | Uint8ClampedArray | Uint8Array;
}

/**
 * Options for configuring depth estimation and post-processing.
 */
export interface DepthEstimationOptions {
  /**
   * Target stereogram canvas width to resample the resulting depth map to.
   */
  targetWidth?: number;

  /**
   * Target stereogram canvas height to resample the resulting depth map to.
   */
  targetHeight?: number;

  /**
   * Invert depth polarity: when true, high values become far background and low values near foreground.
   * Default: false (1.0 = near foreground, 0.0 = far background).
   */
  invert?: boolean;

  /**
   * Force synthetic estimation mode (useful for offline tests and fallback).
   * Default: false.
   */
  synthetic?: boolean;

  /**
   * When true, falls back to synthetic depth estimation if model loading or inference fails.
   * Default: false.
   */
  syntheticFallback?: boolean;

  /**
   * Target resolution for the intermediate model processing grid (e.g. 518).
   * Default: 518.
   */
  modelResolution?: number;

  /**
   * Synthetic depth estimation mode when synthetic is true.
   * Default: 'hybrid'.
   */
  syntheticMode?: 'dome' | 'luminance' | 'hybrid';

  /**
   * Model repository ID for depth estimation.
   * Default: 'onnx-community/Depth-Anything-V2-Small-ONNX'.
   */
  modelId?: string;

  /**
   * Quantization data type for the ONNX model (e.g. 'q8', 'fp32', 'q4').
   * Default: 'q8'.
   */
  dtype?: string;

  /**
   * Execution provider backend ('auto', 'webgpu', 'wasm').
   * Default: 'auto' (attempts WebGPU first with graceful fallback to WASM).
   */
  device?: 'auto' | 'webgpu' | 'wasm';
}

/**
 * Request message sent to the depth estimation worker.
 */
export interface DepthEstimationRequest {
  id: string;
  type: typeof ESTIMATE_DEPTH;
  image: RawImageInput;
  options?: DepthEstimationOptions;
}

/**
 * Progress message sent by the worker during depth estimation pipeline execution.
 */
export interface DepthEstimationProgress {
  id: string;
  type: typeof PROGRESS;
  stage: DepthEstimationStage;
  progress: number; // 0.0 to 1.0 or 0..100
  percentage?: number; // 0 to 100
  message?: string;
}

/**
 * Success response message sent by the worker containing the completed depth map buffer.
 */
export interface DepthEstimationSuccess {
  id: string;
  type: typeof DEPTH_READY;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

/**
 * Error response message sent by the worker when depth estimation fails.
 */
export interface DepthEstimationError {
  id: string;
  type: typeof ERROR;
  error: string;
}

/**
 * Union of all worker response messages.
 */
export type DepthEstimationResponse =
  | DepthEstimationProgress
  | DepthEstimationSuccess
  | DepthEstimationError;

/**
 * Callback function for tracking depth estimation progress.
 */
export type DepthProgressCallback = (progress: DepthEstimationProgress) => void;

/**
 * Options for min-max depth normalization.
 */
export interface NormalizeDepthOptions {
  /** Invert depth polarity (1.0 - z). Default: false. */
  invert?: boolean;
  /** Explicit minimum disparity value to map to 0.0. When omitted, calculated from input. */
  min?: number;
  /** Explicit maximum disparity value to map to 1.0. When omitted, calculated from input. */
  max?: number;
}

/**
 * Options for bilinear resampling.
 */
export interface BilinearResampleOptions {
  /**
   * When true (default), corner pixels of source and destination grids are aligned.
   * When false, pixel centers are aligned.
   */
  alignCorners?: boolean;
}

/**
 * Options for synthetic depth generation.
 */
export interface SyntheticDepthOptions {
  /** Elevation field algorithm: 'dome' | 'luminance' | 'hybrid'. Default: 'hybrid'. */
  mode?: 'dome' | 'luminance' | 'hybrid';
  /** Invert depth polarity. Default: false. */
  invert?: boolean;
  /** Target canvas width to resample to. */
  targetWidth?: number;
  /** Target canvas height to resample to. */
  targetHeight?: number;
}

/**
 * Pipeline options including progress hook.
 */
export interface DepthPipelineOptions extends DepthEstimationOptions {
  onProgress?: (stage: DepthEstimationStage, progress: number, message?: string) => void;
  /**
   * Pre-instantiated model pipeline to use instead of creating/caching a new one.
   */
  modelPipeline?: any;
  /**
   * Custom factory function for creating the pipeline (useful for testing and dependency injection).
   */
  pipelineFactory?: (task: string, model: string, options: any) => Promise<any>;
}

export type { DepthMap };
