import { describe, expect, it } from 'vitest';
import {
  calculateSeparation,
  createBoxDepthMap,
  createCheckerboardPattern,
  createFlatDepthMap,
  createSphereDepthMap,
  generateAutostereogram,
  generateTexturedStereogram,
  getDefaultPatternSeparation,
  type DepthMap,
  type RgbaImage,
} from './index.js';

describe('Textured Single Image Stereogram (Textured SIS)', () => {
  /**
   * Helper to create a unique test pattern where each pixel (x, y)
   * has distinct RGBA values based on coordinates:
   * R = (x * 7) % 256, G = (y * 11) % 256, B = (x + y * 3) % 256, A = 255.
   */
  function createUniquePattern(width: number, height: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const offset = rowOffset + x * 4;
        data[offset] = (x * 7) % 256;
        data[offset + 1] = (y * 11) % 256;
        data[offset + 2] = (x + y * 3) % 256;
        data[offset + 3] = 255;
      }
    }
    return { width, height, data };
  }

  describe('Flat Plane Periodicity', () => {
    it('produces exact periodic repetition of the pattern at the specified separation when pattern.width === separation', () => {
      const width = 480;
      const height = 120;
      const separation = 80;
      const depthMap = createFlatDepthMap(width, height, 0.0);
      const pattern = createUniquePattern(separation, 40);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4);

      // Verify that across every row and column, pixel x and pixel x + separation are identical
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        const patRowByteOffset = (y % pattern.height) * pattern.width * 4;

        // Verify the first strip matches the pattern pixel-for-pixel without distortion
        for (let x = 0; x < separation; x++) {
          const outOffset = rowByteOffset + x * 4;
          const patOffset = patRowByteOffset + x * 4;

          expect(result.data[outOffset]).toBe(pattern.data[patOffset]);
          expect(result.data[outOffset + 1]).toBe(pattern.data[patOffset + 1]);
          expect(result.data[outOffset + 2]).toBe(pattern.data[patOffset + 2]);
          expect(result.data[outOffset + 3]).toBe(pattern.data[patOffset + 3]);
        }

        // Verify exact periodic repetition across the entire image width
        for (let x = 0; x < width - separation; x++) {
          const leftOffset = rowByteOffset + x * 4;
          const rightOffset = rowByteOffset + (x + separation) * 4;

          expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
          expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
          expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
          expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
        }
      }
    });

    it('produces exact periodic repetition at computed separation for elevated flat planes (Z = 0.5, Z = 1.0)', () => {
      const width = 400;
      const height = 50;
      const baseSeparation = 70;
      const pattern = createUniquePattern(baseSeparation, 25);

      for (const z of [0.5, 1.0]) {
        const depthMap = createFlatDepthMap(width, height, z);
        const sep = calculateSeparation(z, baseSeparation, 1.0, 'parallel');

        const result = generateTexturedStereogram(depthMap, pattern, {
          patternSeparation: baseSeparation,
        });

        // Across all rows, every pixel must repeat exactly at distance sep
        for (let y = 0; y < height; y++) {
          const rowByteOffset = y * width * 4;
          for (let x = 0; x < width - sep; x++) {
            const leftOffset = rowByteOffset + x * 4;
            const rightOffset = rowByteOffset + (x + sep) * 4;

            expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
            expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
            expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
            expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
          }
        }
      }
    });
  });

  describe('Pattern Tiling When Pattern Width Differs From Separation', () => {
    it('tiles correctly when pattern width is narrower than separation (pattern.width < separation)', () => {
      const width = 360;
      const height = 40;
      const separation = 75;
      const patternWidth = 30; // 30 < 75
      const pattern = createUniquePattern(patternWidth, 20);
      const depthMap = createFlatDepthMap(width, height, 0.0);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      // 1. Stereogram must repeat with period equal to separation (75)
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        for (let x = 0; x < width - separation; x++) {
          const leftOffset = rowByteOffset + x * 4;
          const rightOffset = rowByteOffset + (x + separation) * 4;

          expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
          expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
          expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
          expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
        }
      }

      // 2. The first strip [0, separation - 1] must tile the pattern horizontally using (x % pattern.width)
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        const patRowByteOffset = (y % pattern.height) * pattern.width * 4;

        for (let x = 0; x < separation; x++) {
          const outOffset = rowByteOffset + x * 4;
          const patX = x % patternWidth;
          const patOffset = patRowByteOffset + patX * 4;

          expect(result.data[outOffset]).toBe(pattern.data[patOffset]);
          expect(result.data[outOffset + 1]).toBe(pattern.data[patOffset + 1]);
          expect(result.data[outOffset + 2]).toBe(pattern.data[patOffset + 2]);
          expect(result.data[outOffset + 3]).toBe(pattern.data[patOffset + 3]);
        }
      }
    });

    it('tiles correctly when pattern width is wider than separation (pattern.width > separation)', () => {
      const width = 400;
      const height = 40;
      const separation = 50;
      const patternWidth = 110; // 110 > 50
      const pattern = createUniquePattern(patternWidth, 20);
      const depthMap = createFlatDepthMap(width, height, 0.0);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      // 1. Stereogram must repeat with period equal to separation (50)
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        for (let x = 0; x < width - separation; x++) {
          const leftOffset = rowByteOffset + x * 4;
          const rightOffset = rowByteOffset + (x + separation) * 4;

          expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
          expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
          expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
          expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
        }
      }

      // 2. The first strip [0, separation - 1] must use the first separation columns of the pattern
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        const patRowByteOffset = (y % pattern.height) * pattern.width * 4;

        for (let x = 0; x < separation; x++) {
          const outOffset = rowByteOffset + x * 4;
          const patOffset = patRowByteOffset + x * 4;

          expect(result.data[outOffset]).toBe(pattern.data[patOffset]);
          expect(result.data[outOffset + 1]).toBe(pattern.data[patOffset + 1]);
          expect(result.data[outOffset + 2]).toBe(pattern.data[patOffset + 2]);
          expect(result.data[outOffset + 3]).toBe(pattern.data[patOffset + 3]);
        }
      }
    });

    it('tiles vertically when stereogram height exceeds pattern height', () => {
      const width = 200;
      const height = 90;
      const separation = 40;
      const pattern = createUniquePattern(40, 15); // height 15 < 90
      const depthMap = createFlatDepthMap(width, height, 0.0);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      // Verify vertical repetition: row y and row y + 15 must have identical pattern sampling
      for (let y = 0; y < height - 15; y++) {
        const rowA = y * width * 4;
        const rowB = (y + 15) * width * 4;
        for (let x = 0; x < width; x++) {
          const offsetA = rowA + x * 4;
          const offsetB = rowB + x * 4;
          expect(result.data[offsetA]).toBe(result.data[offsetB]);
          expect(result.data[offsetA + 1]).toBe(result.data[offsetB + 1]);
          expect(result.data[offsetA + 2]).toBe(result.data[offsetB + 2]);
          expect(result.data[offsetA + 3]).toBe(result.data[offsetB + 3]);
        }
      }
    });
  });

  describe('Constraint Propagation with Texture Colors', () => {
    it('propagates texture colors across disjoint-set links for 3D box shapes', () => {
      const width = 300;
      const height = 100;
      const separation = 60;
      const boxDepth = 0.8;
      const depthMap = createBoxDepthMap(width, height, {
        boxWidth: 100,
        boxHeight: 40,
        boxDepth,
      });
      const pattern = createCheckerboardPattern(separation, 30, 6);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      // At the center of the box (y = 50), depth is 0.8.
      // Expected separation is calculateSeparation(0.8, 60).
      const boxSep = calculateSeparation(boxDepth, separation, 1.0, 'parallel');
      expect(boxSep).toBeLessThan(separation);

      // Verify that near the center of the box, corresponding left-right pixels match
      const centerY = 50;
      const centerX = 150;
      const offset = Math.floor(boxSep / 2);
      const left = centerX - offset;
      const right = left + boxSep;

      const rowByteOffset = centerY * width * 4;
      const leftOffset = rowByteOffset + left * 4;
      const rightOffset = rowByteOffset + right * 4;

      expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
      expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
      expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
      expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
    });

    it('propagates texture colors across smooth spherical 3D surfaces', () => {
      const width = 320;
      const height = 120;
      const separation = 64;
      const depthMap = createSphereDepthMap(width, height, {
        radius: 40,
        peakDepth: 1.0,
        backgroundDepth: 0.0,
      });
      const pattern = createUniquePattern(separation, 40);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      // Peak of sphere is at (160, 60) with Z = 1.0
      const peakSep = calculateSeparation(1.0, separation, 1.0, 'parallel');
      const peakOffset = Math.floor(peakSep / 2);
      const peakLeft = 160 - peakOffset;
      const peakRight = peakLeft + peakSep;

      const rowByteOffset = 60 * width * 4;
      const leftIdx = rowByteOffset + peakLeft * 4;
      const rightIdx = rowByteOffset + peakRight * 4;

      expect(result.data[leftIdx]).toBe(result.data[rightIdx]);
      expect(result.data[leftIdx + 1]).toBe(result.data[rightIdx + 1]);
      expect(result.data[leftIdx + 2]).toBe(result.data[rightIdx + 2]);
      expect(result.data[leftIdx + 3]).toBe(result.data[rightIdx + 3]);
    });
  });

  describe('Dynamic Pattern Separation Default', () => {
    it('defaults to ~1/7 to 1/8 of image width (Math.round(width / 8)) when separation is omitted', () => {
      const width = 800;
      const height = 50;
      const expectedSep = Math.round(width / 8); // 100
      expect(getDefaultPatternSeparation(width)).toBe(expectedSep);

      const depthMap = createFlatDepthMap(width, height, 0.0);
      const pattern = createUniquePattern(expectedSep, 20);

      const result = generateTexturedStereogram(depthMap, pattern);

      // Verify that the default separation was used by testing periodicity at expectedSep
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        for (let x = 0; x < width - expectedSep; x++) {
          const leftOffset = rowByteOffset + x * 4;
          const rightOffset = rowByteOffset + (x + expectedSep) * 4;
          expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
          expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
          expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
          expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
        }
      }
    });

    it('respects explicit patternSeparation override over the default', () => {
      const width = 800;
      const height = 40;
      const customSep = 65; // Different from 800 / 8 = 100
      const depthMap = createFlatDepthMap(width, height, 0.0);
      const pattern = createUniquePattern(customSep, 20);

      const result = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: customSep,
      });

      // Must repeat with period 65, not 100
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        for (let x = 0; x < width - customSep; x++) {
          const leftOffset = rowByteOffset + x * 4;
          const rightOffset = rowByteOffset + (x + customSep) * 4;
          expect(result.data[leftOffset]).toBe(result.data[rightOffset]);
          expect(result.data[leftOffset + 1]).toBe(result.data[rightOffset + 1]);
          expect(result.data[leftOffset + 2]).toBe(result.data[rightOffset + 2]);
          expect(result.data[leftOffset + 3]).toBe(result.data[rightOffset + 3]);
        }
      }
    });
  });

  describe('Convergence Mode Inversion', () => {
    it('inverts depth disparity in cross-eyed mode', () => {
      const width = 300;
      const height = 40;
      const separation = 60;
      const depthMap = createFlatDepthMap(width, height, 1.0); // Foreground plane Z = 1.0
      const pattern = createUniquePattern(separation, 20);

      // In parallel mode: Z = 1.0 produces smaller separation sep(1.0) < 60
      const parallelResult = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
        convergenceMode: 'parallel',
      });
      const parallelSep = calculateSeparation(1.0, separation, 1.0, 'parallel');

      // In cross-eyed mode: Z = 1.0 inverts to z = 0, producing base separation 60
      const crossResult = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
        convergenceMode: 'cross',
      });
      const crossSep = calculateSeparation(1.0, separation, 1.0, 'cross');

      expect(parallelSep).toBeLessThan(separation);
      expect(crossSep).toBe(separation);

      // Verify crossResult repeats with base separation 60
      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * width * 4;
        for (let x = 0; x < width - crossSep; x++) {
          const left = rowByteOffset + x * 4;
          const right = rowByteOffset + (x + crossSep) * 4;
          expect(crossResult.data[left]).toBe(crossResult.data[right]);
        }
      }
    });
  });

  describe('Unified generateAutostereogram API', () => {
    it('dispatches to generateTexturedStereogram when pattern is supplied', () => {
      const width = 200;
      const height = 40;
      const separation = 40;
      const depthMap = createFlatDepthMap(width, height, 0.0);
      const pattern = createUniquePattern(separation, 20);

      const result = generateAutostereogram(depthMap, {
        pattern,
        patternSeparation: separation,
      });

      // Must match direct generateTexturedStereogram
      const direct = generateTexturedStereogram(depthMap, pattern, {
        patternSeparation: separation,
      });

      expect(result.data).toEqual(direct.data);
    });

    it('dispatches to generateSirds when pattern is omitted', () => {
      const width = 200;
      const height = 40;
      const depthMap = createFlatDepthMap(width, height, 0.0);

      const result = generateAutostereogram(depthMap, {
        patternSeparation: 40,
        random: () => 0.5,
      });

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4);
    });
  });

  describe('Validation & Edge Cases', () => {
    const validDepthMap: DepthMap = {
      width: 10,
      height: 10,
      data: new Float32Array(100),
    };
    const validPattern: RgbaImage = {
      width: 5,
      height: 5,
      data: new Uint8ClampedArray(100),
    };

    it('throws on non-positive depth map dimensions', () => {
      expect(() =>
        generateTexturedStereogram({ width: 0, height: 10, data: new Float32Array(0) }, validPattern)
      ).toThrow(/Invalid depth map dimensions/);

      expect(() =>
        generateTexturedStereogram({ width: 10, height: -1, data: new Float32Array(0) }, validPattern)
      ).toThrow(/Invalid depth map dimensions/);
    });

    it('throws on undersized depth map data buffer', () => {
      expect(() =>
        generateTexturedStereogram({ width: 10, height: 10, data: new Float32Array(50) }, validPattern)
      ).toThrow(/Depth map buffer size mismatch/);
    });

    it('throws on non-positive pattern dimensions', () => {
      expect(() =>
        generateTexturedStereogram(validDepthMap, {
          width: 0,
          height: 5,
          data: new Uint8ClampedArray(0),
        })
      ).toThrow(/Invalid pattern dimensions/);
    });

    it('throws on undersized pattern data buffer', () => {
      expect(() =>
        generateTexturedStereogram(validDepthMap, {
          width: 5,
          height: 5,
          data: new Uint8ClampedArray(50), // Needs 5 * 5 * 4 = 100
        })
      ).toThrow(/Pattern buffer size mismatch/);
    });

    it('handles degenerate 1x1 depth map and pattern without throwing', () => {
      const dMap: DepthMap = { width: 1, height: 1, data: new Float32Array([0.5]) };
      const pat: RgbaImage = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 64, 32, 255]),
      };

      const result = generateTexturedStereogram(dMap, pat);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBe(128);
      expect(result.data[1]).toBe(64);
      expect(result.data[2]).toBe(32);
      expect(result.data[3]).toBe(255);
    });
  });
});
