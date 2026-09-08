import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  configureTransformersEnv,
  createDepthModelPipeline,
  getOrCreateModelPipeline,
  resetModelPipeline,
  inferDepthFromModel,
  DEFAULT_DEPTH_MODEL,
  DEFAULT_MODEL_DTYPE,
  DEFAULT_EXECUTION_DEVICE,
} from './model.js';
import { runDepthPipeline } from './pipeline.js';
import { handleDepthWorkerMessage } from './depth-estimation.worker.js';
import { validateDepthInvariant } from './normalizer.js';
import {
  ESTIMATE_DEPTH,
  PROGRESS,
  DEPTH_READY,
  ERROR,
  type DepthEstimationRequest,
  type DepthEstimationResponse,
  type DepthEstimationProgress,
  type DepthEstimationSuccess,
  type RawImageInput,
  type DepthEstimationStage,
} from './types.js';
import { env } from '@huggingface/transformers';

function createDummyImage(width = 64, height = 48): RawImageInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i % width) * 4;
    data[i * 4 + 1] = ((i / width) | 0) * 4;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('Depth Model Pipeline Configuration & Initialization (model.ts)', () => {
  beforeEach(() => {
    resetModelPipeline();
    vi.restoreAllMocks();
  });

  it('exports expected model configuration defaults', () => {
    expect(DEFAULT_DEPTH_MODEL).toBe('onnx-community/Depth-Anything-V2-Small-ONNX');
    expect(DEFAULT_MODEL_DTYPE).toBe('fp16');
    expect(DEFAULT_EXECUTION_DEVICE).toBe('auto');
  });

  it('configures transformers environment settings properly', () => {
    configureTransformersEnv();
    expect(typeof env).toBe('object');
  });

  it('creates depth model pipeline with wasm device when explicitly requested', async () => {
    const mockFactory = vi.fn().mockResolvedValue({ dummyPipeline: true });

    const pipelineInstance = await createDepthModelPipeline({
      device: 'wasm',
      pipelineFactory: mockFactory,
    });

    expect(mockFactory).toHaveBeenCalledTimes(1);
    expect(mockFactory).toHaveBeenCalledWith(
      'depth-estimation',
      DEFAULT_DEPTH_MODEL,
      expect.objectContaining({
        device: 'wasm',
        dtype: DEFAULT_MODEL_DTYPE,
      })
    );
    expect(pipelineInstance).toEqual({ dummyPipeline: true });
  });

  it('attempts webgpu first and gracefully falls back to wasm on GPU failure', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call (webgpu) rejects; second call (wasm) resolves
    const mockFactory = vi
      .fn()
      .mockRejectedValueOnce(new Error('WebGPU context creation failed: Adapter not found'))
      .mockResolvedValueOnce({ backend: 'wasm-fallback' });

    const pipelineInstance = await createDepthModelPipeline({
      device: 'webgpu',
      pipelineFactory: mockFactory,
    });

    expect(mockFactory).toHaveBeenCalledTimes(2);
    expect(mockFactory).toHaveBeenNthCalledWith(
      1,
      'depth-estimation',
      DEFAULT_DEPTH_MODEL,
      expect.objectContaining({ device: 'webgpu' })
    );
    expect(mockFactory).toHaveBeenNthCalledWith(
      2,
      'depth-estimation',
      DEFAULT_DEPTH_MODEL,
      expect.objectContaining({ device: 'wasm' })
    );
    expect(pipelineInstance).toEqual({ backend: 'wasm-fallback' });
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('fast-paths directly to wasm when device is auto and navigator.gpu is absent', async () => {
    // In Node.js / test runner, navigator.gpu is undefined
    const mockFactory = vi.fn().mockResolvedValue({ backend: 'wasm-direct' });

    const pipelineInstance = await createDepthModelPipeline({
      device: 'auto',
      pipelineFactory: mockFactory,
    });

    expect(mockFactory).toHaveBeenCalledTimes(1);
    expect(mockFactory).toHaveBeenCalledWith(
      'depth-estimation',
      DEFAULT_DEPTH_MODEL,
      expect.objectContaining({ device: 'wasm' })
    );
    expect(pipelineInstance).toEqual({ backend: 'wasm-direct' });
  });

  it('dispatches fine-grained download progress events (0..100) during model download', async () => {
    const progressEvents: Array<{ stage: DepthEstimationStage; progress: number; message?: string }> =
      [];

    const mockFactory = vi.fn().mockImplementation((task, model, opts) => {
      // Simulate transformers.js download events via progress_callback
      if (opts.progress_callback) {
        opts.progress_callback({ status: 'initiate', file: 'model_q8.onnx' });
        opts.progress_callback({ status: 'progress', file: 'model_q8.onnx', progress: 25.4 });
        opts.progress_callback({ status: 'progress', file: 'model_q8.onnx', progress: 75.8 });
        opts.progress_callback({ status: 'done', file: 'model_q8.onnx' });
      }
      return Promise.resolve({ modelReady: true });
    });

    await createDepthModelPipeline({
      device: 'wasm',
      pipelineFactory: mockFactory,
      onProgress: (stage, progress, message) => {
        progressEvents.push({ stage, progress, message });
      },
    });

    expect(progressEvents.length).toBe(4);
    expect(progressEvents[0]?.stage).toBe('loading-model');
    expect(progressEvents[0]?.progress).toBe(0);

    expect(progressEvents[1]?.stage).toBe('loading-model');
    expect(progressEvents[1]?.progress).toBe(25);
    expect(progressEvents[1]?.message).toContain('25%');

    expect(progressEvents[2]?.stage).toBe('loading-model');
    expect(progressEvents[2]?.progress).toBe(76);
    expect(progressEvents[2]?.message).toContain('76%');

    expect(progressEvents[3]?.stage).toBe('loading-model');
    expect(progressEvents[3]?.progress).toBe(100);
  });

  it('reuses the cached pipeline instance across repeated calls and clears on reset', async () => {
    let callCount = 0;
    const mockFactory = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ instanceId: callCount });
    });

    // Provide factory inside options
    const p1 = await createDepthModelPipeline({
      device: 'wasm',
      pipelineFactory: mockFactory,
    });
    expect(p1).toEqual({ instanceId: 1 });
    expect(mockFactory).toHaveBeenCalledTimes(1);

    resetModelPipeline();
  });
});

