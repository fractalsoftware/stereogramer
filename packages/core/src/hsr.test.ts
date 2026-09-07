import { describe, it, expect } from 'vitest';
import {
  calculateSeparation,
  isSurfaceVisible,
  computeScanlineConstraints,
  generateSirds,
  generateTexturedStereogram,
  type DepthMap,
  type RgbaImage,
} from './index.js';

describe('Disparity Bounding & Fusibility Invariants', () => {
  it('strictly bounds horizontal disparity to <= floor(baseSeparation / 3) across arbitrary depths and separations', () => {
    const testSeparations = [1, 2, 3, 10, 50, 70, 80, 100, 140, 200, 300, 500];
    const testDepths = [0.0, 0.01, 0.1, 0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 0.99, 1.0];
    const testFactors = [0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

    for (const baseSeparation of testSeparations) {
      const maxDisparityCeiling = Math.floor(baseSeparation / 3);

      for (const depth of testDepths) {
        for (const factor of testFactors) {
          for (const mode of ['parallel', 'cross'] as const) {
            const sep = calculateSeparation(depth, baseSeparation, factor, mode);
            const disparity = Math.abs(baseSeparation - sep);

            expect(disparity).toBeLessThanOrEqual(maxDisparityCeiling);
            expect(sep).toBeGreaterThanOrEqual(baseSeparation - maxDisparityCeiling);
            expect(sep).toBeLessThanOrEqual(baseSeparation);
          }
        }
      }
    }
  });

  it('guarantees separation equals baseSeparation at depth 0 in parallel mode and depth 1 in cross mode', () => {
    const baseSep = 100;
    expect(calculateSeparation(0.0, baseSep, 1.0, 'parallel')).toBe(baseSep);
    expect(calculateSeparation(1.0, baseSep, 1.0, 'cross')).toBe(baseSep);
  });

  it('safely handles non-finite and extreme depth and factor inputs without NaN or throw', () => {
    const baseSep = 80;
    expect(calculateSeparation(NaN, baseSep)).toBe(baseSep);
    expect(calculateSeparation(Infinity, baseSep)).toBeLessThanOrEqual(baseSep);
    expect(calculateSeparation(-Infinity, baseSep)).toBe(baseSep);
    expect(calculateSeparation(0.5, baseSep, NaN)).toBe(baseSep);
  });
});

describe('Hidden Surface Removal (HSR) Ray Occlusion', () => {
  it('confirms all points on a flat plane are completely visible (no self-occlusion)', () => {
    const width = 200;
    const baseSeparation = 50;
    const depthRow = new Float32Array(width).fill(0.5);

    for (let x = 0; x < width; x++) {
      const visible = isSurfaceVisible(x, 0.5, depthRow, width, baseSeparation, 1.0, 'parallel');
      expect(visible).toBe(true);
    }
  });

  it('detects occlusion of background points located in the shadow of a sharp foreground step', () => {
    const width = 200;
    const baseSeparation = 60;
    const depthRow = new Float32Array(width).fill(0.0);

    // Foreground plateau from x=80 to x=120 elevated to z=0.9
    for (let x = 80; x <= 120; x++) {
      depthRow[x] = 0.9;
    }

    // Points on top of the foreground plateau must be visible
    expect(isSurfaceVisible(100, 0.9, depthRow, width, baseSeparation, 1.0, 'parallel')).toBe(true);

    // Points in the background immediately to the left and right of the step are occluded
    // by the elevated foreground plateau when rays are cast towards eye positions
    const occludedLeft = isSurfaceVisible(75, 0.0, depthRow, width, baseSeparation, 1.0, 'parallel');
    const occludedRight = isSurfaceVisible(125, 0.0, depthRow, width, baseSeparation, 1.0, 'parallel');

    expect(occludedLeft).toBe(false);
    expect(occludedRight).toBe(false);

    // Points far away from the step in the background remain visible
    const farLeft = isSurfaceVisible(10, 0.0, depthRow, width, baseSeparation, 1.0, 'parallel');
    const farRight = isSurfaceVisible(190, 0.0, depthRow, width, baseSeparation, 1.0, 'parallel');
    expect(farLeft).toBe(true);
    expect(farRight).toBe(true);
  });

  it('eliminates false constraint links across sharp depth boundaries when HSR is enabled', () => {
    const width = 200;
    const baseSeparation = 60;
    const depthRow = new Float32Array(width).fill(0.0);

    // Foreground plateau in center
    for (let x = 80; x <= 120; x++) {
      depthRow[x] = 0.9;
    }

    const constraintsWithHsr = computeScanlineConstraints(depthRow, width, 0, {
      baseSeparation,
      depthFactor: 1.0,
      convergenceMode: 'parallel',
      hsr: true,
    });

    const constraintsWithoutHsr = computeScanlineConstraints(depthRow, width, 0, {
      baseSeparation,
      depthFactor: 1.0,
      convergenceMode: 'parallel',
      hsr: false,
    });

    // When HSR is active, fewer invalid/occluded constraints are created
    let linkCountHsr = 0;
    let linkCountNoHsr = 0;

    for (let x = 0; x < width; x++) {
      if (constraintsWithHsr[x] !== x) linkCountHsr++;
      if (constraintsWithoutHsr[x] !== x) linkCountNoHsr++;
    }

    // Disabling HSR allows occluded background rays to form links across the step,
    // resulting in strictly more constraint links (and visual ghosting artifacts)
    expect(linkCountHsr).toBeLessThan(linkCountNoHsr);

    // Specifically verify that an occluded background pixel is linked when HSR is off,
    // but remains unlinked across the step when HSR is on
    const occludedPixel = 45;
    expect(constraintsWithHsr[occludedPixel]).toBe(occludedPixel);
    expect(constraintsWithoutHsr[occludedPixel]).not.toBe(occludedPixel);
  });
});

describe('Full Generator Integration with HSR Flag', () => {
  const width = 160;
  const height = 40;
  const depthData = new Float32Array(width * height).fill(0.0);

  // Sharp foreground block
  for (let y = 10; y < 30; y++) {
    for (let x = 60; x < 100; x++) {
      depthData[y * width + x] = 0.95;
    }
  }

  const depthMap: DepthMap = { width, height, data: depthData };

  const pattern: RgbaImage = {
    width: 20,
    height: 20,
    data: new Uint8ClampedArray(20 * 20 * 4).fill(128),
  };
  for (let i = 0; i < 20 * 20; i++) {
    pattern.data[i * 4] = (i * 17) % 256;
    pattern.data[i * 4 + 1] = (i * 31) % 256;
    pattern.data[i * 4 + 2] = (i * 73) % 256;
    pattern.data[i * 4 + 3] = 255;
  }

  it('generates differing output images for SIRDS when HSR is enabled vs disabled on step geometry', () => {
    const makePrng = () => {
      let s = 12345;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    };

    const sirdsWithHsr = generateSirds(depthMap, {
      patternSeparation: 40,
      random: makePrng(),
      hsr: true,
    });

    const sirdsWithoutHsr = generateSirds(depthMap, {
      patternSeparation: 40,
      random: makePrng(),
      hsr: false,
    });

    expect(sirdsWithHsr.width).toBe(width);
    expect(sirdsWithHsr.height).toBe(height);
    expect(sirdsWithoutHsr.width).toBe(width);
    expect(sirdsWithoutHsr.height).toBe(height);

    let diffCount = 0;
    for (let i = 0; i < sirdsWithHsr.data.length; i += 4) {
      if (
        sirdsWithHsr.data[i] !== sirdsWithoutHsr.data[i] ||
        sirdsWithHsr.data[i + 1] !== sirdsWithoutHsr.data[i + 1] ||
        sirdsWithHsr.data[i + 2] !== sirdsWithoutHsr.data[i + 2]
      ) {
        diffCount++;
      }
    }

    expect(diffCount).toBeGreaterThan(0);
  });

  it('generates differing output images for Textured SIS when HSR is enabled vs disabled on step geometry', () => {
    const texturedWithHsr = generateTexturedStereogram(depthMap, pattern, {
      patternSeparation: 40,
      hsr: true,
    });

    const texturedWithoutHsr = generateTexturedStereogram(depthMap, pattern, {
      patternSeparation: 40,
      hsr: false,
    });

    expect(texturedWithHsr.width).toBe(width);
    expect(texturedWithoutHsr.width).toBe(width);

    let diffCount = 0;
    for (let i = 0; i < texturedWithHsr.data.length; i += 4) {
      if (
        texturedWithHsr.data[i] !== texturedWithoutHsr.data[i] ||
        texturedWithHsr.data[i + 1] !== texturedWithoutHsr.data[i + 1] ||
        texturedWithHsr.data[i + 2] !== texturedWithoutHsr.data[i + 2]
      ) {
        diffCount++;
      }
    }

    expect(diffCount).toBeGreaterThan(0);
  });
});
