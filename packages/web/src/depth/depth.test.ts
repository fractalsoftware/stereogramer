import { describe, it, expect, vi } from 'vitest';
import {
  normalizeDepth,
  validateDepthInvariant,
  getDepthExtrema,
} from './normalizer.js';
import { resampleBilinear, resampleRgba } from './resampler.js';
import {
  preprocessImage,
  computeAspectFitDimensions,
} from './preprocessor.js';
import { generateSyntheticDepth } from './synthetic.js';
import { runDepthPipeline } from './pipeline.js';
import {
  handleDepthWorkerMessage,
} from './depth-estimation.worker.js';
import {
  DepthEstimator,
  createDepthEstimator,
} from './depthEstimator.js';
import {
  ESTIMATE_DEPTH,
  PROGRESS,
  DEPTH_READY,
  ERROR,
  type DepthEstimationRequest,
  type DepthEstimationResponse,
  type DepthEstimationProgress,
  type RawImageInput,
} from './types.js';

// Helper to create a test RGBA buffer
function createTestImage(
  width: number,
  height: number,
  fillFn?: (x: number, y: number) => [number, number, number, number]
): RawImageInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (fillFn) {
        const [r, g, b, a] = fillFn(x, y);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        // Default grayscale ramp
        const val = Math.floor((x / Math.max(1, width - 1)) * 255);
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

describe('Min-Max Depth Normalizer (normalizer.ts)', () => {
  it('strictly bounds all output values within [0.0, 1.0]', () => {
    const raw = new Float32Array([
      -1000.5, -500.0, -10.0, 0.0, 10.0, 250.0, 9999.9,
    ]);
    const normalized = normalizeDepth(raw);

    expect(validateDepthInvariant(normalized)).toBe(true);
    for (let i = 0; i < normalized.length; i++) {
      expect(normalized[i]).toBeGreaterThanOrEqual(0.0);
      expect(normalized[i]).toBeLessThanOrEqual(1.0);
    }
  });

  it('correctly maps minimum to 0.0 and maximum to 1.0', () => {
    const raw = new Float32Array([-50, 0, 50, 100, 150]);
    const normalized = normalizeDepth(raw);

    // min=-50 -> 0.0, max=150 -> 1.0, 50 -> 0.5, 0 -> 0.25, 100 -> 0.75
    expect(normalized[0]).toBeCloseTo(0.0, 5);
    expect(normalized[1]).toBeCloseTo(0.25, 5);
    expect(normalized[2]).toBeCloseTo(0.5, 5);
    expect(normalized[3]).toBeCloseTo(0.75, 5);
    expect(normalized[4]).toBeCloseTo(1.0, 5);
  });

  it('inverts depth polarity when invert option is true', () => {
    const raw = new Float32Array([-50, 50, 150]);
    const normalized = normalizeDepth(raw, { invert: true });

    expect(normalized[0]).toBeCloseTo(1.0, 5); // min becomes 1.0
    expect(normalized[1]).toBeCloseTo(0.5, 5); // mid remains 0.5
    expect(normalized[2]).toBeCloseTo(0.0, 5); // max becomes 0.0
  });

  it('handles uniform arrays where min === max without producing NaN', () => {
    const raw = new Float32Array([42.0, 42.0, 42.0, 42.0]);
    const normalized = normalizeDepth(raw);

    expect(validateDepthInvariant(normalized)).toBe(true);
    for (let i = 0; i < normalized.length; i++) {
      expect(Number.isFinite(normalized[i])).toBe(true);
      expect(normalized[i]).toBe(0.0);
    }

    const inverted = normalizeDepth(raw, { invert: true });
    expect(validateDepthInvariant(inverted)).toBe(true);
    for (let i = 0; i < inverted.length; i++) {
      expect(inverted[i]).toBe(1.0);
    }
  });

  it('handles empty arrays gracefully', () => {
    const empty = new Float32Array(0);
    const normalized = normalizeDepth(empty);
    expect(normalized.length).toBe(0);
    expect(validateDepthInvariant(normalized)).toBe(true);
  });

  it('handles non-finite values (NaN, Infinity) safely', () => {
    const raw = new Float32Array([NaN, -Infinity, 10.0, 20.0, Infinity]);
    const normalized = normalizeDepth(raw);

    expect(validateDepthInvariant(normalized)).toBe(true);
    expect(normalized[2]).toBeCloseTo(0.0, 5); // min finite (10.0) -> 0.0
    expect(normalized[3]).toBeCloseTo(1.0, 5); // max finite (20.0) -> 1.0
  });

  it('computes extrema correctly with getDepthExtrema', () => {
    const raw = new Float32Array([5.5, -2.1, 99.0, 12.3]);
    const { min, max } = getDepthExtrema(raw);
    expect(min).toBeCloseTo(-2.1, 5);
    expect(max).toBeCloseTo(99.0, 5);
  });
});

describe('Bilinear Resampler (resampler.ts)', () => {
  it('correctly interpolates known 2x2 grid to 4x4 grid with alignCorners=true', () => {
    // 2x2 grid where depth varies only horizontally:
    // [0.0, 1.0]
    // [0.0, 1.0]
    const src = new Float32Array([
      0.0, 1.0,
      0.0, 1.0,
    ]);

    const resampled = resampleBilinear(src, 2, 2, 4, 4, { alignCorners: true });
    expect(resampled.length).toBe(16);
    expect(validateDepthInvariant(resampled)).toBe(true);

    // With alignCorners=true:
    // x = 0 -> 0.0
    // x = 1 -> 1/3
    // x = 2 -> 2/3
    // x = 3 -> 1.0
    for (let row = 0; row < 4; row++) {
      const offset = row * 4;
      expect(resampled[offset + 0]).toBeCloseTo(0.0, 5);
      expect(resampled[offset + 1]).toBeCloseTo(1 / 3, 5);
      expect(resampled[offset + 2]).toBeCloseTo(2 / 3, 5);
      expect(resampled[offset + 3]).toBeCloseTo(1.0, 5);
    }
  });

  it('correctly interpolates 2D diagonal gradient 2x2 to 4x4', () => {
    // 2x2 grid with varying values in both axes:
    // [0.0, 0.6]
    // [0.4, 1.0]
    const src = new Float32Array([
      0.0, 0.6,
      0.4, 1.0,
    ]);

    const resampled = resampleBilinear(src, 2, 2, 4, 4, { alignCorners: true });
    expect(validateDepthInvariant(resampled)).toBe(true);

    // Corners should match exactly
    expect(resampled[0 * 4 + 0]).toBeCloseTo(0.0, 5); // top-left
    expect(resampled[0 * 4 + 3]).toBeCloseTo(0.6, 5); // top-right
    expect(resampled[3 * 4 + 0]).toBeCloseTo(0.4, 5); // bottom-left
    expect(resampled[3 * 4 + 3]).toBeCloseTo(1.0, 5); // bottom-right

    // Point (x=1, y=1): u=1/3, v=1/3
    // Top = (2/3)*0.0 + (1/3)*0.6 = 0.2
    // Bottom = (2/3)*0.4 + (1/3)*1.0 = 0.266667 + 0.333333 = 0.6
    // Center = (2/3)*0.2 + (1/3)*0.6 = 0.133333 + 0.2 = 1/3
    expect(resampled[1 * 4 + 1]).toBeCloseTo(1 / 3, 5);

    // Point (x=2, y=2): u=2/3, v=2/3
    // Top = (1/3)*0.0 + (2/3)*0.6 = 0.4
    // Bottom = (1/3)*0.4 + (2/3)*1.0 = 0.133333 + 0.666667 = 0.8
    // Center = (1/3)*0.4 + (2/3)*0.8 = 0.133333 + 0.533333 = 2/3
    expect(resampled[2 * 4 + 2]).toBeCloseTo(2 / 3, 5);
  });

  it('returns an identical copy when dimensions match', () => {
    const src = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const resampled = resampleBilinear(src, 2, 2, 2, 2);

    expect(resampled.length).toBe(4);
    expect(resampled).not.toBe(src); // new buffer
    expect(resampled[0]).toBeCloseTo(0.1, 5);
    expect(resampled[1]).toBeCloseTo(0.2, 5);
    expect(resampled[2]).toBeCloseTo(0.3, 5);
    expect(resampled[3]).toBeCloseTo(0.4, 5);
  });

  it('downsamples from 4x4 to 2x2 while preserving bounds invariant', () => {
    const src = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      src[i] = i / 15.0;
    }

    const downsampled = resampleBilinear(src, 4, 4, 2, 2);
    expect(downsampled.length).toBe(4);
    expect(validateDepthInvariant(downsampled)).toBe(true);
    expect(downsampled[0]).toBeCloseTo(0.0, 5);
    expect(downsampled[3]).toBeCloseTo(1.0, 5);
  });

  it('throws descriptive errors on invalid dimensions', () => {
    const src = new Float32Array(4);
    expect(() => resampleBilinear(src, 0, 2, 4, 4)).toThrow('Dimensions must be positive integers');
    expect(() => resampleBilinear(src, 2, 2, 4, 0)).toThrow('Dimensions must be positive integers');
    expect(() => resampleBilinear(src, 3, 3, 4, 4)).toThrow('does not match specified dimensions');
  });

  it('bilinearly resamples RGBA byte images', () => {
    const src = new Uint8ClampedArray([
      255, 0, 0, 255,   0, 255, 0, 255,
      0, 0, 255, 255,   255, 255, 255, 255,
    ]);
    const resampled = resampleRgba(src, 2, 2, 4, 4);
    expect(resampled.length).toBe(4 * 4 * 4);
    // Corners match
    expect(resampled[0]).toBe(255); // Red at (0, 0)
    expect(resampled[1]).toBe(0);
  });
});

