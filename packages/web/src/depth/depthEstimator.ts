import {
  ESTIMATE_DEPTH,
  PROGRESS,
  DEPTH_READY,
  ERROR,
  type DepthMap,
  type RawImageInput,
  type DepthEstimationOptions,
  type DepthEstimationRequest,
  type DepthEstimationResponse,
  type DepthProgressCallback,
} from './types.js';

export interface DepthEstimatorOptions {
  /**
   * Custom worker factory function (useful for unit testing or custom worker setup).
   */
  workerFactory?: () => Worker;

  /**
   * Custom worker URL or path.
   */
  workerUrl?: string | URL;
}

interface PendingRequest {
  resolve: (depthMap: DepthMap) => void;
  reject: (error: Error) => void;
  onProgress?: DepthProgressCallback;
}

/**
 * Client-side manager that manages the lifecycle of the depth estimation Web Worker,
 * dispatches requests, handles progress notifications, and returns Promises resolving
 * to normalized DepthMap objects.
 */
export class DepthEstimator {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private isTerminated = false;
  private options: DepthEstimatorOptions;

  constructor(options: DepthEstimatorOptions = {}) {
    this.options = options;
  }

  /**
   * Lazily initializes and returns the Web Worker instance.
   */
  private getWorker(): Worker {
    if (this.isTerminated) {
      throw new Error('DepthEstimator has been terminated');
    }

    if (!this.worker) {
      if (this.options.workerFactory) {
        this.worker = this.options.workerFactory();
      } else if (typeof Worker !== 'undefined') {
        const url =
          this.options.workerUrl ??
          new URL('./depth-estimation.worker.ts', import.meta.url);
        this.worker = new Worker(url, { type: 'module' });
      } else {
        throw new Error(
          'Web Workers are not available in this environment. Provide a custom workerFactory or run in a browser.'
        );
      }

      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
    }

    return this.worker;
  }

  /**
   * Internal handler for incoming worker messages.
   */
  private handleMessage(event: MessageEvent<DepthEstimationResponse>): void {
    const res = event.data;
    if (!res || !res.id) return;

    const pending = this.pendingRequests.get(res.id);
    if (!pending) return;

    if (res.type === PROGRESS) {
      pending.onProgress?.(res);
    } else if (res.type === DEPTH_READY) {
      this.pendingRequests.delete(res.id);
      const depthMap: DepthMap = {
        width: res.width,
        height: res.height,
        data: new Float32Array(res.buffer),
      };
      pending.resolve(depthMap);
    } else if (res.type === ERROR) {
      this.pendingRequests.delete(res.id);
      pending.reject(new Error(res.error));
    }
  }

  /**
   * Internal handler for unexpected worker crashes or syntax errors.
   */
  private handleWorkerError(event: ErrorEvent): void {
    const error = new Error(event.message || 'Depth worker encountered an unhandled error');
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Submits an image to the depth estimation worker and returns a Promise
   * resolving to the generated DepthMap.
   */
  public async estimate(
    image: RawImageInput,
    options?: DepthEstimationOptions,
    onProgress?: DepthProgressCallback
  ): Promise<DepthMap> {
    if (this.isTerminated) {
      throw new Error('DepthEstimator has been terminated');
    }

    const worker = this.getWorker();
    const id = `depth-req-${++this.requestCounter}-${Date.now()}`;

    return new Promise<DepthMap>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const request: DepthEstimationRequest = {
        id,
        type: ESTIMATE_DEPTH,
        image,
        options,
      };

      if (image.data instanceof ArrayBuffer) {
        worker.postMessage(request, [image.data]);
      } else {
        worker.postMessage(request);
      }
    });
  }

  /**
   * Terminates the background Web Worker and rejects all in-flight requests.
   */
  public terminate(): void {
    this.isTerminated = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('DepthEstimator terminated'));
    }
    this.pendingRequests.clear();
  }
}

/**
 * Creates a new DepthEstimator instance.
 */
export function createDepthEstimator(options?: DepthEstimatorOptions): DepthEstimator {
  return new DepthEstimator(options);
}

let sharedEstimator: DepthEstimator | null = null;

/**
 * Convenience function to estimate depth using a shared DepthEstimator instance.
 */
export async function estimateDepth(
  image: RawImageInput,
  options?: DepthEstimationOptions,
  onProgress?: DepthProgressCallback
): Promise<DepthMap> {
  if (!sharedEstimator) {
    sharedEstimator = new DepthEstimator();
  }
  return sharedEstimator.estimate(image, options, onProgress);
}