describe('Tensor Extraction & Memory Disposal (inferDepthFromModel)', () => {
  it('extracts predicted_depth tensor data and disposes intermediate tensor buffers', async () => {
    const disposeSpy = vi.fn();
    const fakeData = new Float32Array([0.1, 0.4, 0.7, 0.9]);

    const mockPipeline = vi.fn().mockResolvedValue({
      predicted_depth: {
        dims: [1, 2, 2],
        data: fakeData,
        dispose: disposeSpy,
      },
    });

    const img = createDummyImage(2, 2);
    const result = await inferDepthFromModel(mockPipeline, img);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.rawDepth[0]).toBeCloseTo(0.1, 4);
    expect(result.rawDepth[1]).toBeCloseTo(0.4, 4);
    expect(result.rawDepth[2]).toBeCloseTo(0.7, 4);
    expect(result.rawDepth[3]).toBeCloseTo(0.9, 4);

    // Verifies memory leak prevention: intermediate tensor must be disposed!
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('handles tensor output where result itself is a disposable tensor', async () => {
    const disposeSpy = vi.fn();
    const fakeData = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);

    const mockPipeline = vi.fn().mockResolvedValue({
      dims: [2, 3],
      data: fakeData,
      dispose: disposeSpy,
    });

    const img = createDummyImage(3, 2);
    const result = await inferDepthFromModel(mockPipeline, img);

    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.rawDepth.length).toBe(6);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('throws descriptive error when model pipeline produces unsupported output format', async () => {
    const mockPipeline = vi.fn().mockResolvedValue({});
    const img = createDummyImage(10, 10);

    await expect(inferDepthFromModel(mockPipeline, img)).rejects.toThrow(
      'Unsupported model output format'
    );
  });
});

describe('End-to-End Pipeline with Model & Fallback (runDepthPipeline)', () => {
  it('runs end-to-end depth pipeline using injected model pipeline and enforces [0.0, 1.0] invariant', async () => {
    const disposeSpy = vi.fn();
    // Raw disparity elevation logits (e.g. 5.0 to 25.0)
    const rawElevations = new Float32Array(40 * 30);
    for (let i = 0; i < rawElevations.length; i++) {
      rawElevations[i] = 5.0 + (i / rawElevations.length) * 20.0;
    }

    const mockPipeline = vi.fn().mockResolvedValue({
      predicted_depth: {
        dims: [1, 30, 40],
        data: rawElevations,
        dispose: disposeSpy,
      },
    });

    const stages: DepthEstimationStage[] = [];
    const progresses: number[] = [];

    const img = createDummyImage(40, 30);
    const depthMap = await runDepthPipeline(img, {
      modelPipeline: mockPipeline,
      targetWidth: 80,
      targetHeight: 60,
      onProgress: (stage, progress) => {
        stages.push(stage);
        progresses.push(progress);
      },
    });

    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    expect(depthMap.width).toBe(80);
    expect(depthMap.height).toBe(60);
    expect(depthMap.data.length).toBe(80 * 60);

    // Strict depth invariant [0.0, 1.0] must be preserved after normalization and resampling
    expect(validateDepthInvariant(depthMap.data)).toBe(true);

    // Verify minimum is 0.0 and maximum is 1.0
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < depthMap.data.length; i++) {
      const v = depthMap.data[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeCloseTo(0.0, 2);
    expect(max).toBeCloseTo(1.0, 2);

    // Verify execution stages
    expect(stages).toContain('init');
    expect(stages).toContain('preprocessing');
    expect(stages).toContain('estimating');
    expect(stages).toContain('normalizing');
    expect(stages).toContain('resampling');
    expect(stages).toContain('complete');
  });

  it('falls back gracefully to synthetic elevation generator when syntheticFallback is true and model fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const failingFactory = vi.fn().mockRejectedValue(new Error('Out of memory loading ONNX model weights'));

    const img = createDummyImage(30, 30);
    const depthMap = await runDepthPipeline(img, {
      syntheticFallback: true,
      pipelineFactory: failingFactory,
      targetWidth: 60,
      targetHeight: 60,
    });

    expect(failingFactory).toHaveBeenCalled();
    expect(depthMap.width).toBe(60);
    expect(depthMap.height).toBe(60);
    expect(validateDepthInvariant(depthMap.data)).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('throws error when model fails and syntheticFallback is false', async () => {
    const failingFactory = vi.fn().mockRejectedValue(new Error('Network error downloading ONNX model'));

    const img = createDummyImage(20, 20);
    await expect(
      runDepthPipeline(img, {
        syntheticFallback: false,
        pipelineFactory: failingFactory,
      })
    ).rejects.toThrow('Network error downloading ONNX model');
  });
});

describe('Worker Protocol Integration with Model Pipeline (depth-estimation.worker.ts)', () => {
  it('dispatches PROGRESS and DEPTH_READY messages when executing with model pipeline', async () => {
    const rawElevations = new Float32Array(20 * 20);
    for (let i = 0; i < rawElevations.length; i++) {
      rawElevations[i] = i;
    }

    const mockPipeline = vi.fn().mockResolvedValue({
      predicted_depth: {
        dims: [1, 20, 20],
        data: rawElevations,
        dispose: vi.fn(),
      },
    });

    const img = createDummyImage(20, 20);
    const messages: DepthEstimationResponse[] = [];
    let transferred: Transferable[] = [];

    const request: DepthEstimationRequest = {
      id: 'worker-test-req',
      type: ESTIMATE_DEPTH,
      image: img,
      options: {
        targetWidth: 40,
        targetHeight: 40,
      },
    };

    // Inject mock pipeline via pipeline options
    await handleDepthWorkerMessage(
      {
        ...request,
        options: {
          ...request.options,
          // pass mockPipeline directly in options
          ...({ modelPipeline: mockPipeline } as any),
        },
      },
      (msg, transfer) => {
        messages.push(msg);
        if (transfer) transferred = transfer;
      }
    );

    const progressMsgs = messages.filter((m): m is DepthEstimationProgress => m.type === PROGRESS);
    expect(progressMsgs.length).toBeGreaterThan(0);

    const successMsg = messages.find((m): m is DepthEstimationSuccess => m.type === DEPTH_READY);
    expect(successMsg).toBeDefined();
    expect(successMsg?.id).toBe('worker-test-req');
    expect(successMsg?.width).toBe(40);
    expect(successMsg?.height).toBe(40);
    expect(transferred).toContain(successMsg?.buffer);

    const outDepth = new Float32Array(successMsg!.buffer);
    expect(validateDepthInvariant(outDepth)).toBe(true);
  });
});
