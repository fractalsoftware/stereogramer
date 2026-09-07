import React, { useState, useEffect, useRef } from 'react';
import {
  generateSirds,
  createSphereDepthMap,
  createBoxDepthMap,
  createSlantedPlaneDepthMap,
  type DepthMap,
  type ConvergenceMode,
} from '@stereogramer/core';

export const App: React.FC = () => {
  const [shape, setShape] = useState<'sphere' | 'box' | 'slanted'>('sphere');
  const [convergenceMode, setConvergenceMode] = useState<ConvergenceMode>('parallel');
  const [separation, setSeparation] = useState<number>(90);
  const [depthFactor, setDepthFactor] = useState<number>(0.8);
  const [dotScale, setDotScale] = useState<number>(1);
  const [showGuideDots, setShowGuideDots] = useState<boolean>(true);
  const [showDepthPreview, setShowDepthPreview] = useState<boolean>(true);
  const [seed, setSeed] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const width = 640;
  const height = 480;

  useEffect(() => {
    // 1. Generate Depth Map
    let depthMap: DepthMap;
    if (shape === 'box') {
      depthMap = createBoxDepthMap(width, height, { boxWidth: 260, boxHeight: 200, boxDepth: 0.85 });
    } else if (shape === 'slanted') {
      depthMap = createSlantedPlaneDepthMap(width, height, { minDepth: 0.1, maxDepth: 0.9 });
    } else {
      depthMap = createSphereDepthMap(width, height, { radius: 150, peakDepth: 0.95, backgroundDepth: 0.05 });
    }

    // 2. Render Depth Map Preview
    if (depthCanvasRef.current) {
      const dCanvas = depthCanvasRef.current;
      dCanvas.width = width;
      dCanvas.height = height;
      const dCtx = dCanvas.getContext('2d');
      if (dCtx) {
        const imgData = dCtx.createImageData(width, height);
        for (let i = 0; i < depthMap.data.length; i++) {
          const val = Math.round(depthMap.data[i]! * 255);
          const offset = i * 4;
          imgData.data[offset] = val;
          imgData.data[offset + 1] = val;
          imgData.data[offset + 2] = val;
          imgData.data[offset + 3] = 255;
        }
        dCtx.putImageData(imgData, 0, 0);
      }
    }

    // 3. Render Autostereogram (SIRDS)
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Use custom PRNG seeded with current seed
        let currentSeed = seed * 10007;
        const prng = () => {
          currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
          return currentSeed / 4294967296;
        };

        const sirds = generateSirds(depthMap, {
          convergenceMode,
          patternSeparation: separation,
          depthFactor,
          dotScale,
          random: prng,
        });

        const imgData = ctx.createImageData(sirds.width, sirds.height);
        imgData.data.set(sirds.data);
        ctx.putImageData(imgData, 0, 0);
      }
    }
  }, [shape, convergenceMode, separation, depthFactor, dotScale, seed]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `sirds-${shape}-${convergenceMode}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="app-container">
      <header>
        <div>
          <h1>Stereogramer Studio</h1>
        </div>
        <span className="badge">Single Image Random Dot Stereogram (TIW)</span>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="control-group">
            <label htmlFor="shape-select">Depth Object</label>
            <select
              id="shape-select"
              value={shape}
              onChange={(e) => setShape(e.target.value as any)}
            >
              <option value="sphere">3D Sphere</option>
              <option value="box">Floating Cube / Box</option>
              <option value="slanted">Slanted Ramp</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="mode-select">Convergence Mode</label>
            <select
              id="mode-select"
              value={convergenceMode}
              onChange={(e) => setConvergenceMode(e.target.value as ConvergenceMode)}
            >
              <option value="parallel">Parallel (Wall-eyed)</option>
              <option value="cross">Cross-eyed</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="separation-range">
              Pattern Separation
              <span className="val">{separation}px</span>
            </label>
            <input
              id="separation-range"
              type="range"
              min="50"
              max="140"
              step="2"
              value={separation}
              onChange={(e) => setSeparation(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="depth-factor-range">
              Depth Factor
              <span className="val">{depthFactor.toFixed(2)}</span>
            </label>
            <input
              id="depth-factor-range"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={depthFactor}
              onChange={(e) => setDepthFactor(parseFloat(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="dot-scale-range">
              Dot Scale
              <span className="val">{dotScale}px</span>
            </label>
            <input
              id="dot-scale-range"
              type="range"
              min="1"
              max="4"
              step="1"
              value={dotScale}
              onChange={(e) => setDotScale(parseInt(e.target.value, 10))}
            />
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showGuideDots}
              onChange={(e) => setShowGuideDots(e.target.checked)}
            />
            Show Guide Dots
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showDepthPreview}
              onChange={(e) => setShowDepthPreview(e.target.checked)}
            />
            Show Depth Map
          </label>

          <button className="btn-secondary" onClick={() => setSeed((s) => s + 1)}>
            Re-roll Random Dots
          </button>

          <button className="btn-primary" onClick={handleDownload}>
            Download Image (PNG)
          </button>
        </aside>

        <main className="viewport-container">
          <div className="canvas-wrapper" style={{ width, height }}>
            <canvas ref={canvasRef} width={width} height={height} />
            {showGuideDots && (
              <div className="guide-dots-overlay">
                <div
                  className="guide-dot"
                  style={{ transform: `translateX(-${separation / 2}px)` }}
                />
                <div
                  className="guide-dot"
                  style={{ transform: `translateX(${separation / 2}px)` }}
                />
              </div>
            )}
          </div>

          <div className="viewing-tip">
            {convergenceMode === 'parallel' ? (
              <p>
                <strong>Viewing Tip (Parallel):</strong> Relax your eyes and gaze <em>through</em> the image as if looking into the distance. Adjust your focus until the two red guide dots fuse into three dots. The hidden 3D shape will pop out.
              </p>
            ) : (
              <p>
                <strong>Viewing Tip (Cross-eyed):</strong> Cross your eyes slightly in front of the screen until the two red guide dots double and overlap into three dots. Keep your gaze locked while you perceive the 3D relief.
              </p>
            )}
          </div>

          {showDepthPreview && (
            <div className="depth-preview-container">
              <span className="depth-preview-label">Encoded Depth Map Preview</span>
              <canvas
                ref={depthCanvasRef}
                className="depth-canvas"
                style={{ width: width / 3, height: height / 3 }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