describe('Input Image Preprocessor (preprocessor.ts)', () => {
  it('calculates aspect fit dimensions maintaining aspect ratio within maxDim', () => {
    // Landscape 1920x1080 -> width=518, height=round(1080 * 518/1920) = 291
    const landscape = computeAspectFitDimensions(1920, 1080, 518);
    expect(landscape.width).toBe(518);
    expect(landscape.height).toBe(291);

    // Portrait 1080x1920 -> width=291, height=518
    const portrait = computeAspectFitDimensions(1080, 1920, 518);
    expect(portrait.width).toBe(291);
    expect(portrait.height).toBe(518);

    // Smaller image -> untouched
    const small = computeAspectFitDimensions(200, 150, 518);
    expect(small.width).toBe(200);
    expect(small.height).toBe(150);
  });

  it('preprocesses and rescales large image buffers', () => {
    const largeImg = createTestImage(100, 50);
    const preprocessed = preprocessImage(largeImg, 50);

    expect(preprocessed.width).toBe(50);
    expect(preprocessed.height).toBe(25);
    expect(preprocessed.data.length).toBe(50 * 25 * 4);
  });

  it('throws on corrupted or undersized image buffers', () => {
    const corrupt: RawImageInput = {
      width: 10,
      height: 10,
      data: new Uint8ClampedArray(10), // Needs 400 bytes
    };
    expect(() => preprocessImage(corrupt)).toThrow('is smaller than required RGBA size');
  });
});

