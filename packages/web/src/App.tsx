import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  generateSirds,
  generateTexturedStereogram,
  createPrimitiveDepthMap,
  applyGaussianBlur,
  applyBevel,
  rasterizeText,
  createCheckerboardPattern,
  getDefaultPatternSeparation,
  type DepthMap,
  type RgbaImage,
  type ConvergenceMode,
  type DepthPrimitive,
} from '@stereogramer/core';

type GeneratorMode = 'sirds' | 'textured';
type DepthSource = 'primitive' | 'text' | 'upload';

interface UploadedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  thumbUrl: string;
  filename: string;
}

export const App: React.FC = () => {
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode>('textured');
  const [depthSource, setDepthSource] = useState<DepthSource>('primitive');
  const [primitive, setPrimitive] = useState<DepthPrimitive>('sphere');
  const [extrudedText, setExtrudedText] = useState<string>('3D MAGIC');
  const [textFontSize, setTextFontSize] = useState<number>(72);
  const [bevel, setBevel] = useState<number>(0);
  const [blur, setBlur] = useState<number>(0);
  const [invertDepth, setInvertDepth] = useState<boolean>(false);

  const [customDepth, setCustomDepth] = useState<UploadedImage | null>(null);
  const [customPattern, setCustomPattern] = useState<UploadedImage | null>(null);
  const [patternPreset, setPatternPreset] = useState<'geometric' | 'mosaic' | 'stripes'>('geometric');

  const [convergenceMode, setConvergenceMode] = useState<ConvergenceMode>('parallel');
  const [separation, setSeparation] = useState<number>(80);
  const [depthFactor, setDepthFactor] = useState<number>(0.85);
  const [hsr, setHsr] = useState<boolean>(true);
  const [dotScale, setDotScale] = useState<number>(1);
  const [showGuideDots, setShowGuideDots] = useState<boolean>(true);
  const [showPreviews, setShowPreviews] = useState<boolean>(true);
  const [seed, setSeed] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const width = 640;
  const height = 480;

  // Preset patterns generated via pure typed arrays
  const presetPattern = useMemo<RgbaImage>(() => {
    const patW = 80;
    const patH = 60;
    if (patternPreset === 'geometric') {
      return createCheckerboardPattern(patW, patH, 10, [56, 189, 248, 255], [30, 41, 59, 255]);
    } else if (patternPreset === 'stripes') {
      const data = new Uint8ClampedArray(patW * patH * 4);
      for (let y = 0; y < patH; y++) {
        for (let x = 0; x < patW; x++) {
          const idx = (y * patW + x) * 4;
          const band = Math.floor(x / 10) % 4;
          if (band === 0) {
            data[idx] = 239; data[idx + 1] = 68; data[idx + 2] = 68; data[idx + 3] = 255;
          } else if (band === 1) {
            data[idx] = 245; data[idx + 1] = 158; data[idx + 2] = 11; data[idx + 3] = 255;
          } else if (band === 2) {
            data[idx] = 16; data[idx + 1] = 185; data[idx + 2] = 129; data[idx + 3] = 255;
          } else {
            data[idx] = 99; data[idx + 1] = 102; data[idx + 2] = 241; data[idx + 3] = 255;
          }
        }
      }
      return { width: patW, height: patH, data };
    } else {
      // Mosaic circles / dots
      const data = new Uint8ClampedArray(patW * patH * 4);
      for (let y = 0; y < patH; y++) {
        for (let x = 0; x < patW; x++) {
          const idx = (y * patW + x) * 4;
          const cx = (x % 20) - 10;
          const cy = (y % 20) - 10;
          const dist = Math.sqrt(cx * cx + cy * cy);
          if (dist < 7) {
            data[idx] = 236; data[idx + 1] = 72; data[idx + 2] = 153; data[idx + 3] = 255;
          } else {
            data[idx] = 15; data[idx + 1] = 23; data[idx + 2] = 42; data[idx + 3] = 255;
          }
        }
      }
      return { width: patW, height: patH, data };
    }
  }, [patternPreset]);

  // Handle image upload from file or drop
  const processImageFile = (
    file: File,
    callback: (img: UploadedImage) => void,
    targetDimensions?: { width: number; height: number }
  ) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const targetW = targetDimensions ? targetDimensions.width : img.naturalWidth || img.width;
        const targetH = targetDimensions ? targetDimensions.height : img.naturalHeight || img.height;
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const thumbUrl = c.toDataURL('image/png');

        callback({
          width: targetW,
          height: targetH,
          data: imgData.data,
          thumbUrl,
          filename: file.name,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDepthDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file, (img) => {
        setCustomDepth(img);
        setDepthSource('upload');
      }, { width, height });
    }
  };

  const handleDepthInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, (img) => {
        setCustomDepth(img);
        setDepthSource('upload');
      }, { width, height });
    }
  };

  const handlePatternDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file, (img) => setCustomPattern(img));
    }
  };

  const handlePatternInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, (img) => setCustomPattern(img));
    }
  };

  useEffect(() => {
    // 1. Resolve Depth Map
    let depthMap: DepthMap;
    if (depthSource === 'upload' && customDepth) {
      const floatData = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const r = customDepth.data[i * 4]!;
        const g = customDepth.data[i * 4 + 1]!;
        const b = customDepth.data[i * 4 + 2]!;
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
        if (invertDepth) lum = 1.0 - lum;
        floatData[i] = lum;
      }
      depthMap = { width, height, data: floatData };
    } else if (depthSource === 'text') {
      depthMap = rasterizeText(extrudedText || '3D', width, height, {
        fontSize: textFontSize,
        fontWeight: 'bold',
      });
    } else {
      depthMap = createPrimitiveDepthMap(primitive, width, height);
    }

    // Apply continuous bevel extrusion
    if (bevel > 0) {
      depthMap = applyBevel(depthMap, bevel);
    }

    // Apply separable Gaussian blur
    if (blur > 0) {
      depthMap = applyGaussianBlur(depthMap, blur);
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

    // 3. Render Pattern Preview (when in Textured SIS mode)
    const activePattern: RgbaImage = customPattern
      ? { width: customPattern.width, height: customPattern.height, data: customPattern.data }
      : presetPattern;

    if (patternCanvasRef.current && generatorMode === 'textured') {
      const pCanvas = patternCanvasRef.current;
      pCanvas.width = activePattern.width;
      pCanvas.height = activePattern.height;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        const pImgData = pCtx.createImageData(activePattern.width, activePattern.height);
        pImgData.data.set(activePattern.data);
        pCtx.putImageData(pImgData, 0, 0);
      }
    }

    // 4. Render Autostereogram
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        let result: RgbaImage;

        if (generatorMode === 'textured') {
          result = generateTexturedStereogram(depthMap, activePattern, {
            convergenceMode,
            patternSeparation: separation,
            depthFactor,
            hsr,
          });
        } else {
          // SIRDS with deterministic PRNG
          let currentSeed = seed * 10007;
          const prng = () => {
            currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
            return currentSeed / 4294967296;
          };

          result = generateSirds(depthMap, {
            convergenceMode,
            patternSeparation: separation,
            depthFactor,
            hsr,
            dotScale,
            random: prng,
          });
        }

        const imgData = ctx.createImageData(width, height);
        imgData.data.set(result.data);
        ctx.putImageData(imgData, 0, 0);
      }
    }
  }, [
    generatorMode,
    depthSource,
    primitive,
    extrudedText,
    textFontSize,
    bevel,
    blur,
    invertDepth,
    customDepth,
    customPattern,
    patternPreset,
    presetPattern,
    convergenceMode,
    separation,
    depthFactor,
    hsr,
    dotScale,
    showGuideDots,
    seed,
  ]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = generatorMode === 'textured' ? 'textured-stereogram.png' : 'sirds-stereogram.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const maxDisparityCeiling = Math.floor(separation / 3);
  const effectiveMaxDisparity = Math.floor(maxDisparityCeiling * depthFactor);

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-title">
          <div className="logo-badge">3D</div>
          <h1>Stereogramer Studio</h1>
        </div>
        <div className="header-subtitle">
          Interactive SIRDS & Textured SIS Autostereogram Engine
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          {/* Generator Mode Switch */}
          <div className="control-group">
            <label>Stereogram Type</label>
            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${generatorMode === 'textured' ? 'active' : ''}`}
                onClick={() => setGeneratorMode('textured')}
              >
                Textured SIS
              </button>
              <button
                type="button"
                className={`mode-tab ${generatorMode === 'sirds' ? 'active' : ''}`}
                onClick={() => setGeneratorMode('sirds')}
              >
                Random Dots (SIRDS)
              </button>
            </div>
          </div>

          {/* Depth Map Source Tabs */}
          <div className="control-group">
            <label>Depth Map Source</label>
            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${depthSource === 'primitive' ? 'active' : ''}`}
                onClick={() => setDepthSource('primitive')}
              >
                3D Shapes
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'text' ? 'active' : ''}`}
                onClick={() => setDepthSource('text')}
              >
                3D Text
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'upload' ? 'active' : ''}`}
                onClick={() => setDepthSource('upload')}
              >
                Upload
              </button>
            </div>
          </div>

          {/* Procedural 3D Primitive Controls */}
          {depthSource === 'primitive' && (
            <div className="control-group">
              <label htmlFor="primitive-select">3D Geometry Primitive</label>
              <select
                id="primitive-select"
                value={primitive}
                onChange={(e) => setPrimitive(e.target.value as DepthPrimitive)}
              >
                <option value="sphere">Sphere (Smooth 3D Dome)</option>
                <option value="torus">Torus (Donut Ring)</option>
                <option value="cone">Cone (Linear Apex)</option>
                <option value="cylinder">Cylinder (Rounded Column)</option>
                <option value="pyramid">Pyramid (4-Sided Facets)</option>
                <option value="heart">Heart (Puffy 3D Cardioid)</option>
                <option value="slanted">Slanted Plane (Depth Ramp)</option>
                <option value="box">Cube / Box (Elevated Plateau)</option>
              </select>
            </div>
          )}

          {/* 3D Extruded Text Controls */}
          {depthSource === 'text' && (
            <>
              <div className="control-group">
                <label htmlFor="text-input">Extruded Text</label>
                <input
                  id="text-input"
                  type="text"
                  value={extrudedText}
                  onChange={(e) => setExtrudedText(e.target.value)}
                  placeholder="Enter text..."
                />
              </div>
              <div className="control-group">
                <label htmlFor="font-size-range">
                  Font Size
                  <span className="val">{textFontSize}px</span>
                </label>
                <input
                  id="font-size-range"
                  type="range"
                  min="24"
                  max="140"
                  step="2"
                  value={textFontSize}
                  onChange={(e) => setTextFontSize(parseInt(e.target.value, 10))}
                />
              </div>
            </>
          )}

          {/* Upload Depth Map Controls */}
          {depthSource === 'upload' && (
            <div className="control-group">
              {customDepth ? (
                <div className="dropzone-loaded">
                  <div className="dropzone-thumb-wrapper">
                    <img src={customDepth.thumbUrl} alt="Depth map" className="dropzone-thumb" />
                    <div className="dropzone-file-info">
                      <span className="dropzone-filename">{customDepth.filename}</span>
                      <span className="dropzone-dim">{customDepth.width} × {customDepth.height}</span>
                    </div>
                  </div>
                  <button
                    className="btn-icon-clear"
                    title="Remove uploaded depth map"
                    onClick={() => setCustomDepth(null)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDepthDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleDepthInput}
                    title="Upload depth map image"
                  />
                  <div className="dropzone-content">
                    <span className="dropzone-icon">⇪</span>
                    <span className="dropzone-title">Upload Depth Map</span>
                    <span className="dropzone-subtitle">Drop PNG/JPEG or click to browse</span>
                  </div>
                </div>
              )}
              {customDepth && (
                <label className="checkbox-label" style={{ marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={invertDepth}
                    onChange={(e) => setInvertDepth(e.target.checked)}
                  />
                  Invert Depth Polarity
                </label>
              )}
            </div>
          )}

          {/* Depth Smoothing & Edge Shaping Controls */}
          <div className="control-group">
            <label htmlFor="bevel-range">
              Bevel Extrusion
              <span className="val">{bevel}px</span>
            </label>
            <input
              id="bevel-range"
              type="range"
              min="0"
              max="20"
              step="1"
              value={bevel}
              onChange={(e) => setBevel(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="blur-range">
              Gaussian Blur
              <span className="val">{blur.toFixed(1)}px</span>
            </label>
            <input
              id="blur-range"
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={blur}
              onChange={(e) => setBlur(parseFloat(e.target.value))}
            />
          </div>

          {/* Pattern Texture Source Section (for Textured SIS) */}
          {generatorMode === 'textured' && (
            <div className="control-group">
              <label>Pattern Texture</label>
              {customPattern ? (
                <div className="dropzone-loaded">
                  <div className="dropzone-thumb-wrapper">
                    <img src={customPattern.thumbUrl} alt="Pattern texture" className="dropzone-thumb" />
                    <div className="dropzone-file-info">
                      <span className="dropzone-filename">{customPattern.filename}</span>
                      <span className="dropzone-dim">{customPattern.width} × {customPattern.height}</span>
                    </div>
                  </div>
                  <button
                    className="btn-icon-clear"
                    title="Remove custom pattern"
                    onClick={() => setCustomPattern(null)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <select
                    value={patternPreset}
                    onChange={(e) => setPatternPreset(e.target.value as any)}
                  >
                    <option value="geometric">Preset: Geometric Tiles</option>
                    <option value="stripes">Preset: Color Stripes</option>
                    <option value="mosaic">Preset: Dot Mosaic</option>
                  </select>

                  <div
                    className="dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handlePatternDrop}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePatternInput}
                      title="Upload pattern image"
                    />
                    <div className="dropzone-content">
                      <span className="dropzone-icon">⇪</span>
                      <span className="dropzone-title">Upload Pattern Texture</span>
                      <span className="dropzone-subtitle">Drop seamless pattern image</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Viewing & Convergence Controls */}
          <div className="control-group">
            <label>Convergence Mode</label>
            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${convergenceMode === 'parallel' ? 'active' : ''}`}
                onClick={() => setConvergenceMode('parallel')}
              >
                Parallel
              </button>
              <button
                type="button"
                className={`mode-tab ${convergenceMode === 'cross' ? 'active' : ''}`}
                onClick={() => setConvergenceMode('cross')}
              >
                Cross-eyed
              </button>
            </div>
          </div>

          {/* Separation Slider */}
          <div className="control-group">
            <label htmlFor="separation-range">
              Pattern Separation
              <span className="val">{separation}px</span>
            </label>
            <input
              id="separation-range"
              type="range"
              min="40"
              max="160"
              step="2"
              value={separation}
              onChange={(e) => setSeparation(parseInt(e.target.value, 10))}
            />
          </div>

          {/* Depth Factor Slider */}
          <div className="control-group">
            <label htmlFor="depth-factor-range">
              Relief Depth Factor
              <span className="val">{(depthFactor * 100).toFixed(0)}%</span>
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

          {/* Disparity Ceiling Display */}
          <div className="disparity-callout">
            <div className="disparity-label">
              <span>Max Disparity Ceiling (S/3):</span>
              <span className="disparity-value">{effectiveMaxDisparity}px</span>
            </div>
            <div className="disparity-subtext">
              Strictly clamped to &le; {maxDisparityCeiling}px (33.3% of S) to prevent visual fusion strain
            </div>
          </div>

          {/* SIRDS Dot Scale */}
          {generatorMode === 'sirds' && (
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
          )}

          {/* Toggles */}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hsr}
              onChange={(e) => setHsr(e.target.checked)}
            />
            Hidden Surface Removal (HSR)
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showGuideDots}
              onChange={(e) => setShowGuideDots(e.target.checked)}
            />
            Show Guide Dots ({separation}px spacing)
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showPreviews}
              onChange={(e) => setShowPreviews(e.target.checked)}
            />
            Show Reference Previews
          </label>

          {generatorMode === 'sirds' && (
            <button className="btn-secondary" onClick={() => setSeed((s) => s + 1)}>
              Re-roll Random Dots
            </button>
          )}

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

          {showPreviews && (
            <div className="previews-row">
              <div className="preview-card">
                <span className="preview-card-title">Depth Map</span>
                <canvas
                  ref={depthCanvasRef}
                  className="preview-canvas"
                  style={{ width: width / 4, height: height / 4 }}
                />
              </div>

              {generatorMode === 'textured' && (
                <div className="preview-card">
                  <span className="preview-card-title">Pattern Tile</span>
                  <canvas
                    ref={patternCanvasRef}
                    className="preview-canvas"
                    style={{ width: width / 4, height: height / 4, objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
