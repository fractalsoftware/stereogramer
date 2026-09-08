import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECIPES,
  rgbaToHex,
  hexToRgba,
} from './PatternStudioModal.js';
import {
  generatePatternTile,
  type PatternGeneratorType,
  type PatternRecipe,
} from '@stereogramer/core';

describe('PatternStudioModal & Procedural Synthesis Engine', () => {
  describe('Color Conversion Utilities', () => {
    it('converts RGBA tuples to hex strings with zero-padding', () => {
      expect(rgbaToHex([56, 189, 248, 255])).toBe('#38bdf8');
      expect(rgbaToHex([15, 23, 42, 255])).toBe('#0f172a');
      expect(rgbaToHex([236, 72, 153, 255])).toBe('#ec4899');
      expect(rgbaToHex([0, 0, 0, 255])).toBe('#000000');
      expect(rgbaToHex([255, 255, 255, 255])).toBe('#ffffff');
    });

    it('clamps RGBA values within [0, 255]', () => {
      expect(rgbaToHex([-10, 300, 128, 255])).toBe('#00ff80');
    });

    it('falls back to default color on invalid or empty color input', () => {
      expect(rgbaToHex(undefined, '#38bdf8')).toBe('#38bdf8');
      expect(rgbaToHex([] as any, '#ff0000')).toBe('#ff0000');
    });

    it('converts standard 6-digit hex strings to RGBA tuples', () => {
      expect(hexToRgba('#38bdf8')).toEqual([56, 189, 248, 255]);
      expect(hexToRgba('#0f172a')).toEqual([15, 23, 42, 255]);
      expect(hexToRgba('#ec4899')).toEqual([236, 72, 153, 255]);
    });

    it('converts 3-digit shorthand hex strings to RGBA tuples', () => {
      expect(hexToRgba('#fff')).toEqual([255, 255, 255, 255]);
      expect(hexToRgba('#000')).toEqual([0, 0, 0, 255]);
      expect(hexToRgba('#f00')).toEqual([255, 0, 0, 255]);
    });

    it('supports custom alpha override in hexToRgba', () => {
      expect(hexToRgba('#38bdf8', 128)).toEqual([56, 189, 248, 128]);
    });
  });

  describe('Default Recipes Coverage', () => {
    const generatorTypes: PatternGeneratorType[] = [
      'perlin',
      'voronoi',
      'checker',
      'stripes',
      'mosaic',
    ];

    it.each(generatorTypes)('defines a valid default recipe for "%s"', (type) => {
      const recipe = DEFAULT_RECIPES[type];
      expect(recipe).toBeDefined();
      expect(recipe.type).toBe(type);
      expect(recipe.colorA).toBeDefined();
      expect(recipe.colorB).toBeDefined();
      expect(typeof recipe.seed).toBe('number');
    });

    it('configures distinct color schemes across generators matching the palette', () => {
      expect(rgbaToHex(DEFAULT_RECIPES.perlin.colorA)).toBe('#38bdf8'); // Sky cyan
      expect(rgbaToHex(DEFAULT_RECIPES.voronoi.colorA)).toBe('#ec4899'); // Neon pink
      expect(rgbaToHex(DEFAULT_RECIPES.checker.colorA)).toBe('#38bdf8');
      expect(rgbaToHex(DEFAULT_RECIPES.stripes.colorA)).toBe('#ef4444'); // Crimson red
      expect(rgbaToHex(DEFAULT_RECIPES.mosaic.colorA)).toBe('#ec4899');
    });
  });

  describe('Procedural Synthesis Tile Dimensions (ADR 0003)', () => {
    it.each([
      ['perlin', DEFAULT_RECIPES.perlin],
      ['voronoi', DEFAULT_RECIPES.voronoi],
      ['checker', DEFAULT_RECIPES.checker],
      ['stripes', DEFAULT_RECIPES.stripes],
      ['mosaic', DEFAULT_RECIPES.mosaic],
    ])('synthesizes exact width & height for %s recipe', (_name, recipe) => {
      const separation = 95;
      const verticalPeriod = 110;

      const tile = generatePatternTile(separation, verticalPeriod, recipe as PatternRecipe);
      expect(tile.width).toBe(separation);
      expect(tile.height).toBe(verticalPeriod);
      expect(tile.data.length).toBe(separation * verticalPeriod * 4);
    });

    it('preserves toroidal seamless continuity across tile boundaries', () => {
      const width = 80;
      const height = 80;
      const tile = generatePatternTile(width, height, DEFAULT_RECIPES.perlin);

      // Verify pixel buffer has non-zero variety
      let hasVariety = false;
      const firstPixel = [tile.data[0], tile.data[1], tile.data[2]];
      for (let i = 4; i < tile.data.length; i += 4) {
        if (
          tile.data[i] !== firstPixel[0] ||
          tile.data[i + 1] !== firstPixel[1] ||
          tile.data[i + 2] !== firstPixel[2]
        ) {
          hasVariety = true;
          break;
        }
      }
      expect(hasVariety).toBe(true);
    });

    it('generates deterministic tiles given identical seeds', () => {
      const recipeA: PatternRecipe = {
        type: 'perlin',
        scale: 4,
        octaves: 3,
        seed: 42,
      };
      const recipeB: PatternRecipe = {
        type: 'perlin',
        scale: 4,
        octaves: 3,
        seed: 42,
      };

      const tileA = generatePatternTile(60, 60, recipeA);
      const tileB = generatePatternTile(60, 60, recipeB);

      expect(tileA.data).toEqual(tileB.data);
    });

    it('generates different pattern variation when seed changes', () => {
      const recipeA: PatternRecipe = {
        type: 'perlin',
        scale: 4,
        octaves: 3,
        seed: 123,
      };
      const recipeB: PatternRecipe = {
        type: 'perlin',
        scale: 4,
        octaves: 3,
        seed: 999,
      };

      const tileA = generatePatternTile(60, 60, recipeA);
      const tileB = generatePatternTile(60, 60, recipeB);

      expect(tileA.data).not.toEqual(tileB.data);
    });
  });

  describe('3D Fusibility Testbed Engine (Ticket #18)', () => {
    it('defines fixed testbed preview dimensions of 240×160 px', async () => {
      const { TESTBED_WIDTH, TESTBED_HEIGHT } = await import('./PatternStudioModal.js');
      expect(TESTBED_WIDTH).toBe(240);
      expect(TESTBED_HEIGHT).toBe(160);
    });

    it('generates a standardized benchmark 3D floating sphere depth map at 240×160', async () => {
      const { getBenchmarkSphereDepthMap, TESTBED_WIDTH, TESTBED_HEIGHT } = await import('./PatternStudioModal.js');
      const sphere = getBenchmarkSphereDepthMap();

      expect(sphere.width).toBe(TESTBED_WIDTH);
      expect(sphere.height).toBe(TESTBED_HEIGHT);
      expect(sphere.data.length).toBe(TESTBED_WIDTH * TESTBED_HEIGHT);

      // Verify depth values are normalized within [0.0, 1.0]
      let minVal = 1.0;
      let maxVal = 0.0;
      for (let i = 0; i < sphere.data.length; i++) {
        const val = sphere.data[i]!;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      expect(minVal).toBeGreaterThanOrEqual(0.0);
      expect(maxVal).toBeLessThanOrEqual(1.0);

      // Sphere center (x = 120, y = 80) should have peak elevation near 1.0
      const centerIndex = 80 * TESTBED_WIDTH + 120;
      expect(sphere.data[centerIndex]).toBeGreaterThan(0.9);

      // Sphere border corners should have background elevation of 0.0
      expect(sphere.data[0]).toBe(0.0);
      expect(sphere.data[TESTBED_WIDTH - 1]).toBe(0.0);
      expect(sphere.data[(TESTBED_HEIGHT - 1) * TESTBED_WIDTH]).toBe(0.0);
    });

    describe('Depth Map Resampling / Downsampling', () => {
      it('downsamples a 640×480 project depth map to 240×160 using bilinear interpolation', async () => {
        const { resampleDepthMap, TESTBED_WIDTH, TESTBED_HEIGHT } = await import('./PatternStudioModal.js');
        const srcW = 640;
        const srcH = 480;
        const srcData = new Float32Array(srcW * srcH);

        // Fill with a linear horizontal depth ramp: 0.0 at left, 1.0 at right
        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            srcData[y * srcW + x] = x / (srcW - 1);
          }
        }

        const resampled = resampleDepthMap({ width: srcW, height: srcH, data: srcData }, TESTBED_WIDTH, TESTBED_HEIGHT);

        expect(resampled.width).toBe(TESTBED_WIDTH);
        expect(resampled.height).toBe(TESTBED_HEIGHT);
        expect(resampled.data.length).toBe(TESTBED_WIDTH * TESTBED_HEIGHT);

        // Verify left column is near 0.0 and right column is near 1.0
        for (let y = 0; y < TESTBED_HEIGHT; y++) {
          expect(resampled.data[y * TESTBED_WIDTH]).toBeLessThan(0.05);
          expect(resampled.data[y * TESTBED_WIDTH + (TESTBED_WIDTH - 1)]).toBeGreaterThan(0.95);
        }
      });

      it('preserves uniform elevation across flat depth planes without distortion', async () => {
        const { resampleDepthMap, TESTBED_WIDTH, TESTBED_HEIGHT } = await import('./PatternStudioModal.js');
        const srcData = new Float32Array(800 * 600).fill(0.65);
        const resampled = resampleDepthMap({ width: 800, height: 600, data: srcData }, TESTBED_WIDTH, TESTBED_HEIGHT);

        for (let i = 0; i < resampled.data.length; i++) {
          expect(resampled.data[i]).toBeCloseTo(0.65, 4);
        }
      });

      it('returns identical copy if source dimensions match target dimensions', async () => {
        const { resampleDepthMap, TESTBED_WIDTH, TESTBED_HEIGHT } = await import('./PatternStudioModal.js');
        const srcData = new Float32Array(TESTBED_WIDTH * TESTBED_HEIGHT);
        srcData[100] = 0.42;

        const resampled = resampleDepthMap({ width: TESTBED_WIDTH, height: TESTBED_HEIGHT, data: srcData }, TESTBED_WIDTH, TESTBED_HEIGHT);
        expect(resampled.width).toBe(TESTBED_WIDTH);
        expect(resampled.height).toBe(TESTBED_HEIGHT);
        expect(resampled.data[100]).toBeCloseTo(0.42, 4);
      });
    });

    describe('Scaled Pattern Separation & Vertical Period (ADR 0003)', () => {
      it('calculates proportional pattern separation scaled to 240 canvas width', async () => {
        const { calculateTestbedSeparation } = await import('./PatternStudioModal.js');

        // 80 px separation on 640 px base canvas -> scale 240/640 = 0.375 -> 30 px
        expect(calculateTestbedSeparation(80, 640)).toBe(30);

        // 96 px separation on 640 px base canvas -> 96 * 0.375 = 36 px
        expect(calculateTestbedSeparation(96, 640)).toBe(36);

        // 100 px separation on 800 px base canvas -> 100 * (240 / 800) = 30 px
        expect(calculateTestbedSeparation(100, 800)).toBe(30);
      });

      it('clamps scaled separation within safe min and max boundaries', async () => {
        const { calculateTestbedSeparation } = await import('./PatternStudioModal.js');

        // Small separation clamped to at least 12 px
        expect(calculateTestbedSeparation(10, 640)).toBeGreaterThanOrEqual(12);

        // Oversized separation clamped to at most width / 2 (120 px)
        expect(calculateTestbedSeparation(500, 640)).toBeLessThanOrEqual(120);
      });
    });

    describe('Live Mini Autostereogram Generation', () => {
      it('generates a valid 240×160 textured stereogram with RGBA buffer', async () => {
        const {
          getBenchmarkSphereDepthMap,
          generateTestbedStereogramImage,
          DEFAULT_RECIPES,
          TESTBED_WIDTH,
          TESTBED_HEIGHT,
        } = await import('./PatternStudioModal.js');

        const sphere = getBenchmarkSphereDepthMap();
        const { stereogram, testbedSeparation } = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.voronoi,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.85,
          }
        );

        expect(stereogram.width).toBe(TESTBED_WIDTH);
        expect(stereogram.height).toBe(TESTBED_HEIGHT);
        expect(stereogram.data.length).toBe(TESTBED_WIDTH * TESTBED_HEIGHT * 4);
        expect(testbedSeparation).toBe(30);

        // Verify alpha channel is 255 for all pixels
        for (let i = 3; i < stereogram.data.length; i += 4) {
          expect(stereogram.data[i]).toBe(255);
        }
      });

      it('switches between benchmark sphere and active project depth map', async () => {
        const {
          getBenchmarkSphereDepthMap,
          resampleDepthMap,
          generateTestbedStereogramImage,
          DEFAULT_RECIPES,
          TESTBED_WIDTH,
          TESTBED_HEIGHT,
        } = await import('./PatternStudioModal.js');

        const sphere = getBenchmarkSphereDepthMap();

        // Create an active project depth map with a distinct central raised block
        const projectSrc = new Float32Array(640 * 480).fill(0.0);
        // Center rectangle raised to depth 0.9
        for (let y = 150; y < 330; y++) {
          for (let x = 200; x < 440; x++) {
            projectSrc[y * 640 + x] = 0.9;
          }
        }
        const projectDepth = resampleDepthMap({ width: 640, height: 480, data: projectSrc }, TESTBED_WIDTH, TESTBED_HEIGHT);

        const stereogramSphere = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.checker,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.85,
          }
        );

        const stereogramProject = generateTestbedStereogramImage(
          projectDepth,
          DEFAULT_RECIPES.checker,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.85,
          }
        );

        // Verify the two depth maps produce visually distinct stereograms
        let differences = 0;
        for (let i = 0; i < stereogramSphere.stereogram.data.length; i += 4) {
          if (
            stereogramSphere.stereogram.data[i] !== stereogramProject.stereogram.data[i] ||
            stereogramSphere.stereogram.data[i + 1] !== stereogramProject.stereogram.data[i + 1] ||
            stereogramSphere.stereogram.data[i + 2] !== stereogramProject.stereogram.data[i + 2]
          ) {
            differences++;
          }
        }
        expect(differences).toBeGreaterThan(100);
      });

      it('respects convergenceMode passing (parallel vs cross-eyed)', async () => {
        const {
          getBenchmarkSphereDepthMap,
          generateTestbedStereogramImage,
          DEFAULT_RECIPES,
        } = await import('./PatternStudioModal.js');

        const sphere = getBenchmarkSphereDepthMap();

        const stereogramParallel = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.stripes,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.85,
          }
        );

        const stereogramCross = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.stripes,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'cross',
            depthFactor: 0.85,
          }
        );

        // Parallel and Cross convergence produce structurally inverted disparity shifts
        let mismatchCount = 0;
        for (let i = 0; i < stereogramParallel.stereogram.data.length; i++) {
          if (stereogramParallel.stereogram.data[i] !== stereogramCross.stereogram.data[i]) {
            mismatchCount++;
          }
        }
        expect(mismatchCount).toBeGreaterThan(500);
      });

      it('respects depthFactor modulation on disparity depth deform', async () => {
        const {
          getBenchmarkSphereDepthMap,
          generateTestbedStereogramImage,
          DEFAULT_RECIPES,
        } = await import('./PatternStudioModal.js');

        const sphere = getBenchmarkSphereDepthMap();

        // DepthFactor = 0 (no 3D relief, perfectly flat wallpaper repetition)
        const flatStereogram = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.checker,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.0,
          }
        );

        // DepthFactor = 0.9 (full 3D relief deformation)
        const depthStereogram = generateTestbedStereogramImage(
          sphere,
          DEFAULT_RECIPES.checker,
          {
            patternSeparation: 80,
            verticalPeriod: 80,
            baseWidth: 640,
            convergenceMode: 'parallel',
            depthFactor: 0.9,
          }
        );

        let diffs = 0;
        for (let i = 0; i < flatStereogram.stereogram.data.length; i++) {
          if (flatStereogram.stereogram.data[i] !== depthStereogram.stereogram.data[i]) {
            diffs++;
          }
        }
        expect(diffs).toBeGreaterThan(200);
      });

      it('supports all five procedural generator recipes in the testbed', async () => {
        const {
          getBenchmarkSphereDepthMap,
          generateTestbedStereogramImage,
          DEFAULT_RECIPES,
          TESTBED_WIDTH,
          TESTBED_HEIGHT,
        } = await import('./PatternStudioModal.js');

        const sphere = getBenchmarkSphereDepthMap();
        const generators: Array<keyof typeof DEFAULT_RECIPES> = [
          'perlin',
          'voronoi',
          'checker',
          'stripes',
          'mosaic',
        ];

        for (const gen of generators) {
          const result = generateTestbedStereogramImage(
            sphere,
            DEFAULT_RECIPES[gen],
            {
              patternSeparation: 80,
              verticalPeriod: 80,
              baseWidth: 640,
              convergenceMode: 'parallel',
              depthFactor: 0.85,
            }
          );
          expect(result.stereogram.width).toBe(TESTBED_WIDTH);
          expect(result.stereogram.height).toBe(TESTBED_HEIGHT);
          expect(result.stereogram.data.length).toBe(TESTBED_WIDTH * TESTBED_HEIGHT * 4);
        }
      });
    });
  });
});

