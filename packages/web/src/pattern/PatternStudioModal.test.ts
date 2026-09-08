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
});
