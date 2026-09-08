import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createPrimitiveDepthMap,
  generateTexturedStereogram,
  generatePatternTile,
  type DepthMap,
  type ConvergenceMode,
  type RgbaImage,
  type PatternGeneratorType,
  type PatternRecipe,
  type PerlinTextureOptions,
  type VoronoiTextureOptions,
  type CheckerTextureOptions,
  type StripesTextureOptions,
  type MosaicTextureOptions,
  type RgbaColor,
} from '@stereogramer/core';

export interface PatternStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (recipe: PatternRecipe, verticalPeriod: number) => void;
  patternSeparation: number;
  initialRecipe?: PatternRecipe;
  initialVerticalPeriod?: number;
  activeDepthMap?: DepthMap | null;
  depthMap?: DepthMap | null;
  convergenceMode?: ConvergenceMode;
  depthFactor?: number;
}

export const TESTBED_WIDTH = 240;
export const TESTBED_HEIGHT = 160;

/**
 * Generates the standardized benchmark 3D floating sphere DepthMap (240×160).
 */
export function getBenchmarkSphereDepthMap(): DepthMap {
  return createPrimitiveDepthMap('sphere', TESTBED_WIDTH, TESTBED_HEIGHT);
}

/**
 * Resamples / downsamples an arbitrary source DepthMap to target dimensions
 * using smooth bilinear interpolation to preserve depth discontinuities without aliasing.
 */
export function resampleDepthMap(
  source: DepthMap,
  targetWidth: number,
  targetHeight: number
): DepthMap {
  const { width: srcW, height: srcH, data: srcData } = source;
  const targetData = new Float32Array(targetWidth * targetHeight);

  if (srcW <= 0 || srcH <= 0 || !srcData || srcData.length === 0) {
    return createPrimitiveDepthMap('sphere', targetWidth, targetHeight);
  }

  if (srcW === targetWidth && srcH === targetHeight) {
    targetData.set(srcData);
    return { width: targetWidth, height: targetHeight, data: targetData };
  }

  const xRatio = srcW / targetWidth;
  const yRatio = srcH / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const srcY = (ty + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(srcY));
    const y1 = Math.min(srcH - 1, Math.ceil(srcY));
    const dy = srcY - y0;

    const targetRowOffset = ty * targetWidth;
    const srcRowOffset0 = y0 * srcW;
    const srcRowOffset1 = y1 * srcW;

    for (let tx = 0; tx < targetWidth; tx++) {
      const srcX = (tx + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(srcX));
      const x1 = Math.min(srcW - 1, Math.ceil(srcX));
      const dx = srcX - x0;

      const v00 = srcData[srcRowOffset0 + x0] ?? 0;
      const v10 = srcData[srcRowOffset0 + x1] ?? 0;
      const v01 = srcData[srcRowOffset1 + x0] ?? 0;
      const v11 = srcData[srcRowOffset1 + x1] ?? 0;

      const top = v00 * (1 - dx) + v10 * dx;
      const bottom = v01 * (1 - dx) + v11 * dx;
      const val = top * (1 - dy) + bottom * dy;

      targetData[targetRowOffset + tx] = Math.max(0.0, Math.min(1.0, val));
    }
  }

  return { width: targetWidth, height: targetHeight, data: targetData };
}

/**
 * Calculates the scaled pattern separation for the 240×160 testbed canvas.
 */
export function calculateTestbedSeparation(
  patternSeparation: number,
  baseWidth: number = 640
): number {
  const scale = TESTBED_WIDTH / Math.max(1, baseWidth);
  return Math.max(12, Math.min(Math.floor(TESTBED_WIDTH / 2), Math.round(patternSeparation * scale)));
}

/**
 * Dynamically computes a live autostereogram for the 240×160 testbed.
 */
export function generateTestbedStereogramImage(
  depthMap: DepthMap,
  recipe: PatternRecipe,
  options: {
    patternSeparation: number;
    verticalPeriod: number;
    baseWidth?: number;
    convergenceMode?: ConvergenceMode;
    depthFactor?: number;
  }
): { stereogram: RgbaImage; testbedSeparation: number } {
  const {
    patternSeparation,
    verticalPeriod,
    baseWidth = 640,
    convergenceMode = 'parallel',
    depthFactor = 0.85,
  } = options;

  const testbedSeparation = calculateTestbedSeparation(patternSeparation, baseWidth);
  const scale = TESTBED_WIDTH / Math.max(1, baseWidth);
  const testbedVerticalPeriod = Math.max(
    12,
    Math.min(TESTBED_HEIGHT, Math.round(verticalPeriod * scale))
  );

  // Synthesize pattern tile dynamically synchronized to testbed separation (ADR 0003)
  const patternTile = generatePatternTile(
    testbedSeparation,
    testbedVerticalPeriod,
    recipe
  );

  const stereogram = generateTexturedStereogram(depthMap, patternTile, {
    convergenceMode,
    patternSeparation: testbedSeparation,
    depthFactor,
    hsr: true,
  });

  return { stereogram, testbedSeparation };
}

