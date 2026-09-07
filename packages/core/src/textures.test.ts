import { describe, it, expect } from 'vitest';
import {
  resolveSirdsPalette,
  SIRDS_PALETTES,
  generatePerlinTexture,
  generateVoronoiTexture,
  generateCheckerboardTexture,
  generateSirds,
  createSphereDepthMap,
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
  });
});
