import {
  ESTIMATE_DEPTH,
  PROGRESS,
  DEPTH_READY,
  ERROR,
  type DepthEstimationRequest,
  type DepthEstimationResponse,
  type DepthEstimationProgress,
  type DepthEstimationSuccess,
  type DepthEstimationError,
  type DepthEstimationStage,
} from './types.js';
import { runDepthPipeline } from './pipeline.js';

/**
 * Handles incoming depth estimation requests, dispatches progress updates,
 * and posts the final transferable DepthMap buffer.
 *
 * Exported to allow direct execution and testing across both worker and non-worker environments.
 */
export async function handleDepthWorkerMessage(
  req: DepthEstimationRequest,
  postMessage: (msg: DepthEstimationResponse, transfer?: Transferable[]) => void
): Promise<void> {
  if (!req || req.type !== ESTIMATE_DEPTH) {
    return;
  }

  const postProgress = (stage: DepthEstimationStage, progress: number, message?: string) => {
    const progressMsg: DepthEstimationProgress = {
      id: req.id,
      type: PROGRESS,
      stage,
      progress,
      percentage: stage === 'loading-model' ? progress : Math.round(progress * 100),
      message,
    };
    postMessage(progressMsg);
  };

  try {
    const depthMap = await runDepthPipeline(req.image, {
      ...req.options,
      onProgress: postProgress,
    });

    const successMsg: DepthEstimationSuccess = {
      id: req.id,
      type: DEPTH_READY,
      width: depthMap.width,
      height: depthMap.height,
      buffer: depthMap.data.buffer as ArrayBuffer,
    };

    // Transfer the Float32Array ArrayBuffer for zero-copy main-thread communication
    postMessage(successMsg, [depthMap.data.buffer]);
  } catch (err: unknown) {
    const errorMsg: DepthEstimationError = {
      id: req.id,
      type: ERROR,
      error: err instanceof Error ? err.message : String(err),
    };
    postMessage(errorMsg);
  }
}

// In a real Web Worker context, attach the message listener to self
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = async (event: MessageEvent<DepthEstimationRequest>) => {
    await handleDepthWorkerMessage(event.data, (msg, transfer) => {
      if (transfer && transfer.length > 0) {
        (self as any).postMessage(msg, transfer);
      } else {
        (self as any).postMessage(msg);
      }
    });
  };
}