/**
 * Converts an [R, G, B, A] tuple to a hex color string ('#rrggbb').
 */
export function rgbaToHex(color?: RgbaColor, fallback = '#38bdf8'): string {
  if (!color || color.length < 3) return fallback;
  const r = Math.max(0, Math.min(255, Math.round(color[0]))).toString(16).padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(color[1]))).toString(16).padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(color[2]))).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Converts a hex color string ('#rgb' or '#rrggbb') to an [R, G, B, A] tuple.
 */
export function hexToRgba(hex: string, alpha = 255): RgbaColor {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const val = parseInt(cleaned, 16);
  if (isNaN(val)) return [56, 189, 248, alpha];
  const r = (val >> 16) & 255;
  const g = (val >> 8) & 255;
  const b = val & 255;
  return [r, g, b, alpha];
}

/**
 * Canonical default recipe configurations for each procedural generator.
 */
export const DEFAULT_RECIPES: Record<PatternGeneratorType, PatternRecipe> = {
  perlin: {
    type: 'perlin',
    scale: 4,
    octaves: 3,
    colorA: [56, 189, 248, 255], // Sky Cyan
    colorB: [15, 23, 42, 255],   // Dark Slate
    seed: 100,
  },
  voronoi: {
    type: 'voronoi',
    numCells: 16,
    colorA: [236, 72, 153, 255], // Pink
    colorB: [30, 41, 59, 255],   // Slate Edge
    seed: 0,
  },
  checker: {
    type: 'checker',
    cellSize: 10,
    colorA: [56, 189, 248, 255], // Sky Cyan
    colorB: [30, 41, 59, 255],   // Slate Dark
    seed: 0,
  },
  stripes: {
    type: 'stripes',
    stripeWidth: 10,
    direction: 'vertical',
    colorA: [239, 68, 68, 255],  // Red
    colorB: [59, 130, 246, 255],  // Blue
    seed: 0,
  },
  mosaic: {
    type: 'mosaic',
    cellSize: 20,
    dotRadius: 7,
    colorA: [236, 72, 153, 255], // Pink
    colorB: [15, 23, 42, 255],   // Dark Slate
    seed: 0,
  },
};

interface GeneratorMeta {
  type: PatternGeneratorType;
  label: string;
  icon: string;
  description: string;
}

const GENERATOR_METAS: GeneratorMeta[] = [
  {
    type: 'perlin',
    label: 'Perlin Noise',
    icon: '🌊',
    description: 'Fractal gradient noise with continuous harmonic octaves',
  },
  {
    type: 'voronoi',
    label: 'Voronoi Cells',
    icon: '🫧',
    description: 'Toroidal cellular tessellation with boundary proximity edges',
  },
  {
    type: 'checker',
    label: 'Checkerboard',
    icon: '🏁',
    description: 'High-contrast alternating 2D geometric lattice',
  },
  {
    type: 'stripes',
    label: 'Stripes',
    icon: '💈',
    description: 'Rhythmic vertical or horizontal color band spectrum',
  },
  {
    type: 'mosaic',
    label: 'Dot Mosaic',
    icon: '✨',
    description: 'Circular polka-dot grid with procedural size variations',
  },
];

