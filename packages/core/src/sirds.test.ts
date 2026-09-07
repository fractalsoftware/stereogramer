import { describe, it, expect } from 'vitest';
import {
  generateSirds,
  computeScanlineConstraints,
  calculateSeparation,
  createFlatDepthMap,
  createBoxDepthMap,
  createSphereDepthMap,
  MAX_DISPARITY_FRACTION,
} from './index.js';

describe('TIW SIRDS Core Engine', () => {
  describe('Flat Plane Periodicity', () => {
    it('generates an exact periodic repeating pattern for uniform background (Z = 0)', () => {
      const width = 400;
      const height = 10;
      const baseSeparation = 50;
      const depthMap = createFlatDepthMap(width, height, 0.0);

      const expectedSep = calculateSeparation(0.0, baseSeparation, 1.0, 'parallel');
      expect(expectedSep).toBe(baseSeparation);

      // Use a deterministic PRNG for test repeatability
      let seed = 12345;
      const prng = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const result = generateSirds(depthMap, {
        patternSeparation: baseSeparation,
        random: prng,
      });

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4);

      // Verify that for every row and every pixel x where x + expectedSep < width,
      // pixel x and pixel x + expectedSep have identical RGBA values.
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width - expectedSep; x++) {
          const idxA = rowOffset + x * 4;
          const idxB = rowOffset + (x + expectedSep) * 4;

          const rA = result.data[idxA]!;
          const gA = result.data[idxA + 1]!;
          const bA = result.data[idxA + 2]!;
          const aA = result.data[idxA + 3]!;

          const rB = result.data[idxB]!;
          const gB = result.data[idxB + 1]!;
          const bB = result.data[idxB + 2]!;
          const aB = result.data[idxB + 3]!;

          expect(rA).toBe(rB);
          expect(gA).toBe(gB);
          expect(bA).toBe(bB);
          expect(aA).toBe(aB);
        }
      }
    });

    it('generates an exact periodic repeating pattern for uniform mid-depth (Z = 0.5)', () => {
      const width = 400;
      const height = 5;
      const baseSeparation = 60;
      const depthMap = createFlatDepthMap(width, height, 0.5);

      const expectedSep = calculateSeparation(0.5, baseSeparation, 1.0, 'parallel');
      expect(expectedSep).toBeLessThan(baseSeparation);

      const result = generateSirds(depthMap, {
        patternSeparation: baseSeparation,
      });

      for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width - expectedSep; x++) {
          const idxA = rowOffset + x * 4;
          const idxB = rowOffset + (x + expectedSep) * 4;

          expect(result.data[idxA]).toBe(result.data[idxB]);
          expect(result.data[idxA + 1]).toBe(result.data[idxB + 1]);
          expect(result.data[idxA + 2]).toBe(result.data[idxB + 2]);
          expect(result.data[idxA + 3]).toBe(result.data[idxB + 3]);
        }
      }
    });

    it('generates an exact periodic repeating pattern for uniform foreground (Z = 1.0)', () => {
      const width = 400;
      const height = 5;
      const baseSeparation = 60;
      const depthMap = createFlatDepthMap(width, height, 1.0);

      const expectedSep = calculateSeparation(1.0, baseSeparation, 1.0, 'parallel');
      const result = generateSirds(depthMap, {
        patternSeparation: baseSeparation,
      });

      for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width - expectedSep; x++) {
          const idxA = rowOffset + x * 4;
          const idxB = rowOffset + (x + expectedSep) * 4;

          expect(result.data[idxA]).toBe(result.data[idxB]);
          expect(result.data[idxA + 1]).toBe(result.data[idxB + 1]);
          expect(result.data[idxA + 2]).toBe(result.data[idxB + 2]);
          expect(result.data[idxA + 3]).toBe(result.data[idxB + 3]);
        }
      }
    });
  });

  describe('Disparity Boundedness', () => {
    it('clamps maximum disparity to <= 33% of base separation across all depths', () => {
      const baseSeparation = 100;
      const maxAllowedDisparity = Math.ceil(baseSeparation * MAX_DISPARITY_FRACTION);

      for (let z = 0; z <= 1.0; z += 0.05) {
        const sep = calculateSeparation(z, baseSeparation, 1.0, 'parallel');
        const disparity = baseSeparation - sep;
        expect(disparity).toBeGreaterThanOrEqual(0);
        expect(disparity).toBeLessThanOrEqual(maxAllowedDisparity);
      }
    });

    it('depthFactor scales disparity proportionally', () => {
      const baseSeparation = 90;
      const sepFull = calculateSeparation(1.0, baseSeparation, 1.0, 'parallel');
      const sepHalf = calculateSeparation(1.0, baseSeparation, 0.5, 'parallel');
      const sepZero = calculateSeparation(1.0, baseSeparation, 0.0, 'parallel');

      expect(baseSeparation - sepFull).toBeGreaterThan(baseSeparation - sepHalf);
      expect(baseSeparation - sepZero).toBe(0);
    });
  });

  describe('Hidden Surface Removal (HSR) Invariant', () => {
    it('discards occluded constraint links behind a sharp foreground step', () => {
      const width = 200;
      const baseSeparation = 40;
      const depthRow = new Float32Array(width);

      // Create a background field with a sharp foreground step at center
      depthRow.fill(0.0);
      const stepStart = 80;
      const stepEnd = 120;
      for (let x = stepStart; x < stepEnd; x++) {
        depthRow[x] = 0.9;
      }

      const constraints = computeScanlineConstraints(depthRow, width, 0, {
        baseSeparation,
        depthFactor: 1.0,
        convergenceMode: 'parallel',
      });

      // Background pixels directly adjacent to the step should not link through the step
      for (let x = 0; x < width; x++) {
        const target = constraints[x]!;
        if (target !== x) {
          // If a background pixel links to another pixel, it should not jump right across
          // a foreground occluder without HSR having validated it
          expect(target).toBeGreaterThan(x);
        }
      }
    });
  });

  describe('Convergence Symmetry', () => {
    it('matches constraints between cross-eyed depth D and parallel inverted depth (1 - D)', () => {
      const width = 150;
      const baseSeparation = 30;

      const sphereParallel = createSphereDepthMap(width, 10, { peakDepth: 0.8, backgroundDepth: 0.1 });
      const sphereCross = createSphereDepthMap(width, 10, { peakDepth: 0.8, backgroundDepth: 0.1 });

      // Invert sphereParallel depth manually: D' = 1 - D
      const invertedDepthRow = new Float32Array(width);
      const originalDepthRow = new Float32Array(width);

      for (let x = 0; x < width; x++) {
        originalDepthRow[x] = sphereCross.data[x]!;
        invertedDepthRow[x] = 1.0 - sphereCross.data[x]!;
      }

      const crossConstraints = computeScanlineConstraints(originalDepthRow, width, 0, {
        baseSeparation,
        convergenceMode: 'cross',
      });

      const parallelInvertedConstraints = computeScanlineConstraints(invertedDepthRow, width, 0, {
        baseSeparation,
        convergenceMode: 'parallel',
      });

      // Both should yield identical constraint arrays
      for (let x = 0; x < width; x++) {
        expect(crossConstraints[x]).toBe(parallelInvertedConstraints[x]);
      }
    });
  });

  describe('Memory Safety & Degenerate Inputs', () => {
    it('handles non-square dimensions and degenerate sizes safely', () => {
      // 1x1 degenerate input
      const map1x1 = createFlatDepthMap(1, 1, 0.5);
      const out1x1 = generateSirds(map1x1);
      expect(out1x1.data.length).toBe(4);

      // Extreme aspect ratios
      const mapNarrow = createFlatDepthMap(10, 200, 0.2);
      const outNarrow = generateSirds(mapNarrow);
      expect(outNarrow.data.length).toBe(10 * 200 * 4);

      const mapWide = createFlatDepthMap(300, 5, 0.7);
      const outWide = generateSirds(mapWide);
      expect(outWide.data.length).toBe(300 * 5 * 4);
    });

    it('throws error for invalid dimensions', () => {
      expect(() =>
        generateSirds({ width: 0, height: 10, data: new Float32Array(0) })
      ).toThrow();
    });
  });
});
