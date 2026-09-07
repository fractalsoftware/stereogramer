import { describe, it, expect } from 'vitest';
import {
  createDepthMap,
  createSphereDepthMap,
  createTorusDepthMap,
  createConeDepthMap,
  createCylinderDepthMap,
  createPyramidDepthMap,
  createHeartDepthMap,
  createSlantedPlaneDepthMap,
  createBoxDepthMap,
  createPrimitiveDepthMap,
  applyGaussianBlur,
  applyBevel,
  rasterizeText,
  rasterizeSvgPath,
  generateSirds,
  generateTexturedStereogram,
  createCheckerboardPattern,
} from './index.js';

describe('Procedural 3D Primitives & Depth Generators', () => {
  const width = 120;
  const height = 80;

  it('generates a valid Torus depth map with donut hole and ring peak', () => {
    const torus = createTorusDepthMap(width, height);
    expect(torus.width).toBe(width);
    expect(torus.height).toBe(height);

    const cx = width / 2;
    const cy = height / 2;
    const centerIndex = cy * width + cx;
    // Donut hole at the center must be background (0.0)
    expect(torus.data[centerIndex]).toBeCloseTo(0.0, 2);

    // Points on the ring radius must reach near peak (1.0)
    let maxVal = 0;
    for (let i = 0; i < torus.data.length; i++) {
      if (torus.data[i]! > maxVal) maxVal = torus.data[i]!;
    }
    expect(maxVal).toBeGreaterThan(0.95);
  });

  it('generates a valid Cone depth map peaking at the apex', () => {
    const cone = createConeDepthMap(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const apexIndex = cy * width + cx;

    // Peak at apex
    expect(cone.data[apexIndex]).toBeCloseTo(1.0, 2);

    // Outer corner must be background
    expect(cone.data[0]).toBe(0.0);
  });

  it('generates a valid Cylinder depth map with rounded barrel or column elevation', () => {
    const cyl = createCylinderDepthMap(width, height, { orientation: 'vertical' });
    const cx = width / 2;
    const cy = height / 2;

    // Along vertical center spine, elevation is peak (1.0)
    expect(cyl.data[cy * width + cx]).toBeCloseTo(1.0, 2);
    expect(cyl.data[(cy - 10) * width + cx]).toBeCloseTo(1.0, 2);

    // Beyond radius, background is 0.0
    expect(cyl.data[cy * width + 5]).toBe(0.0);
  });

  it('generates a valid 4-sided Pyramid depth map with linear facets', () => {
    const pyr = createPyramidDepthMap(width, height);
    const cx = width / 2;
    const cy = height / 2;

    // Peak at apex
    expect(pyr.data[cy * width + cx]).toBeCloseTo(1.0, 2);

    // Midpoint along side should be around 0.5
    const midX = Math.round(cx + Math.min(width, height) * 0.35 * 0.5);
    expect(pyr.data[cy * width + midX]).toBeCloseTo(0.5, 1);
  });

  it('generates a valid 3D Heart depth map with symmetric lobes', () => {
    const heart = createHeartDepthMap(width, height);
    const cx = width / 2;
    const cy = Math.round(height / 2 - Math.min(width, height) * 0.03);

    // Left and right lobes must have mirror horizontal symmetry
    for (let dx = 1; dx < 20; dx++) {
      const leftPixel = heart.data[cy * width + (cx - dx)]!;
      const rightPixel = heart.data[cy * width + (cx + dx)]!;
      expect(leftPixel).toBeCloseTo(rightPixel, 3);
    }

    // Must have non-zero volume
    let nonZeroCount = 0;
    for (let i = 0; i < heart.data.length; i++) {
      if (heart.data[i]! > 0) nonZeroCount++;
    }
    expect(nonZeroCount).toBeGreaterThan(500);
  });

  it('creates depth maps correctly via createPrimitiveDepthMap factory', () => {
    const primitives = [
      'sphere',
      'torus',
      'cone',
      'cylinder',
      'pyramid',
      'heart',
      'slanted',
      'box',
    ] as const;

    for (const prim of primitives) {
      const map = createPrimitiveDepthMap(prim, 60, 40);
      expect(map.width).toBe(60);
      expect(map.height).toBe(40);
      expect(map.data.length).toBe(60 * 40);

      // Verify that values are normalized in [0, 1]
      for (let i = 0; i < map.data.length; i++) {
        expect(map.data[i]).toBeGreaterThanOrEqual(0.0);
        expect(map.data[i]).toBeLessThanOrEqual(1.0);
      }
    }
  });
});

describe('Separable Gaussian Blur Filter', () => {
  it('softens sharp step cliffs and preserves boundaries', () => {
    const width = 80;
    const height = 40;
    const box = createBoxDepthMap(width, height, { boxWidth: 30, boxHeight: 20, boxDepth: 1.0 });

    const blurred = applyGaussianBlur(box, 3);
    expect(blurred.width).toBe(width);
    expect(blurred.height).toBe(height);

    // At the sharp edge of the box, unblurred jumped abruptly from 0 to 1
    // Blurred should have intermediate values forming a smooth ramp
    const cx = width / 2;
    const edgeX = cx - 15; // Box left edge

    const valJustOutside = blurred.data[20 * width + (edgeX - 2)]!;
    const valAtEdge = blurred.data[20 * width + edgeX]!;
    const valJustInside = blurred.data[20 * width + (edgeX + 2)]!;

    expect(valJustOutside).toBeGreaterThan(0.0);
    expect(valJustOutside).toBeLessThan(valAtEdge);
    expect(valAtEdge).toBeLessThan(valJustInside);
    expect(valJustInside).toBeLessThanOrEqual(1.0);
  });

  it('returns an identical clone when radius is 0 or negative', () => {
    const box = createBoxDepthMap(50, 50);
    const unchanged = applyGaussianBlur(box, 0);
    for (let i = 0; i < box.data.length; i++) {
      expect(unchanged.data[i]).toBe(box.data[i]);
    }
  });
});

describe('Continuous Bevel Extrusion', () => {
  it('creates beveled chamfer slopes on flat silhouettes', () => {
    const width = 80;
    const height = 60;
    const box = createBoxDepthMap(width, height, { boxWidth: 40, boxHeight: 30, boxDepth: 1.0 });

    const beveled = applyBevel(box, 5);
    expect(beveled.width).toBe(width);
    expect(beveled.height).toBe(height);

    const startX = Math.round((width - 40) / 2);
    const midY = 30;

    // At the outer edge of the box (startX), bevel factor should be small
    const edgeVal = beveled.data[midY * width + startX]!;
    // Inward by 2 pixels
    const slopeVal = beveled.data[midY * width + (startX + 2)]!;
    // Deep inside (e.g. +10 pixels), bevel factor reaches full 1.0
    const innerVal = beveled.data[midY * width + (startX + 10)]!;

    expect(edgeVal).toBeGreaterThan(0.0);
    expect(edgeVal).toBeLessThan(slopeVal);
    expect(slopeVal).toBeLessThan(innerVal);
    expect(innerVal).toBeCloseTo(1.0, 2);
  });

  it('returns a clone when bevelWidth is 0 or negative', () => {
    const box = createBoxDepthMap(40, 40);
    const untouched = applyBevel(box, 0);
    for (let i = 0; i < box.data.length; i++) {
      expect(untouched.data[i]).toBe(box.data[i]);
    }
  });
});

describe('Text & SVG Rasterization', () => {
  it('rasterizes text strings into a 2D depth map', () => {
    const width = 120;
    const height = 50;
    const textMap = rasterizeText('3D', width, height, { fontSize: 24, peakDepth: 0.9 });

    expect(textMap.width).toBe(width);
    expect(textMap.height).toBe(height);

    let nonZeroCount = 0;
    for (let i = 0; i < textMap.data.length; i++) {
      if (textMap.data[i]! > 0) nonZeroCount++;
    }
    expect(nonZeroCount).toBeGreaterThan(50);
  });

  it('rasterizes SVG path strings into a 2D depth map', () => {
    const width = 80;
    const height = 80;
    // Simple triangular polygon SVG path
    const triangleSvg = 'M 40 15 L 65 65 L 15 65 Z';
    const svgMap = rasterizeSvgPath(triangleSvg, width, height, { peakDepth: 0.85 });

    expect(svgMap.width).toBe(width);
    expect(svgMap.height).toBe(height);

    // Triangle centroid around (40, 48) must be filled
    expect(svgMap.data[48 * width + 40]).toBeCloseTo(0.85, 2);
    // Corner (5, 5) must be background (0.0)
    expect(svgMap.data[5 * width + 5]).toBe(0.0);
  });

  it('generates valid SIRDS and Textured SIS from procedural and rasterized depth maps', () => {
    const torus = createTorusDepthMap(120, 60);
    const beveled = applyBevel(torus, 3);
    const smoothed = applyGaussianBlur(beveled, 1.5);

    const sirds = generateSirds(smoothed, { patternSeparation: 25 });
    expect(sirds.width).toBe(120);
    expect(sirds.height).toBe(60);

    const pattern = createCheckerboardPattern(25, 20);
    const textured = generateTexturedStereogram(smoothed, pattern, { patternSeparation: 25 });
    expect(textured.width).toBe(120);
    expect(textured.height).toBe(60);
  });
});
