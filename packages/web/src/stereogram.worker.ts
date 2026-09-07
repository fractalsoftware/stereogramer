import {
  generateSirds,
  generateTexturedStereogram,
  type DepthMap,
  type RgbaImage,
} from '@stereogramer/core';

export interface WorkerRequestData {
  id: number;
  mode: 'sirds' | 'textured';
  depthWidth: number;
  depthHeight: number;
  depthBuffer: ArrayBuffer;
  patternWidth?: number;
  patternHeight?: number;
  patternBuffer?: ArrayBuffer;
  options: {
    convergenceMode: 'parallel' | 'cross';
    patternSeparation: number;
    depthFactor: number;
    hsr: boolean;
    dotScale: number;
    palette?: string;
    seed: number;
  };
}

self.onmessage = (event: MessageEvent<WorkerRequestData>) => {
  const req = event.data;
  const depthData = new Float32Array(req.depthBuffer);
  const depthMap: DepthMap = {
    width: req.depthWidth,
    height: req.depthHeight,
    data: depthData,
  };

  let result: RgbaImage;

  if (req.mode === 'textured' && req.patternBuffer && req.patternWidth && req.patternHeight) {
    const patternData = new Uint8ClampedArray(req.patternBuffer);
    const pattern: RgbaImage = {
      width: req.patternWidth,
      height: req.patternHeight,
      data: patternData,
    };

    result = generateTexturedStereogram(depthMap, pattern, {
      convergenceMode: req.options.convergenceMode,
      patternSeparation: req.options.patternSeparation,
      depthFactor: req.options.depthFactor,
      hsr: req.options.hsr,
    });
  } else {
    // SIRDS with deterministic PRNG seeded from req.options.seed
    let currentSeed = (req.options.seed || 1) * 10007;
    const prng = () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      return currentSeed / 4294967296;
    };

    result = generateSirds(depthMap, {
      convergenceMode: req.options.convergenceMode,
      patternSeparation: req.options.patternSeparation,
      depthFactor: req.options.depthFactor,
      hsr: req.options.hsr,
      dotScale: req.options.dotScale,
      palette: req.options.palette as any,
      random: prng,
    });
  }

  // Transfer the output array buffer for zero-copy 60fps performance
  const transferable = result.data.buffer;
  (self as any).postMessage(
    {
      id: req.id,
      width: result.width,
      height: result.height,
      data: result.data,
    },
    [transferable]
  );
};