describe('Synthetic Depth Estimator (synthetic.ts)', () => {
  it('generates valid DepthMap buffers with all values strictly in [0.0, 1.0]', () => {
    const img = createTestImage(64, 48);
    const depthMap = generateSyntheticDepth(img);

    expect(depthMap.width).toBe(64);
    expect(depthMap.height).toBe(48);
    expect(depthMap.data).toBeInstanceOf(Float32Array);
    expect(depthMap.data.length).toBe(64 * 48);
    expect(validateDepthInvariant(depthMap.data)).toBe(true);
  });

  it('is completely deterministic (identical inputs yield identical outputs)', () => {
    const img1 = createTestImage(40, 30);
    const img2 = createTestImage(40, 30);

    const result1 = generateSyntheticDepth(img1);
    const result2 = generateSyntheticDepth(img2);

    expect(result1.data.length).toBe(result2.data.length);
    for (let i = 0; i < result1.data.length; i++) {
      expect(result1.data[i]).toBe(result2.data[i]);
    }
  });

  it('supports dome, luminance, and hybrid modes', () => {
    const img = createTestImage(50, 50);

    const domeMap = generateSyntheticDepth(img, { mode: 'dome' });
    const lumMap = generateSyntheticDepth(img, { mode: 'luminance' });
    const hybridMap = generateSyntheticDepth(img, { mode: 'hybrid' });

    expect(validateDepthInvariant(domeMap.data)).toBe(true);
    expect(validateDepthInvariant(lumMap.data)).toBe(true);
    expect(validateDepthInvariant(hybridMap.data)).toBe(true);

    // In dome mode, the center pixel should have peak elevation
    const centerIdx = 25 * 50 + 25;
    expect(domeMap.data[centerIdx]).toBeGreaterThan(domeMap.data[0]!);
  });

  it('resamples to target dimensions when requested', () => {
    const img = createTestImage(30, 20);
    const targetMap = generateSyntheticDepth(img, {
      targetWidth: 120,
      targetHeight: 80,
    });

    expect(targetMap.width).toBe(120);
    expect(targetMap.height).toBe(80);
    expect(targetMap.data.length).toBe(120 * 80);
    expect(validateDepthInvariant(targetMap.data)).toBe(true);
  });

  it('inverts depth polarity when invert option is true', () => {
    const img = createTestImage(30, 30);
    const normalMap = generateSyntheticDepth(img, { invert: false });
    const invertedMap = generateSyntheticDepth(img, { invert: true });

    const centerIdx = 15 * 30 + 15;
    expect(normalMap.data[centerIdx]).toBeGreaterThan(normalMap.data[0]!);
    expect(invertedMap.data[centerIdx]).toBeLessThan(invertedMap.data[0]!);
  });
});

