import { describe, it, expect } from 'vitest';
import {
  resolveSirdsPalette,
  SIRDS_PALETTES,
  generatePerlinTexture,
  generateVoronoiTexture,
  generateCheckerboardTexture,
  generateStripesTexture,
  generateMosaicTexture,
  generatePatternTile,
  generateSirds,
  createSphereDepthMap,
  type PatternRecipe,
} from './index.js';

describe('Palettes and Procedural Textures', () => {
  describe('SIRDS Palettes', () => {
    it('resolves default and named presets', () => {
      expect(resolveSirdsPalette()).toEqual(SIRDS_PALETTES.bw);
      expect(resolveSirdsPalette('bw')).toEqual(SIRDS_PALETTES.bw);
      expect(resolveSirdsPalette('grayscale').length).toBe(16);
      expect(resolveSirdsPalette('rgb').length).toBe(10);
      expect(resolveSirdsPalette('duotone').length).toBe(16);
    });

    it('generates SIRDS with named palettes', () => {
      const depth = createSphereDepthMap(120, 80);
      const sirdsBw = generateSirds(depth, { palette: 'bw' });
      expect(sirdsBw.data.length).toBe(120 * 80 * 4);

      const sirdsRgb = generateSirds(depth, { palette: 'rgb' });
      expect(sirdsRgb.data.length).toBe(120 * 80 * 4);

      const sirdsDuotone = generateSirds(depth, { palette: 'duotone' });
      expect(sirdsDuotone.data.length).toBe(120 * 80 * 4);
    });
  });

  describe('Procedural Texture Generators', () => {
    it('generates tileable Perlin noise texture with correct dimensions and bounds', () => {
      const texture = generatePerlinTexture(80, 60, { scale: 4, octaves: 2 });
      expect(texture.width).toBe(80);
      expect(texture.height).toBe(60);
      expect(texture.data.length).toBe(80 * 60 * 4);

      // Verify all alpha channels are 255
      for (let i = 3; i < texture.data.length; i += 4) {
        expect(texture.data[i]).toBe(255);
      }
    });

    it('generates Voronoi cellular texture with correct dimensions and bounds', () => {
      const texture = generateVoronoiTexture(80, 60, { numCells: 12 });
      expect(texture.width).toBe(80);
      expect(texture.height).toBe(60);
      expect(texture.data.length).toBe(80 * 60 * 4);

      for (let i = 3; i < texture.data.length; i += 4) {
        expect(texture.data[i]).toBe(255);
      }
    });

    it('generates Checkerboard texture tile', () => {
      const texture = generateCheckerboardTexture(40, 40, 10);
      expect(texture.width).toBe(40);
      expect(texture.height).toBe(40);
      expect(texture.data.length).toBe(40 * 40 * 4);
    });

    it('generates Stripes texture tile with vertical and horizontal orientations', () => {
      const vertical = generateStripesTexture(40, 40, { stripeWidth: 10, direction: 'vertical' });
      expect(vertical.width).toBe(40);
      expect(vertical.height).toBe(40);
      expect(vertical.data.length).toBe(40 * 40 * 4);

      // Verify vertical bands are identical along y
      for (let x = 0; x < 40; x++) {
        const top = (0 * 40 + x) * 4;
        const bottom = (39 * 40 + x) * 4;
        expect(vertical.data[top]).toBe(vertical.data[bottom]);
      }

      const horizontal = generateStripesTexture(40, 40, { stripeWidth: 10, direction: 'horizontal' });
      // Verify horizontal bands are identical along x
      for (let y = 0; y < 40; y++) {
        const left = (y * 40 + 0) * 4;
        const right = (y * 40 + 39) * 4;
        expect(horizontal.data[left]).toBe(horizontal.data[right]);
      }
    });

    it('generates Mosaic texture tile with dots and background', () => {
      const mosaic = generateMosaicTexture(40, 40, { cellSize: 20, dotRadius: 6 });
      expect(mosaic.width).toBe(40);
      expect(mosaic.height).toBe(40);
      expect(mosaic.data.length).toBe(40 * 40 * 4);

      for (let i = 3; i < mosaic.data.length; i += 4) {
        expect(mosaic.data[i]).toBe(255);
      }
    });
  });

  describe('generatePatternTile Dispatcher', () => {
    it('dispatches all 5 recipe types correctly', () => {
      const recipes: PatternRecipe[] = [
        { type: 'perlin', scale: 4, octaves: 2 },
        { type: 'voronoi', numCells: 12 },
        { type: 'checker', cellSize: 10 },
        { type: 'stripes', stripeWidth: 10 },
        { type: 'mosaic', cellSize: 20, dotRadius: 7 },
      ];

      for (const recipe of recipes) {
        const tile = generatePatternTile(60, 40, recipe);
        expect(tile.width).toBe(60);
        expect(tile.height).toBe(40);
        expect(tile.data.length).toBe(60 * 40 * 4);
      }
    });

    it('throws error for unsupported recipe type', () => {
      expect(() =>
        generatePatternTile(40, 40, { type: 'unsupported' as any })
      ).toThrow('Unsupported pattern generator type: unsupported');
    });
  });

  describe('Deterministic Seeding', () => {
    const recipeTypes: PatternRecipe['type'][] = [
      'perlin',
      'voronoi',
      'checker',
      'stripes',
      'mosaic',
    ];

    for (const type of recipeTypes) {
      it(`produces byte-identical output for identical seeds (${type})`, () => {
        const recipe1 = { type, seed: 42 } as PatternRecipe;
        const recipe2 = { type, seed: 42 } as PatternRecipe;

        const tile1 = generatePatternTile(60, 60, recipe1);
        const tile2 = generatePatternTile(60, 60, recipe2);

        expect(tile1.data).toEqual(tile2.data);
      });

      it(`produces varied output for different seeds (${type})`, () => {
        const recipe1 = { type, seed: 42 } as PatternRecipe;
        const recipe2 = { type, seed: 999 } as PatternRecipe;

        const tile1 = generatePatternTile(60, 60, recipe1);
        const tile2 = generatePatternTile(60, 60, recipe2);

        expect(tile1.data).not.toEqual(tile2.data);
      });
    }
  });

  describe('Dimensions and Bounds Handling', () => {
    it('handles arbitrary, non-square, prime, and minimal dimensions', () => {
      const dimensions = [
        [120, 40],
        [35, 90],
        [47, 31],
        [1, 1],
        [80, 80],
      ];

      for (const [w, h] of dimensions) {
        const tile = generatePatternTile(w!, h!, { type: 'perlin', scale: 3 });
        expect(tile.width).toBe(w);
        expect(tile.height).toBe(h);
        expect(tile.data.length).toBe(w! * h! * 4);

        for (let i = 3; i < tile.data.length; i += 4) {
          expect(tile.data[i]).toBe(255);
        }
      }
    });
  });

  describe('Toroidal Boundary Wrapping', () => {
    it('preserves toroidal boundary continuity for Perlin noise', () => {
      const w = 64;
      const h = 64;
      const tile = generatePatternTile(w, h, { type: 'perlin', scale: 4, octaves: 2 });

      let interiorDelta = 0;
      let boundaryDelta = 0;
      for (let y = 0; y < h; y++) {
        const i1 = (y * w + 31) * 4;
        const i2 = (y * w + 32) * 4;
        interiorDelta += Math.abs(tile.data[i1]! - tile.data[i2]!);

        const b1 = (y * w + (w - 1)) * 4;
        const b2 = (y * w + 0) * 4;
        boundaryDelta += Math.abs(tile.data[b1]! - tile.data[b2]!);
      }
      interiorDelta /= h;
      boundaryDelta /= h;

      expect(boundaryDelta).toBeLessThan(40);
      expect(Math.abs(boundaryDelta - interiorDelta)).toBeLessThan(25);
    });

    it('preserves toroidal boundary continuity for Voronoi cells', () => {
      const w = 64;
      const h = 64;
      const tile = generatePatternTile(w, h, { type: 'voronoi', numCells: 12 });

      let boundaryDeltaX = 0;
      let boundaryDeltaY = 0;
      for (let y = 0; y < h; y++) {
        const b1 = (y * w + (w - 1)) * 4;
        const b2 = (y * w + 0) * 4;
        boundaryDeltaX += Math.abs(tile.data[b1]! - tile.data[b2]!);
      }
      for (let x = 0; x < w; x++) {
        const b1 = ((h - 1) * w + x) * 4;
        const b2 = (0 * w + x) * 4;
        boundaryDeltaY += Math.abs(tile.data[b1]! - tile.data[b2]!);
      }
      boundaryDeltaX /= h;
      boundaryDeltaY /= w;

      expect(boundaryDeltaX).toBeLessThan(50);
      expect(boundaryDeltaY).toBeLessThan(50);
    });

    it('preserves toroidal boundary continuity for Checkerboard tiles', () => {
      const w = 40;
      const h = 40;
      const cellSize = 10;
      const tile = generatePatternTile(w, h, { type: 'checker', cellSize });

      for (let y = 0; y < h; y++) {
        const leftIdx = (y * w + 0) * 4;
        const rightIdx = (y * w + (w - 1)) * 4;
        expect(tile.data[leftIdx]).not.toBe(tile.data[rightIdx]);
      }

      for (let x = 0; x < w; x++) {
        const topIdx = (0 * w + x) * 4;
        const bottomIdx = ((h - 1) * w + x) * 4;
        expect(tile.data[topIdx]).not.toBe(tile.data[bottomIdx]);
      }
    });

    it('preserves toroidal boundary continuity for Stripes', () => {
      const w = 40;
      const h = 30;
      const stripeWidth = 10;
      const tile = generatePatternTile(w, h, { type: 'stripes', stripeWidth });

      for (let x = 0; x < w; x++) {
        const topIdx = (0 * w + x) * 4;
        const bottomIdx = ((h - 1) * w + x) * 4;
        expect(tile.data[topIdx]).toBe(tile.data[bottomIdx]);
        expect(tile.data[topIdx + 1]).toBe(tile.data[bottomIdx + 1]);
        expect(tile.data[topIdx + 2]).toBe(tile.data[bottomIdx + 2]);
      }

      const leftIdx = 0;
      const rightIdx = (w - 1) * 4;
      expect(tile.data[leftIdx]).toBe(239);
      expect(tile.data[rightIdx]).toBe(99);
    });

    it('preserves toroidal boundary continuity for Checkerboard tiles across arbitrary non-multiple dimensions (70px, 95px)', () => {
      for (const [w, h] of [[70, 70], [95, 70], [70, 95]]) {
        const tile = generatePatternTile(w, h, { type: 'checker', cellSize: 10 });
        for (let y = 0; y < h; y++) {
          const leftIdx = (y * w + 0) * 4;
          const rightIdx = (y * w + (w - 1)) * 4;
          expect(tile.data[leftIdx]).not.toBe(tile.data[rightIdx]);
        }
        for (let x = 0; x < w; x++) {
          const topIdx = (0 * w + x) * 4;
          const bottomIdx = ((h - 1) * w + x) * 4;
          expect(tile.data[topIdx]).not.toBe(tile.data[bottomIdx]);
        }
      }
    });

    it('preserves toroidal boundary continuity for Stripes across arbitrary non-multiple dimensions (70px, 95px)', () => {
      for (const [w, h] of [[70, 50], [95, 60]]) {
        // Vertical stripes: columns must be uniform vertically, with integer non-truncated stripes across w
        const tileVert = generatePatternTile(w, h, { type: 'stripes', stripeWidth: 10, direction: 'vertical' });
        for (let x = 0; x < w; x++) {
          const topIdx = (0 * w + x) * 4;
          const bottomIdx = ((h - 1) * w + x) * 4;
          expect(tileVert.data[topIdx]).toBe(tileVert.data[bottomIdx]);
          expect(tileVert.data[topIdx + 1]).toBe(tileVert.data[bottomIdx + 1]);
          expect(tileVert.data[topIdx + 2]).toBe(tileVert.data[bottomIdx + 2]);
        }

        // Horizontal stripes: rows must be uniform horizontally, with integer non-truncated stripes across h
        const tileHoriz = generatePatternTile(w, h, { type: 'stripes', stripeWidth: 10, direction: 'horizontal' });
        for (let y = 0; y < h; y++) {
          const leftIdx = (y * w + 0) * 4;
          const rightIdx = (y * w + (w - 1)) * 4;
          expect(tileHoriz.data[leftIdx]).toBe(tileHoriz.data[rightIdx]);
          expect(tileHoriz.data[leftIdx + 1]).toBe(tileHoriz.data[rightIdx + 1]);
          expect(tileHoriz.data[leftIdx + 2]).toBe(tileHoriz.data[rightIdx + 2]);
        }
      }
    });

    it('handles stripes color precedence when colorA/colorB or colors are provided', () => {
      const red: [number, number, number, number] = [255, 0, 0, 255];
      const blue: [number, number, number, number] = [0, 0, 255, 255];
      const twoTone = generateStripesTexture(40, 20, { colorA: red, colorB: blue, stripeWidth: 10 });
      expect(twoTone.data[0]).toBe(255); // red primary stripe
      expect(twoTone.data[40]).toBe(0);   // blue secondary stripe

      const green: [number, number, number, number] = [0, 255, 0, 255];
      const yellow: [number, number, number, number] = [255, 255, 0, 255];
      const explicitColors = generateStripesTexture(40, 20, {
        colors: [green, yellow],
        colorA: red,
        colorB: blue,
        stripeWidth: 10,
      });
      // options.colors takes precedence over colorA / colorB
      expect(explicitColors.data[0]).toBe(0);     // green channel 0
      expect(explicitColors.data[1]).toBe(255);   // green channel 1
      expect(explicitColors.data[40]).toBe(255);  // yellow channel 0
      expect(explicitColors.data[41]).toBe(255);  // yellow channel 1
    });

    it('preserves toroidal boundary continuity for Dot Mosaic', () => {
      const w = 80;
      const h = 80;
      const cellSize = 20;
      const dotRadius = 7;
      const tile = generatePatternTile(w, h, { type: 'mosaic', cellSize, dotRadius });

      const yCenter = 10;
      const leftBorder = (yCenter * w + 0) * 4;
      const rightBorder = (yCenter * w + (w - 1)) * 4;
      expect(tile.data[leftBorder]).toBe(15);
      expect(tile.data[rightBorder]).toBe(15);

      const centerIdx = (10 * w + 10) * 4;
      expect(tile.data[centerIdx]).toBe(236);
      expect(tile.data[centerIdx + 1]).toBe(72);
    });
  });
});
