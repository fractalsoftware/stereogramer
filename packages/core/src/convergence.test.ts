import { describe, it, expect } from 'vitest';
import {
  calculateSeparation,
  isSurfaceVisible,
  generateSirds,
  generateTexturedStereogram,
  createSphereDepthMap,
  createBoxDepthMap,
  createSlantedPlaneDepthMap,
  type DepthMap,
  type RgbaImage,
} from './index.js';

/**
 * Inverts a depth map so that Z_inv = 1.0 - Z.
 */
function invertDepthMap(depthMap: DepthMap): DepthMap {
  const inverted = new Float32Array(depthMap.data.length);
  for (let i = 0; i < depthMap.data.length; i++) {
    inverted[i] = 1.0 - depthMap.data[i]!;
  }
  return {
    width: depthMap.width,
    height: depthMap.height,
    data: inverted,
  };
}

describe('Convergence Mode Mathematical Symmetry & Duality Invariants', () => {
  it('guarantees calculateSeparation symmetry: cross-eyed(z) === parallel(1 - z)', () => {
    const separations = [40, 60, 80, 100, 140];
    const depths = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    const factors = [0.2, 0.5, 0.8, 1.0];

    for (const S of separations) {
      for (const d of depths) {
        for (const f of factors) {
          const sepCross = calculateSeparation(d, S, f, 'cross');
          const sepParallelInverted = calculateSeparation(1.0 - d, S, f, 'parallel');
          expect(sepCross).toBe(sepParallelInverted);
        }
      }
    }
  });

  it('guarantees isSurfaceVisible symmetry: cross-eyed on depthRow === parallel on (1 - depthRow)', () => {
    const width = 120;
    const baseSeparation = 40;
    const depthFactor = 0.8;

    // Create a stepped landscape
    const originalRow = new Float32Array(width);
    const invertedRow = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const val = x >= 40 && x <= 80 ? 0.85 : 0.15;
      originalRow[x] = val;
      invertedRow[x] = 1.0 - val;
    }

    for (let x = 0; x < width; x++) {
      const z = originalRow[x]!;
      const zInv = invertedRow[x]!;

      const visibleCross = isSurfaceVisible(
        x,
        zInv,
        originalRow,
        width,
        baseSeparation,
        depthFactor,
        'cross'
      );

      const visibleParallel = isSurfaceVisible(
        x,
        zInv,
        invertedRow,
        width,
        baseSeparation,
        depthFactor,
        'parallel'
      );

      expect(visibleCross).toBe(visibleParallel);
    }
  });

  it('guarantees SIRDS pixel-exact symmetry: Cross-eyed(Depth) === Parallel(1 - Depth)', () => {
    const width = 160;
    const height = 40;
    const sphere = createSphereDepthMap(width, height, { radius: 15 });
    const invertedSphere = invertDepthMap(sphere);

    // Fixed PRNG generator factory producing identical pseudo-random sequences
    const createPrng = () => {
      let state = 987654321;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    };

    const sirdsCross = generateSirds(sphere, {
      convergenceMode: 'cross',
      patternSeparation: 35,
      depthFactor: 0.9,
      random: createPrng(),
    });

    const sirdsParallelInverted = generateSirds(invertedSphere, {
      convergenceMode: 'parallel',
      patternSeparation: 35,
      depthFactor: 0.9,
      random: createPrng(),
    });

    expect(sirdsCross.width).toBe(sirdsParallelInverted.width);
    expect(sirdsCross.height).toBe(sirdsParallelInverted.height);

    // Exact pixel-for-pixel match across the entire RGBA buffer
    for (let i = 0; i < sirdsCross.data.length; i++) {
      expect(sirdsCross.data[i]).toBe(sirdsParallelInverted.data[i]);
    }
  });

  it('guarantees Textured SIS pixel-exact symmetry: Cross-eyed(Depth) === Parallel(1 - Depth)', () => {
    const width = 160;
    const height = 40;
    const box = createBoxDepthMap(width, height, { boxWidth: 60, boxHeight: 25, boxDepth: 0.8 });
    const invertedBox = invertDepthMap(box);

    const pattern: RgbaImage = {
      width: 25,
      height: 20,
      data: new Uint8ClampedArray(25 * 20 * 4),
    };
    for (let i = 0; i < 25 * 20; i++) {
      pattern.data[i * 4] = (i * 23) % 256;
      pattern.data[i * 4 + 1] = (i * 47) % 256;
      pattern.data[i * 4 + 2] = (i * 89) % 256;
      pattern.data[i * 4 + 3] = 255;
    }

    const texturedCross = generateTexturedStereogram(box, pattern, {
      convergenceMode: 'cross',
      patternSeparation: 35,
      depthFactor: 0.85,
    });

    const texturedParallelInverted = generateTexturedStereogram(invertedBox, pattern, {
      convergenceMode: 'parallel',
      patternSeparation: 35,
      depthFactor: 0.85,
    });

    expect(texturedCross.width).toBe(texturedParallelInverted.width);
    expect(texturedCross.height).toBe(texturedParallelInverted.height);

    for (let i = 0; i < texturedCross.data.length; i++) {
      expect(texturedCross.data[i]).toBe(texturedParallelInverted.data[i]);
    }
  });

  it('produces distinct, non-identical stereograms for Parallel vs Cross-eyed modes on the same non-flat depth map', () => {
    const width = 150;
    const height = 40;
    const slanted = createSlantedPlaneDepthMap(width, height, { minDepth: 0.1, maxDepth: 0.9 });

    const makePrng = () => {
      let state = 42;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    };

    const sirdsParallel = generateSirds(slanted, {
      convergenceMode: 'parallel',
      patternSeparation: 30,
      random: makePrng(),
    });

    const sirdsCross = generateSirds(slanted, {
      convergenceMode: 'cross',
      patternSeparation: 30,
      random: makePrng(),
    });

    // In parallel mode, foreground points have smaller separation (more dense repetition);
    // in cross mode, foreground points have larger separation.
    // They must NOT produce identical stereograms on a non-flat scene.
    let diffCount = 0;
    for (let i = 0; i < sirdsParallel.data.length; i += 4) {
      if (
        sirdsParallel.data[i] !== sirdsCross.data[i] ||
        sirdsParallel.data[i + 1] !== sirdsCross.data[i + 1] ||
        sirdsParallel.data[i + 2] !== sirdsCross.data[i + 2]
      ) {
        diffCount++;
      }
    }

    expect(diffCount).toBeGreaterThan(0);
  });
});