describe('End-to-End Depth Pipeline (pipeline.ts)', () => {
  it('executes the full pipeline and emits ordered progress updates', async () => {
    const img = createTestImage(80, 60);
    const stages: string[] = [];
    const progresses: number[] = [];

    const result = await runDepthPipeline(img, {
      synthetic: true,
      targetWidth: 160,
      targetHeight: 120,
      onProgress: (stage, progress) => {
        stages.push(stage);
        progresses.push(progress);
      },
    });

    expect(result.width).toBe(160);
    expect(result.height).toBe(120);
    expect(result.data.length).toBe(160 * 120);
    expect(validateDepthInvariant(result.data)).toBe(true);

    // Verify progress stages
    expect(stages).toEqual([
      'init',
      'preprocessing',
      'estimating',
      'normalizing',
      'resampling',
      'complete',
    ]);

    // Verify progress values are strictly increasing and finish at 1.0
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]!).toBeGreaterThan(progresses[i - 1]!);
    }
    expect(progresses[progresses.length - 1]).toBe(1.0);
  });

  it('throws descriptive error on invalid input dimensions', async () => {
    const invalidImg: RawImageInput = {
      width: 0,
      height: 10,
      data: new Uint8ClampedArray(0),
    };
    await expect(runDepthPipeline(invalidImg)).rejects.toThrow('Invalid image dimensions');
  });
});

describe('Depth Worker Message Protocol (depth-estimation.worker.ts)', () => {
  it('handles ESTIMATE_DEPTH request and posts PROGRESS and DEPTH_READY messages', async () => {
    const img = createTestImage(40, 30);
    const messages: DepthEstimationResponse[] = [];
    let transferredBuffers: Transferable[] = [];

    const request: DepthEstimationRequest = {
      id: 'test-req-1',
      type: ESTIMATE_DEPTH,
      image: img,
      options: {
        synthetic: true,
        targetWidth: 80,
        targetHeight: 60,
      },
    };

    await handleDepthWorkerMessage(request, (msg, transfer) => {
      messages.push(msg);
      if (transfer) {
        transferredBuffers = transfer;
      }
    });

    // Check progress messages
    const progressMsgs = messages.filter((m): m is DepthEstimationProgress => m.type === PROGRESS);
    expect(progressMsgs.length).toBeGreaterThan(0);
    expect(progressMsgs[0]?.id).toBe('test-req-1');

    // Check success message
    const successMsg = messages.find((m) => m.type === DEPTH_READY);
    expect(successMsg).toBeDefined();
    if (successMsg && successMsg.type === DEPTH_READY) {
      expect(successMsg.id).toBe('test-req-1');
      expect(successMsg.width).toBe(80);
      expect(successMsg.height).toBe(60);
      expect(successMsg.buffer).toBeInstanceOf(ArrayBuffer);
      expect(transferredBuffers).toContain(successMsg.buffer);

      const floatArray = new Float32Array(successMsg.buffer);
      expect(validateDepthInvariant(floatArray)).toBe(true);
    }
  });

  it('posts ERROR message on corrupted input', async () => {
    const corruptImg: RawImageInput = {
      width: 50,
      height: 50,
      data: new Uint8ClampedArray(10), // Insufficient bytes
    };
    const messages: DepthEstimationResponse[] = [];

    const request: DepthEstimationRequest = {
      id: 'error-req-1',
      type: ESTIMATE_DEPTH,
      image: corruptImg,
    };

    await handleDepthWorkerMessage(request, (msg) => {
      messages.push(msg);
    });

    const errorMsg = messages.find((m) => m.type === ERROR);
    expect(errorMsg).toBeDefined();
    if (errorMsg && errorMsg.type === ERROR) {
      expect(errorMsg.id).toBe('error-req-1');
      expect(errorMsg.error).toContain('Corrupted image buffer');
    }
  });
});