export const PatternStudioModal: React.FC<PatternStudioModalProps> = ({
  isOpen,
  onClose,
  onApply,
  patternSeparation,
  initialRecipe,
  initialVerticalPeriod,
  activeDepthMap,
  depthMap,
  convergenceMode = 'parallel',
  depthFactor = 0.85,
}) => {
  // Active generator type
  const [activeType, setActiveType] = useState<PatternGeneratorType>(
    initialRecipe?.type ?? 'perlin'
  );

  // Per-generator recipe parameter store to preserve customization across tab switches
  const [recipes, setRecipes] = useState<Record<PatternGeneratorType, PatternRecipe>>(() => {
    const base = { ...DEFAULT_RECIPES };
    if (initialRecipe) {
      base[initialRecipe.type] = { ...initialRecipe };
    }
    return base;
  });

  // Independent vertical period (range 30 to 240 px, defaulting to separation)
  const [verticalPeriod, setVerticalPeriod] = useState<number>(
    initialVerticalPeriod ?? Math.max(30, Math.min(240, patternSeparation || 80))
  );

  // 3×3 Grid repetition viewer interactive state
  const [gridZoom, setGridZoom] = useState<number>(1.0);
  const [gridPan, setGridPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isGridDragging, setIsGridDragging] = useState<boolean>(false);
  const [showSeams, setShowSeams] = useState<boolean>(true);

  // 3D Fusibility Testbed interactive states
  const [testbedSceneMode, setTestbedSceneMode] = useState<'benchmark' | 'project'>('benchmark');
  const [showTestbedGuideDots, setShowTestbedGuideDots] = useState<boolean>(true);

  // DOM Refs
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const canvas1xRef = useRef<HTMLCanvasElement | null>(null);
  const canvas3xRef = useRef<HTMLCanvasElement | null>(null);
  const canvasTestbedRef = useRef<HTMLCanvasElement | null>(null);
  const testbedAnimFrameRef = useRef<number | null>(null);
  const testbedDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstTestbedRenderRef = useRef<boolean>(true);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number }>({
    x: 0,
    y: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialRecipe) {
        setActiveType(initialRecipe.type);
        setRecipes((prev) => ({
          ...prev,
          [initialRecipe.type]: { ...initialRecipe },
        }));
      }
      if (initialVerticalPeriod !== undefined) {
        setVerticalPeriod(Math.max(30, Math.min(240, initialVerticalPeriod)));
      } else {
        setVerticalPeriod(Math.max(30, Math.min(240, patternSeparation || 80)));
      }
      setGridZoom(1.0);
      setGridPan({ x: 0, y: 0 });
      isFirstTestbedRenderRef.current = true;
    }
  }, [isOpen, initialRecipe, initialVerticalPeriod, patternSeparation]);

  // Focus trapping and ESC key listener
  useEffect(() => {
    if (!isOpen) return;

    const previousFocusedElement = document.activeElement as HTMLElement | null;
    const dialogElement = dialogRef.current;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Auto-focus first focusable element
    if (dialogElement) {
      const focusableElements = dialogElement.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusableElements.length > 0) {
        focusableElements[0]?.focus();
      } else {
        dialogElement.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogElement) {
        const focusables = Array.from(
          dialogElement.querySelectorAll<HTMLElement>(focusableSelector)
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogElement.contains(document.activeElement)) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement || !dialogElement.contains(document.activeElement)) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusedElement?.focus();
    };
  }, [isOpen, onClose]);

  // Current active recipe
  const currentRecipe = useMemo<PatternRecipe>(() => {
    return recipes[activeType];
  }, [recipes, activeType]);

  // Dimensions: Horizontal width locked to pattern separation, height to verticalPeriod
  const tileWidth = Math.max(10, Math.round(patternSeparation || 80));
  const tileHeight = Math.max(30, Math.min(240, Math.round(verticalPeriod || 80)));

  // Procedural pattern tile synthesis
  const tile = useMemo(() => {
    if (!isOpen) return null;
    try {
      return generatePatternTile(tileWidth, tileHeight, currentRecipe);
    } catch (err) {
      console.error('Failed to generate pattern tile in Texture Studio:', err);
      return null;
    }
  }, [isOpen, tileWidth, tileHeight, currentRecipe]);

  // Render 1× pattern tile canvas
  useEffect(() => {
    const canvas = canvas1xRef.current;
    if (!canvas || !tile) return;

    canvas.width = tile.width;
    canvas.height = tile.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(tile.width, tile.height);
    imgData.data.set(tile.data);
    ctx.putImageData(imgData, 0, 0);
  }, [tile]);

  // Render 3×3 repetition grid canvas
  useEffect(() => {
    const canvas3x = canvas3xRef.current;
    const canvas1x = canvas1xRef.current;
    if (!canvas3x || !canvas1x || !tile) return;

    const w3 = tile.width * 3;
    const h3 = tile.height * 3;
    canvas3x.width = w3;
    canvas3x.height = h3;

    const ctx = canvas3x.getContext('2d');
    if (!ctx) return;

    // Draw 3x3 repetition tiles
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.drawImage(canvas1x, col * tile.width, row * tile.height);
      }
    }

    // Optional Toroidal Seamlessness inspection seam overlay
    if (showSeams) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical seam boundaries
      ctx.beginPath();
      ctx.moveTo(tile.width, 0);
      ctx.lineTo(tile.width, h3);
      ctx.moveTo(tile.width * 2, 0);
      ctx.lineTo(tile.width * 2, h3);

      // Horizontal seam boundaries
      ctx.moveTo(0, tile.height);
      ctx.lineTo(w3, tile.height);
      ctx.moveTo(0, tile.height * 2);
      ctx.lineTo(w3, tile.height * 2);
      ctx.stroke();

      ctx.restore();
    }
  }, [tile, showSeams]);

  // Testbed Depth Map resolution
  const benchmarkDepthMap = useMemo(() => getBenchmarkSphereDepthMap(), []);
  const activeProjectDepth = activeDepthMap ?? depthMap ?? null;
  const resampledProjectDepthMap = useMemo(() => {
    if (!activeProjectDepth) return null;
    return resampleDepthMap(activeProjectDepth, TESTBED_WIDTH, TESTBED_HEIGHT);
  }, [activeProjectDepth]);

  const currentTestbedDepthMap =
    testbedSceneMode === 'project' && resampledProjectDepthMap
      ? resampledProjectDepthMap
      : benchmarkDepthMap;

  const baseWidth = activeProjectDepth?.width || 640;
  const testbedSeparation = calculateTestbedSeparation(patternSeparation, baseWidth);

  // Render 3D Fusibility Mini-Stereogram testbed canvas
  useEffect(() => {
    if (!isOpen) return;

    const renderTestbed = () => {
      const canvas = canvasTestbedRef.current;
      if (!canvas) return;

      try {
        const { stereogram } = generateTestbedStereogramImage(
          currentTestbedDepthMap,
          currentRecipe,
          {
            patternSeparation,
            verticalPeriod: tileHeight,
            baseWidth,
            convergenceMode,
            depthFactor,
          }
        );

        canvas.width = stereogram.width;
        canvas.height = stereogram.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(stereogram.width, stereogram.height);
        imgData.data.set(stereogram.data);
        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.error('Failed to render 3D fusibility testbed stereogram:', err);
      }
    };

    if (testbedDebounceTimerRef.current) {
      clearTimeout(testbedDebounceTimerRef.current);
    }
    if (testbedAnimFrameRef.current) {
      cancelAnimationFrame(testbedAnimFrameRef.current);
    }

    if (isFirstTestbedRenderRef.current) {
      isFirstTestbedRenderRef.current = false;
      testbedAnimFrameRef.current = requestAnimationFrame(renderTestbed);
    } else {
      testbedDebounceTimerRef.current = setTimeout(() => {
        testbedAnimFrameRef.current = requestAnimationFrame(renderTestbed);
      }, 16);
    }

    return () => {
      if (testbedDebounceTimerRef.current) clearTimeout(testbedDebounceTimerRef.current);
      if (testbedAnimFrameRef.current) cancelAnimationFrame(testbedAnimFrameRef.current);
    };
  }, [
    isOpen,
    currentRecipe,
    tileHeight,
    patternSeparation,
    currentTestbedDepthMap,
    baseWidth,
    convergenceMode,
    depthFactor,
  ]);

  // Update specific recipe parameters for current generator
  const updateRecipe = useCallback((patch: Partial<PatternRecipe>) => {
    setRecipes((prev) => {
      const existing = prev[activeType];
      const updated = { ...existing, ...patch } as PatternRecipe;
      return {
        ...prev,
        [activeType]: updated,
      };
    });
  }, [activeType]);

  // Randomize procedural seed
  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 10000) + 1;
    updateRecipe({ seed: newSeed });
  };

  // Reset active generator to default parameters
  const handleResetDefaults = () => {
    setRecipes((prev) => ({
      ...prev,
      [activeType]: { ...DEFAULT_RECIPES[activeType] },
    }));
    setVerticalPeriod(Math.max(30, Math.min(240, patternSeparation || 80)));
  };

  // Apply pattern and commit to stereogram studio
  const handleApply = () => {
    onApply(currentRecipe, tileHeight);
    onClose();
  };

  // Pan / Drag interactions for 3×3 grid
  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsGridDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: gridPan.x,
      startPanY: gridPan.y,
    };
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (!isGridDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setGridPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handleGridMouseUp = () => {
    setIsGridDragging(false);
  };

  const handleResetGridView = () => {
    setGridZoom(1.0);
    setGridPan({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  return (
    <div
      className="pattern-studio-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pattern-studio-title"
        className="pattern-studio-dialog"
        tabIndex={-1}
      >
        {/* Header */}
        <header className="pattern-studio-header">
          <div className="pattern-studio-header-titles">
            <h2 id="pattern-studio-title" className="pattern-studio-title">
              Texture Studio
            </h2>
            <span className="pattern-studio-subtitle">
              Procedural Pattern Synthesis &amp; Toroidal Seamlessness Inspector
            </span>
          </div>
          <button
            type="button"
            className="pattern-studio-close-btn"
            onClick={onClose}
            aria-label="Close Texture Studio"
          >
            ✕
          </button>
        </header>

        {/* Modal Main Body */}
        <div className="pattern-studio-body">
          {/* Column 1: Generator Selection and Controls */}
          <div className="pattern-studio-controls-col">
            {/* Algorithm Selector */}
            <div className="control-group">
              <label className="section-label">Procedural Generator Algorithm</label>
              <div
                className="generator-selector-tabs"
                role="tablist"
                aria-label="Procedural Generator Algorithms"
              >
                {GENERATOR_METAS.map((gen) => (
                  <button
                    key={gen.type}
                    id={`generator-tab-${gen.type}`}
                    role="tab"
                    aria-selected={activeType === gen.type}
                    aria-controls={`generator-panel-${gen.type}`}
                    type="button"
                    className={`generator-tab-btn ${activeType === gen.type ? 'active' : ''}`}
                    onClick={() => setActiveType(gen.type)}
                  >
                    <span className="gen-icon">{gen.icon}</span>
                    <span className="gen-label">{gen.label}</span>
                  </button>
                ))}
              </div>
              <p className="generator-description">
                {GENERATOR_METAS.find((g) => g.type === activeType)?.description}
              </p>
            </div>

            {/* Dynamic Controls per Generator */}
            <div
              id={`generator-panel-${activeType}`}
              role="tabpanel"
              aria-labelledby={`generator-tab-${activeType}`}
              className="generator-params-container"
            >
              {/* PERLIN NOISE CONTROLS */}
              {activeType === 'perlin' && (() => {
                const p = currentRecipe as { type: 'perlin' } & PerlinTextureOptions;
                return (
                  <>
                    <div className="control-group">
                      <label htmlFor="perlin-scale-range">
                        <span>Feature Frequency / Scale</span>
                        <span className="val">{p.scale ?? 4}</span>
                      </label>
                      <input
                        id="perlin-scale-range"
                        type="range"
                        min="2"
                        max="16"
                        step="1"
                        value={p.scale ?? 4}
                        onChange={(e) => updateRecipe({ scale: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-group">
                      <label htmlFor="perlin-octaves-range">
                        <span>Harmonic Octaves</span>
                        <span className="val">{p.octaves ?? 3}</span>
                      </label>
                      <input
                        id="perlin-octaves-range"
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={p.octaves ?? 3}
                        onChange={(e) => updateRecipe({ octaves: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-row-duo">
                      <div className="control-group flex-1">
                        <label htmlFor="perlin-color-a">Foreground Color</label>
                        <div className="color-input-wrapper">
                          <input
                            id="perlin-color-a"
                            type="color"
                            value={rgbaToHex(p.colorA, '#38bdf8')}
                            onChange={(e) => updateRecipe({ colorA: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(p.colorA, '#38bdf8')}</span>
                        </div>
                      </div>

                      <div className="control-group flex-1">
                        <label htmlFor="perlin-color-b">Background Color</label>
                        <div className="color-input-wrapper">
                          <input
                            id="perlin-color-b"
                            type="color"
                            value={rgbaToHex(p.colorB, '#0f172a')}
                            onChange={(e) => updateRecipe({ colorB: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(p.colorB, '#0f172a')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* VORONOI CELLULAR CONTROLS */}
              {activeType === 'voronoi' && (() => {
                const v = currentRecipe as { type: 'voronoi' } & VoronoiTextureOptions;
                return (
                  <>
                    <div className="control-group">
                      <label htmlFor="voronoi-cells-range">
                        <span>Cell Count (Seed Centers)</span>
                        <span className="val">{v.numCells ?? 16}</span>
                      </label>
                      <input
                        id="voronoi-cells-range"
                        type="range"
                        min="4"
                        max="64"
                        step="1"
                        value={v.numCells ?? 16}
                        onChange={(e) => updateRecipe({ numCells: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-row-duo">
                      <div className="control-group flex-1">
                        <label htmlFor="voronoi-color-a">Cell Interior</label>
                        <div className="color-input-wrapper">
                          <input
                            id="voronoi-color-a"
                            type="color"
                            value={rgbaToHex(v.colorA, '#ec4899')}
                            onChange={(e) => updateRecipe({ colorA: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(v.colorA, '#ec4899')}</span>
                        </div>
                      </div>

                      <div className="control-group flex-1">
                        <label htmlFor="voronoi-color-b">Boundary Edges</label>
                        <div className="color-input-wrapper">
                          <input
                            id="voronoi-color-b"
                            type="color"
                            value={rgbaToHex(v.colorB, '#1e293b')}
                            onChange={(e) => updateRecipe({ colorB: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(v.colorB, '#1e293b')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* CHECKERBOARD CONTROLS */}
              {activeType === 'checker' && (() => {
                const c = currentRecipe as { type: 'checker' } & CheckerTextureOptions;
                return (
                  <>
                    <div className="control-group">
                      <label htmlFor="checker-cell-range">
                        <span>Cell Size (Pixels)</span>
                        <span className="val">{c.cellSize ?? 10}px</span>
                      </label>
                      <input
                        id="checker-cell-range"
                        type="range"
                        min="2"
                        max="40"
                        step="1"
                        value={c.cellSize ?? 10}
                        onChange={(e) => updateRecipe({ cellSize: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-row-duo">
                      <div className="control-group flex-1">
                        <label htmlFor="checker-color-a">Square Color A</label>
                        <div className="color-input-wrapper">
                          <input
                            id="checker-color-a"
                            type="color"
                            value={rgbaToHex(c.colorA, '#38bdf8')}
                            onChange={(e) => updateRecipe({ colorA: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(c.colorA, '#38bdf8')}</span>
                        </div>
                      </div>

                      <div className="control-group flex-1">
                        <label htmlFor="checker-color-b">Square Color B</label>
                        <div className="color-input-wrapper">
                          <input
                            id="checker-color-b"
                            type="color"
                            value={rgbaToHex(c.colorB, '#1e293b')}
                            onChange={(e) => updateRecipe({ colorB: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(c.colorB, '#1e293b')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* STRIPES CONTROLS */}
              {activeType === 'stripes' && (() => {
                const s = currentRecipe as { type: 'stripes' } & StripesTextureOptions;
                return (
                  <>
                    <div className="control-group">
                      <label htmlFor="stripes-width-range">
                        <span>Stripe Width</span>
                        <span className="val">{s.stripeWidth ?? 10}px</span>
                      </label>
                      <input
                        id="stripes-width-range"
                        type="range"
                        min="2"
                        max="40"
                        step="1"
                        value={s.stripeWidth ?? 10}
                        onChange={(e) => updateRecipe({ stripeWidth: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-group">
                      <label htmlFor="stripes-direction-select">Orientation</label>
                      <select
                        id="stripes-direction-select"
                        value={s.direction ?? 'vertical'}
                        onChange={(e) =>
                          updateRecipe({
                            direction: e.target.value as 'vertical' | 'horizontal',
                          })
                        }
                      >
                        <option value="vertical">Vertical Bands (Standard for SIS)</option>
                        <option value="horizontal">Horizontal Bands</option>
                      </select>
                    </div>

                    <div className="control-row-duo">
                      <div className="control-group flex-1">
                        <label htmlFor="stripes-color-a">Primary Stripe</label>
                        <div className="color-input-wrapper">
                          <input
                            id="stripes-color-a"
                            type="color"
                            value={rgbaToHex(s.colorA, '#ef4444')}
                            onChange={(e) => updateRecipe({ colorA: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(s.colorA, '#ef4444')}</span>
                        </div>
                      </div>

                      <div className="control-group flex-1">
                        <label htmlFor="stripes-color-b">Secondary Stripe</label>
                        <div className="color-input-wrapper">
                          <input
                            id="stripes-color-b"
                            type="color"
                            value={rgbaToHex(s.colorB, '#3b82f6')}
                            onChange={(e) => updateRecipe({ colorB: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(s.colorB, '#3b82f6')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* MOSAIC CONTROLS */}
              {activeType === 'mosaic' && (() => {
                const m = currentRecipe as { type: 'mosaic' } & MosaicTextureOptions;
                return (
                  <>
                    <div className="control-group">
                      <label htmlFor="mosaic-cell-range">
                        <span>Grid Cell Dimension</span>
                        <span className="val">{m.cellSize ?? 20}px</span>
                      </label>
                      <input
                        id="mosaic-cell-range"
                        type="range"
                        min="4"
                        max="60"
                        step="1"
                        value={m.cellSize ?? 20}
                        onChange={(e) => updateRecipe({ cellSize: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-group">
                      <label htmlFor="mosaic-radius-range">
                        <span>Dot Radius</span>
                        <span className="val">{m.dotRadius ?? 7}px</span>
                      </label>
                      <input
                        id="mosaic-radius-range"
                        type="range"
                        min="1"
                        max="30"
                        step="1"
                        value={m.dotRadius ?? 7}
                        onChange={(e) => updateRecipe({ dotRadius: parseInt(e.target.value, 10) })}
                      />
                    </div>

                    <div className="control-row-duo">
                      <div className="control-group flex-1">
                        <label htmlFor="mosaic-color-a">Dot Foreground</label>
                        <div className="color-input-wrapper">
                          <input
                            id="mosaic-color-a"
                            type="color"
                            value={rgbaToHex(m.colorA, '#ec4899')}
                            onChange={(e) => updateRecipe({ colorA: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(m.colorA, '#ec4899')}</span>
                        </div>
                      </div>

                      <div className="control-group flex-1">
                        <label htmlFor="mosaic-color-b">Background</label>
                        <div className="color-input-wrapper">
                          <input
                            id="mosaic-color-b"
                            type="color"
                            value={rgbaToHex(m.colorB, '#0f172a')}
                            onChange={(e) => updateRecipe({ colorB: hexToRgba(e.target.value) })}
                          />
                          <span className="color-hex-label">{rgbaToHex(m.colorB, '#0f172a')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Procedural Seed with Dice Randomizer */}
              <div className="control-group">
                <label htmlFor="recipe-seed-input">
                  <span>Procedural Random Seed</span>
                  <span className="val">{currentRecipe.seed ?? 0}</span>
                </label>
                <div className="seed-input-row">
                  <input
                    id="recipe-seed-input"
                    type="number"
                    min="0"
                    max="999999"
                    value={currentRecipe.seed ?? 0}
                    onChange={(e) => updateRecipe({ seed: parseInt(e.target.value, 10) || 0 })}
                  />
                  <button
                    id="recipe-seed-random-btn"
                    type="button"
                    className="btn-seed-shuffle"
                    onClick={handleRandomizeSeed}
                    title="Generate random seed variation"
                  >
                    🎲 Shuffle
                  </button>
                </div>
              </div>

              {/* Period Alignment & Independent Vertical Period Slider */}
              <div className="period-section">
                <div className="control-group">
                  <label htmlFor="vertical-period-range">
                    <span>Vertical Period (Tile Height)</span>
                    <span className="val">{tileHeight}px</span>
                  </label>
                  <input
                    id="vertical-period-range"
                    type="range"
                    min="30"
                    max="240"
                    step="1"
                    value={tileHeight}
                    onChange={(e) => setVerticalPeriod(parseInt(e.target.value, 10))}
                  />
                </div>

                <div className="horizontal-sync-indicator">
                  <span className="lock-icon">🔒</span>
                  <div className="sync-info">
                    <span className="sync-title">
                      Horizontal Period: <strong>{tileWidth}px</strong>
                    </span>
                    <span className="sync-note">
                      Locked to active Pattern Separation for exact 1:1 convergence alignment (ADR 0003).
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Previews & Toroidal Repetition Grid */}
          <div className="pattern-studio-preview-col">
            {/* 1× Pattern Tile Preview */}
            <div className="preview-card">
              <div className="preview-card-header">
                <span className="preview-title">1× Pattern Tile</span>
                <span id="pattern-1x-badge" className="badge dimension-badge">
                  {tileWidth} × {tileHeight} px
                </span>
              </div>
              <div className="canvas-frame-1x">
                <canvas
                  ref={canvas1xRef}
                  className="preview-canvas-1x"
                  aria-label="1x Pattern Tile preview"
                />
              </div>
            </div>

            {/* 3×3 Repetition Grid & Toroidal Seamlessness Inspector */}
            <div className="preview-card grid-card">
              <div className="preview-card-header">
                <div className="preview-title-group">
                  <span className="preview-title">3×3 Repetition Grid</span>
                  <span className="preview-subtitle">Toroidal Seamlessness Inspector</span>
                </div>
                <span id="pattern-3x-badge" className="badge dimension-badge">
                  {tileWidth * 3} × {tileHeight * 3} px
                </span>
              </div>

              {/* Zoom & Pan Toolbar */}
              <div className="grid-toolbar">
                <div className="grid-toolbar-actions">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => setGridZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                    aria-label="Zoom out 3x3 repetition grid"
                    title="Zoom Out"
                  >
                    ➖
                  </button>
                  <span id="grid-zoom-indicator" className="zoom-indicator">
                    {Math.round(gridZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => setGridZoom((z) => Math.min(3.0, Math.round((z + 0.25) * 100) / 100))}
                    aria-label="Zoom in 3x3 repetition grid"
                    title="Zoom In"
                  >
                    ➕
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleResetGridView}
                    aria-label="Reset zoom and pan"
                    title="Reset to 100% and center"
                  >
                    Reset View
                  </button>
                </div>

                <label className="checkbox-label seam-toggle-label">
                  <input
                    id="show-seams-checkbox"
                    type="checkbox"
                    checked={showSeams}
                    onChange={(e) => setShowSeams(e.target.checked)}
                  />
                  <span>Inspect Seams</span>
                </label>
              </div>

              {/* Interactive Viewport */}
              <div
                className="grid-viewport"
                onMouseDown={handleGridMouseDown}
                onMouseMove={handleGridMouseMove}
                onMouseUp={handleGridMouseUp}
                onMouseLeave={handleGridMouseUp}
                style={{ cursor: isGridDragging ? 'grabbing' : 'grab' }}
                title="Click and drag to pan across the 3x3 tiling grid"
              >
                <div
                  className="grid-transform-layer"
                  style={{
                    transform: `translate(${gridPan.x}px, ${gridPan.y}px) scale(${gridZoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <canvas
                    ref={canvas3xRef}
                    className="preview-canvas-3x"
                    aria-label="3x3 Repetition Grid canvas"
                  />
                </div>
              </div>
            </div>

            {/* 3D Fusibility Testbed (Mini-Stereogram) */}
            <div className="preview-card testbed-card">
              <div className="preview-card-header">
                <div className="preview-title-group">
                  <div className="preview-title-row">
                    <span className="preview-title">3D Fusibility Testbed</span>
                    <span id="testbed-fusibility-badge" className="badge fusibility-badge">
                      Binocular Fusibility
                    </span>
                  </div>
                  <span className="preview-subtitle">
                    Instant Convergence &amp; Discontinuity Verification
                  </span>
                </div>
                <div className="testbed-header-badges">
                  <span id="testbed-convergence-badge" className="badge mode-badge">
                    {convergenceMode === 'cross' ? 'Cross-eyed' : 'Parallel'}
                  </span>
                  <span id="testbed-dimension-badge" className="badge dimension-badge">
                    {TESTBED_WIDTH} × {TESTBED_HEIGHT} px
                  </span>
                </div>
              </div>

              {/* Scene Selector Toolbar & Guide Dots Toggle */}
              <div className="testbed-toolbar">
                <div className="testbed-mode-toggle" role="group" aria-label="Testbed reference scene">
                  <button
                    type="button"
                    id="testbed-scene-benchmark-btn"
                    className={`testbed-mode-btn ${testbedSceneMode === 'benchmark' ? 'active' : ''}`}
                    onClick={() => setTestbedSceneMode('benchmark')}
                    aria-pressed={testbedSceneMode === 'benchmark'}
                  >
                    Benchmark Sphere
                  </button>
                  <button
                    type="button"
                    id="testbed-scene-project-btn"
                    className={`testbed-mode-btn ${testbedSceneMode === 'project' ? 'active' : ''}`}
                    onClick={() => setTestbedSceneMode('project')}
                    aria-pressed={testbedSceneMode === 'project'}
                    title={
                      activeProjectDepth
                        ? 'Verify fusibility against your active project depth map'
                        : 'No active project depth map available (using benchmark)'
                    }
                  >
                    Active Project Depth Map
                  </button>
                </div>

                <div className="testbed-toolbar-right">
                  <span id="testbed-sep-badge" className="testbed-sep-badge" title="Scaled pattern separation for testbed">
                    Sep: {testbedSeparation}px
                  </span>
                  <label className="checkbox-label testbed-guide-toggle">
                    <input
                      id="testbed-guide-dots-checkbox"
                      type="checkbox"
                      checked={showTestbedGuideDots}
                      onChange={(e) => setShowTestbedGuideDots(e.target.checked)}
                    />
                    <span>Guide Dots</span>
                  </label>
                </div>
              </div>

              {/* Testbed Canvas Frame */}
              <div className="testbed-canvas-frame">
                <div className="testbed-canvas-container">
                  <canvas
                    ref={canvasTestbedRef}
                    id="testbed-stereogram-canvas"
                    width={TESTBED_WIDTH}
                    height={TESTBED_HEIGHT}
                    className="preview-canvas-testbed"
                    aria-label="3D Fusibility Mini-Stereogram testbed canvas"
                  />
                  {showTestbedGuideDots && (
                    <div className="testbed-guide-dots-overlay" aria-hidden="true">
                      <div
                        className="testbed-guide-dot"
                        style={{ transform: `translateX(-${testbedSeparation / 2}px)` }}
                      />
                      <div
                        className="testbed-guide-dot"
                        style={{ transform: `translateX(${testbedSeparation / 2}px)` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <p className="testbed-helper-text">
                Verifies <strong>Binocular Fusibility</strong> and ocular convergence comfort against 3D depth discontinuities before applying the substrate to the main canvas.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="pattern-studio-footer">
          <button
            id="pattern-studio-reset-btn"
            type="button"
            className="btn-secondary"
            onClick={handleResetDefaults}
          >
            ↺ Reset to Defaults
          </button>

          <div className="footer-right-actions">
            <button
              id="pattern-studio-cancel-btn"
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="pattern-studio-apply-btn"
              type="button"
              className="btn-primary"
              onClick={handleApply}
            >
              ✓ Apply Pattern
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