describe('DepthEstimator Client Helper (depthEstimator.ts)', () => {
  // Mock worker implementing standard Worker interface
  class MockWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;
    public terminated = false;

    public postMessage(data: any, transfer?: Transferable[]): void {
      if (this.terminated) return;

      // Simulate async worker execution using handleDepthWorkerMessage
      setTimeout(async () => {
        await handleDepthWorkerMessage(data, (msg, replyTransfer) => {
          if (this.onmessage && !this.terminated) {
            this.onmessage(new MessageEvent('message', { data: msg }));
          }
        });
      }, 0);
    }

    public terminate(): void {
      this.terminated = true;
    }

    public addEventListener(): void {}
    public removeEventListener(): void {}
    public dispatchEvent(): boolean {
      return true;
    }
  }

  it('successfully estimates depth and resolves to DepthMap', async () => {
    const estimator = createDepthEstimator({
      workerFactory: () => new MockWorker() as unknown as Worker,
    });

    const img = createTestImage(40, 40);
    const progressList: number[] = [];

    const depthMap = await estimator.estimate(
      img,
      { synthetic: true, targetWidth: 80, targetHeight: 80 },
      (p) => progressList.push(p.progress)
    );

    expect(depthMap.width).toBe(80);
    expect(depthMap.height).toBe(80);
    expect(depthMap.data).toBeInstanceOf(Float32Array);
    expect(depthMap.data.length).toBe(80 * 80);
    expect(validateDepthInvariant(depthMap.data)).toBe(true);

    // Verify progress callback was invoked
    expect(progressList.length).toBeGreaterThan(0);
    expect(progressList[progressList.length - 1]).toBe(1.0);

    estimator.terminate();
  });

  it('rejects the promise when worker returns ERROR', async () => {
    const estimator = createDepthEstimator({
      workerFactory: () => new MockWorker() as unknown as Worker,
    });

    const corruptImg: RawImageInput = {
      width: 50,
      height: 50,
      data: new Uint8ClampedArray(4),
    };

    await expect(estimator.estimate(corruptImg)).rejects.toThrow('Corrupted image buffer');
    estimator.terminate();
  });

  it('handles multiple concurrent requests correctly', async () => {
    const estimator = createDepthEstimator({
      workerFactory: () => new MockWorker() as unknown as Worker,
    });

    const imgA = createTestImage(20, 20);
    const imgB = createTestImage(30, 30);

    const [mapA, mapB] = await Promise.all([
      estimator.estimate(imgA, { synthetic: true, targetWidth: 50, targetHeight: 50 }),
      estimator.estimate(imgB, { synthetic: true, targetWidth: 60, targetHeight: 60 }),
    ]);

    expect(mapA.width).toBe(50);
    expect(mapA.height).toBe(50);
    expect(mapB.width).toBe(60);
    expect(mapB.height).toBe(60);

    estimator.terminate();
  });

  it('rejects pending requests when terminate() is called', async () => {
    // A mock worker that never responds
    class HangingWorker {
      public onmessage: ((e: MessageEvent) => void) | null = null;
      public onerror: ((e: ErrorEvent) => void) | null = null;
      public postMessage(): void {}
      public terminate(): void {}
    }

    const estimator = createDepthEstimator({
      workerFactory: () => new HangingWorker() as unknown as Worker,
    });

    const img = createTestImage(20, 20);
    const promise = estimator.estimate(img);

    estimator.terminate();

    await expect(promise).rejects.toThrow('DepthEstimator terminated');
  });
});
