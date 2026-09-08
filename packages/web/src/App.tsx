import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  generateSirds,
  generateTexturedStereogram,
  createPrimitiveDepthMap,
  applyGaussianBlur,
  applyBevel,
  rasterizeText,
  generatePatternTile,
  type DepthMap,
  type RgbaImage,
  type ConvergenceMode,
  type DepthPrimitive,
  type SirdsPaletteName,
  type PatternRecipe,
} from '@stereogramer/core';
import {
  SAMPLE_DEPTH_MAPS,
  TEXTURE_PRESETS,
  type SampleDepthName,
  type TexturePresetName,
} from './presets.js';
import {
  createDepthEstimator,
  type DepthEstimator,
  type DepthEstimationProgress,
} from './depth/index.js';
import { PatternStudioModal } from './pattern/index.js';

type GeneratorMode = 'sirds' | 'textured';
type DepthSource = 'preset' | 'primitive' | 'text' | 'upload' | 'ai';

interface AiProgress {
  stage: string;
  progress: number;
  message: string;
}

interface UploadedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  thumbUrl: string;
  filename: string;
}

export const App: React.FC = () => {
  // Mode & Source state
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode>('textured');
  const [depthSource, setDepthSource] = useState<DepthSource>('preset');
  const [selectedDepthPreset, setSelectedDepthPreset] = useState<SampleDepthName>('shark');
  const [primitive, setPrimitive] = useState<DepthPrimitive>('sphere');
  const [extrudedText, setExtrudedText] = useState<string>('3D MAGIC');
  const [textFontSize, setTextFontSize] = useState<number>(72);
  const [bevel, setBevel] = useState<number>(0);
  const [blur, setBlur] = useState<number>(0);
  const [invertDepth, setInvertDepth] = useState<boolean>(false);

  // Pattern / Texture state
  const [selectedTexturePreset, setSelectedTexturePreset] = useState<TexturePresetName>('perlin');
  const [customDepth, setCustomDepth] = useState<UploadedImage | null>(null);
  const [uploadEstimateAi, setUploadEstimateAi] = useState<boolean>(false);
  const [customPattern, setCustomPattern] = useState<UploadedImage | null>(null);
  const [activePatternRecipe, setActivePatternRecipe] = useState<PatternRecipe | null>(null);
  const [verticalPeriod, setVerticalPeriod] = useState<number>(80);
  const [isPatternStudioOpen, setIsPatternStudioOpen] = useState<boolean>(false);

  // AI 2D Photo Depth Estimation state
  const [aiPhoto, setAiPhoto] = useState<UploadedImage | null>(null);
  const [aiBaseDepthMap, setAiBaseDepthMap] = useState<DepthMap | null>(null);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const depthEstimatorRef = useRef<DepthEstimator | null>(null);

  // Stereogram configuration parameters
  const [convergenceMode, setConvergenceMode] = useState<ConvergenceMode>('parallel');
  const [separation, setSeparation] = useState<number>(80);
  const [depthFactor, setDepthFactor] = useState<number>(0.85);
  const [hsr, setHsr] = useState<boolean>(true);
  const [dotScale, setDotScale] = useState<number>(1);
  const [sirdsPalette, setSirdsPalette] = useState<SirdsPaletteName>('bw');
  const [showGuideDots, setShowGuideDots] = useState<boolean>(true);
  const [showPreviews, setShowPreviews] = useState<boolean>(true);
  const [seed, setSeed] = useState<number>(1);

  // Preset Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Zoom & Pan interactive viewer state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number }>({
    x: 0,
    y: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  const width = 640;
  const height = 480;

  // Initialize Web Worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('./stereogram.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // Fallback to inline computation if Web Workers unavailable in test env
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      depthEstimatorRef.current?.terminate();
    };
  }, []);

  // Procedural pattern tile dynamically synchronized with pattern separation (ADR 0003)
  const activePattern = useMemo<RgbaImage>(() => {
    if (customPattern) {
      return { width: customPattern.width, height: customPattern.height, data: customPattern.data };
    }
    const tileW = Math.max(10, Math.round(separation));
    const tileH = Math.max(30, Math.round(verticalPeriod));
    if (activePatternRecipe) {
      return generatePatternTile(tileW, tileH, activePatternRecipe);
    }
    const preset = TEXTURE_PRESETS.find((p) => p.id === selectedTexturePreset) || TEXTURE_PRESETS[0]!;
    return preset.generate(tileW, tileH);
  }, [customPattern, activePatternRecipe, selectedTexturePreset, separation, verticalPeriod]);

  // Maximum canvas dimension to downscale before transferring to Web Worker (Task 5)
  const MAX_IMAGE_DIMENSION = 518;

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
        let targetW: number;
        let targetH: number;

        if (targetDimensions) {
          targetW = targetDimensions.width;
          targetH = targetDimensions.height;
        } else {
          const naturalW = img.naturalWidth || img.width;
          const naturalH = img.naturalHeight || img.height;
          targetW = naturalW;
          targetH = naturalH;
          if (targetW > MAX_IMAGE_DIMENSION || targetH > MAX_IMAGE_DIMENSION) {
            if (targetW >= targetH) {
              targetH = Math.max(1, Math.round((targetH * MAX_IMAGE_DIMENSION) / targetW));
              targetW = MAX_IMAGE_DIMENSION;
            } else {
              targetW = Math.max(1, Math.round((targetW * MAX_IMAGE_DIMENSION) / targetH));
              targetH = MAX_IMAGE_DIMENSION;
            }
          }
        }

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
      const targetDims = uploadEstimateAi ? undefined : { width, height };
      processImageFile(file, (img) => {
        setCustomDepth(img);
        setDepthSource('upload');
        if (uploadEstimateAi) {
          startAiDepthEstimation(img);
        }
      }, targetDims);
    }
  };

  const handleDepthInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const targetDims = uploadEstimateAi ? undefined : { width, height };
      processImageFile(file, (img) => {
        setCustomDepth(img);
        setDepthSource('upload');
        if (uploadEstimateAi) {
          startAiDepthEstimation(img);
        }
      }, targetDims);
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

  // Helper to lazily initialize or retrieve the depth estimator
  const getDepthEstimator = useCallback(() => {
    if (!depthEstimatorRef.current) {
      depthEstimatorRef.current = createDepthEstimator();
    }
    return depthEstimatorRef.current;
  }, []);

  interface StageConfig {
    minPercentage: number;
    text: string | ((pct: number) => string);
  }

  // Declarative stage mapping for progress status and minimum percentages (Task 9)
  const STAGE_CONFIG_MAP: Record<string, StageConfig> = {
    'init': {
      minPercentage: 10,
      text: 'Initializing WebGPU / WASM...',
    },
    'loading-model': {
      minPercentage: 0,
      text: (pct) => `Downloading AI Model (${pct}%)...`,
    },
    'preprocessing': {
      minPercentage: 25,
      text: 'Preprocessing 2D Image...',
    },
    'estimating': {
      minPercentage: 60,
      text: 'Estimating Depth...',
    },
    'normalizing': {
      minPercentage: 90,
      text: 'Refining Depth Elevation...',
    },
    'resampling': {
      minPercentage: 90,
      text: 'Refining Depth Elevation...',
    },
    'complete': {
      minPercentage: 100,
      text: 'Complete',
    },
  };

  // Format progress events to user-friendly status and percentage using declarative mapping
  const formatProgressStatus = (prog: DepthEstimationProgress): { text: string; percentage: number } => {
    let pct = prog.percentage ?? Math.round(prog.progress * 100);
    pct = Math.max(0, Math.min(100, pct));

    const config = STAGE_CONFIG_MAP[prog.stage];
    if (config) {
      const percentage = Math.max(pct, config.minPercentage);
      const text = typeof config.text === 'function' ? config.text(pct) : config.text;
      return { text, percentage };
    }

    return {
      text: prog.message || 'Processing...',
      percentage: pct,
    };
  };

  // Trigger depth estimation for a 2D photo
  const startAiDepthEstimation = async (img: UploadedImage) => {
    if (depthEstimatorRef.current) {
      depthEstimatorRef.current.terminate();
      depthEstimatorRef.current = null;
    }

    setIsEstimating(true);
    setAiError(null);
    setAiProgress({
      stage: 'init',
      progress: 10,
      message: 'Initializing WebGPU / WASM...',
    });

    try {
      const estimator = getDepthEstimator();

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      if (urlParams?.get('simulateError') === 'true' || (window as any).__STEREOGRAMER_SIMULATE_ERROR__ === true) {
        throw new Error('WebGPU out of memory or device lost');
      }
      const isSynthetic = urlParams?.get('syntheticDepth') === 'true' || (window as any).__STEREOGRAMER_SYNTHETIC_DEPTH__ === true;
      // Synthetic fallback is disabled in production (Task 4); only allowed if explicitly enabled
      const allowSyntheticFallback = urlParams?.get('syntheticFallback') === 'true' || (window as any).__STEREOGRAMER_SYNTHETIC_FALLBACK__ === true;
      const simulateProg = urlParams?.get('simulateProgress') === 'true' || isSynthetic;
      const customDelay = urlParams?.get('syntheticDelay');
      const delayMs = customDelay ? parseInt(customDelay, 10) : (simulateProg ? 80 : undefined);

      const inputBuffer = img.data.slice().buffer;

      const depthResult = await estimator.estimate(
        {
          width: img.width,
          height: img.height,
          data: inputBuffer,
        },
        {
          targetWidth: width,
          targetHeight: height,
          synthetic: isSynthetic,
          syntheticFallback: allowSyntheticFallback,
          simulateProgress: simulateProg,
          syntheticDelayMs: delayMs,
        },
        (progress) => {
          const formatted = formatProgressStatus(progress);
          setAiProgress({
            stage: progress.stage,
            progress: formatted.percentage,
            message: formatted.text,
          });
        }
      );

      setAiBaseDepthMap(depthResult);
      setAiProgress({
        stage: 'complete',
        progress: 100,
        message: 'Complete',
      });
    } catch (err: any) {
      if (err?.message === 'DepthEstimator terminated' || err?.message?.includes('aborted')) {
        // Intentionally cancelled
        return;
      }
      setAiError(err?.message || 'Failed to estimate depth map');
      setAiProgress(null);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleCancelInference = () => {
    if (depthEstimatorRef.current) {
      depthEstimatorRef.current.terminate();
      depthEstimatorRef.current = null;
    }
    setIsEstimating(false);
    setAiProgress(null);
    if (depthSource === 'ai' && !aiBaseDepthMap) {
      setAiPhoto(null);
    }
  };

  const handleClearAiPhoto = () => {
    if (depthEstimatorRef.current) {
      depthEstimatorRef.current.terminate();
      depthEstimatorRef.current = null;
    }
    setIsEstimating(false);
    setAiProgress(null);
    setAiPhoto(null);
    setAiBaseDepthMap(null);
    setAiError(null);
  };

  const handleClearCustomDepth = () => {
    setCustomDepth(null);
    if (uploadEstimateAi) {
      if (depthEstimatorRef.current) {
        depthEstimatorRef.current.terminate();
        depthEstimatorRef.current = null;
      }
      setIsEstimating(false);
      setAiBaseDepthMap(null);
      setAiProgress(null);
      setAiError(null);
    }
  };

  const handleToggleUploadAi = (checked: boolean) => {
    setUploadEstimateAi(checked);
    if (checked) {
      if (customDepth) {
        startAiDepthEstimation(customDepth);
      }
    } else {
      setAiProgress(null);
      setAiError(null);
    }
  };

  const handleRetryInference = () => {
    const targetImage = depthSource === 'upload' ? customDepth : (aiPhoto || customDepth);
    if (targetImage) {
      setAiError(null);
      startAiDepthEstimation(targetImage);
    }
  };

  const handleUsePresets = () => {
    setAiError(null);
    setDepthSource('preset');
  };

  // Render in-flight progress banner with screen-reader ARIA announcements (Task 2)
  const renderAiProgressBanner = () => {
    if (!aiProgress) return null;
    return (
      <div
        className={`ai-progress-banner ${isEstimating ? 'estimating' : 'complete'}`}
        id="ai-progress-banner"
        aria-live="polite"
        role="status"
      >
        <div className="ai-progress-row">
          <div className="ai-status-indicator">
            {isEstimating ? (
              <span className="ai-spinner" aria-hidden="true">⏳</span>
            ) : (
              <span className="ai-check" aria-hidden="true">✓</span>
            )}
            <span className="ai-status-text" id="ai-status-text">
              {aiProgress.message}
            </span>
          </div>
          {isEstimating && (
            <button
              type="button"
              className="btn-ai-cancel"
              id="cancel-ai-inference-btn"
              onClick={handleCancelInference}
            >
              Cancel
            </button>
          )}
        </div>
        <div
          className="ai-progress-bar-track"
          id="ai-progress-bar"
          role="progressbar"
          aria-valuenow={Math.round(aiProgress.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Depth estimation progress"
        >
          <div
            className="ai-progress-bar-fill"
            id="ai-progress-bar-fill"
            style={{ width: `${aiProgress.progress}%` }}
          />
        </div>
      </div>
    );
  };

  // Render error banner with recovery actions: Retry & Use Presets (Task 3)
  const renderAiErrorBanner = () => {
    if (!aiError) return null;
    return (
      <div className="ai-error-banner" id="ai-error-banner" role="alert">
        <div className="ai-error-content">
          <span className="ai-error-message">⚠️ {aiError}</span>
          <div className="ai-error-actions">
            <button
              type="button"
              className="btn-ai-retry"
              id="ai-retry-btn"
              onClick={handleRetryInference}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn-ai-presets"
              id="ai-use-presets-btn"
              onClick={handleUsePresets}
            >
              Use Presets
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn-icon-clear"
          onClick={() => setAiError(null)}
          title="Dismiss error"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      </div>
    );
  };

  const handleAiPhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file, (img) => {
        setAiPhoto(img);
        setDepthSource('ai');
        startAiDepthEstimation(img);
      });
    }
  };

  const handleAiPhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, (img) => {
        setAiPhoto(img);
        setDepthSource('ai');
        startAiDepthEstimation(img);
      });
    }
  };

  // Zoom & Pan Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((prev) => Math.min(3.0, Math.max(0.5, parseFloat((prev + delta).toFixed(2)))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Main stereogram computation and rendering loop
  useEffect(() => {
    // 1. Resolve Depth Map
    let depthMap: DepthMap;
    if (depthSource === 'ai' && aiBaseDepthMap) {
      const floatData = new Float32Array(aiBaseDepthMap.data.length);
      if (invertDepth) {
        for (let i = 0; i < floatData.length; i++) {
          floatData[i] = 1.0 - aiBaseDepthMap.data[i]!;
        }
      } else {
        floatData.set(aiBaseDepthMap.data);
      }
      depthMap = { width: aiBaseDepthMap.width, height: aiBaseDepthMap.height, data: floatData };
    } else if (depthSource === 'upload' && customDepth) {
      if (uploadEstimateAi && aiBaseDepthMap) {
        const floatData = new Float32Array(aiBaseDepthMap.data.length);
        if (invertDepth) {
          for (let i = 0; i < floatData.length; i++) {
            floatData[i] = 1.0 - aiBaseDepthMap.data[i]!;
          }
        } else {
          floatData.set(aiBaseDepthMap.data);
        }
        depthMap = { width: aiBaseDepthMap.width, height: aiBaseDepthMap.height, data: floatData };
      } else {
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
      }
    } else if (depthSource === 'text') {
      depthMap = rasterizeText(extrudedText || '3D', width, height, {
        fontSize: textFontSize,
        fontWeight: 'bold',
      });
    } else if (depthSource === 'primitive') {
      depthMap = createPrimitiveDepthMap(primitive, width, height);
    } else {
      // Curated Starter Preset
      const pInfo = SAMPLE_DEPTH_MAPS.find((p) => p.id === selectedDepthPreset) || SAMPLE_DEPTH_MAPS[0]!;
      depthMap = pInfo.generate(width, height);
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

    // 4. Offload Autostereogram Generation to Web Worker (with inline fallback)
    const currentRequestId = ++requestIdRef.current;

    const renderStereogramToCanvas = (resultData: Uint8ClampedArray) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.createImageData(width, height);
        imgData.data.set(resultData);
        ctx.putImageData(imgData, 0, 0);
      }
    };

    if (workerRef.current) {
      const worker = workerRef.current;
      worker.onmessage = (e) => {
        if (e.data.id === requestIdRef.current) {
          renderStereogramToCanvas(new Uint8ClampedArray(e.data.data));
        }
      };

      const depthBuffer = depthMap.data.buffer.slice(0);
      const patternBuffer = activePattern.data.buffer.slice(0);

      worker.postMessage(
        {
          id: currentRequestId,
          mode: generatorMode,
          depthWidth: width,
          depthHeight: height,
          depthBuffer,
          patternWidth: activePattern.width,
          patternHeight: activePattern.height,
          patternBuffer,
          options: {
            convergenceMode,
            patternSeparation: separation,
            depthFactor,
            hsr,
            dotScale,
            palette: sirdsPalette,
            seed,
          },
        },
        [depthBuffer, patternBuffer]
      );
    } else {
      // Main-thread fallback
      let result: RgbaImage;
      if (generatorMode === 'textured') {
        result = generateTexturedStereogram(depthMap, activePattern, {
          convergenceMode,
          patternSeparation: separation,
          depthFactor,
          hsr,
        });
      } else {
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
          palette: sirdsPalette,
          random: prng,
        });
      }
      renderStereogramToCanvas(result.data);
    }
  }, [
    generatorMode,
    depthSource,
    selectedDepthPreset,
    primitive,
    extrudedText,
    textFontSize,
    bevel,
    blur,
    invertDepth,
    customDepth,
    uploadEstimateAi,
    aiBaseDepthMap,
    customPattern,
    selectedTexturePreset,
    activePattern,
    convergenceMode,
    separation,
    depthFactor,
    hsr,
    dotScale,
    sirdsPalette,
    seed,
  ]);

  const handleDownload = useCallback((format: 'png' | 'jpeg') => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    const filename = `${generatorMode}-stereogram.${format === 'jpeg' ? 'jpg' : 'png'}`;
    link.download = filename;
    link.href = canvasRef.current.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
    link.click();
  }, [generatorMode]);

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
          {/* Preset Library Drawer Trigger */}
          <button
            type="button"
            className="btn-preset-trigger"
            id="preset-drawer-trigger"
            onClick={() => setIsDrawerOpen(true)}
          >
            <span>📚</span>
            <span>Browse Presets & Textures</span>
          </button>

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
            <div className="mode-tabs depth-source-tabs">
              <button
                type="button"
                className={`mode-tab ${depthSource === 'preset' ? 'active' : ''}`}
                onClick={() => setDepthSource('preset')}
              >
                Presets
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'primitive' ? 'active' : ''}`}
                onClick={() => setDepthSource('primitive')}
              >
                Shapes
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'text' ? 'active' : ''}`}
                onClick={() => setDepthSource('text')}
              >
                Text
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'upload' ? 'active' : ''}`}
                onClick={() => setDepthSource('upload')}
              >
                Upload
              </button>
              <button
                type="button"
                className={`mode-tab ${depthSource === 'ai' ? 'active' : ''}`}
                onClick={() => setDepthSource('ai')}
              >
                AI Photo
              </button>
            </div>
          </div>

          {/* Preset Selector */}
          {depthSource === 'preset' && (
            <div className="control-group">
              <label htmlFor="depth-preset-select">Curated Depth Model</label>
              <select
                id="depth-preset-select"
                value={selectedDepthPreset}
                onChange={(e) => setSelectedDepthPreset(e.target.value as SampleDepthName)}
              >
                {SAMPLE_DEPTH_MAPS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              <label
                className="checkbox-label"
                id="upload-ai-depth-toggle-label"
                title="Enable to estimate 3D depth from regular 2D photos using in-browser AI, instead of treating as a pre-rendered grayscale depth map"
                style={{ marginBottom: '0.5rem' }}
              >
                <input
                  type="checkbox"
                  id="upload-ai-depth-toggle"
                  checked={uploadEstimateAi}
                  onChange={(e) => handleToggleUploadAi(e.target.checked)}
                />
                Estimate 3D Depth (AI)
              </label>

              {customDepth ? (
                <div className="dropzone-loaded" id="upload-depth-card">
                  <div className="dropzone-thumb-wrapper">
                    <img src={customDepth.thumbUrl} alt="Depth map" className="dropzone-thumb" />
                    <div className="dropzone-file-info">
                      <span className="dropzone-filename">{customDepth.filename}</span>
                      <span className="dropzone-dim">{customDepth.width} × {customDepth.height}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon-clear"
                    id="clear-upload-depth-btn"
                    title="Remove uploaded depth map"
                    onClick={handleClearCustomDepth}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="dropzone"
                  id="upload-depth-dropzone"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={handleDepthDrop}
                >
                  <input
                    type="file"
                    id="upload-depth-input"
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

              {/* Progress and error feedback for upload AI estimation */}
              {uploadEstimateAi && renderAiProgressBanner()}
              {uploadEstimateAi && renderAiErrorBanner()}

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

          {/* AI 2D Photo Depth Estimation Controls */}
          {depthSource === 'ai' && (
            <div className="control-group" id="ai-photo-section">
              {aiPhoto ? (
                <div className="dropzone-loaded" id="ai-photo-card">
                  <div className="dropzone-thumb-wrapper">
                    <img src={aiPhoto.thumbUrl} alt="2D Photo" className="dropzone-thumb" />
                    <div className="dropzone-file-info">
                      <span className="dropzone-filename" title={aiPhoto.filename}>{aiPhoto.filename}</span>
                      <span className="dropzone-dim">{aiPhoto.width} × {aiPhoto.height}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon-clear"
                    id="clear-ai-photo-btn"
                    title="Remove 2D Photo"
                    aria-label="Remove 2D Photo"
                    onClick={handleClearAiPhoto}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="dropzone"
                  id="ai-photo-dropzone"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={handleAiPhotoDrop}
                >
                  <input
                    type="file"
                    id="ai-photo-input"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={handleAiPhotoInput}
                    title="Upload 2D Photo for AI Depth"
                  />
                  <div className="dropzone-content">
                    <span className="dropzone-icon">✨</span>
                    <span className="dropzone-title">Upload 2D Photo</span>
                    <span className="dropzone-subtitle">Drop JPEG, PNG, or WebP photo</span>
                  </div>
                </div>
              )}

              {/* In-Flight Inference / Progress Feedback Banner */}
              {renderAiProgressBanner()}

              {/* Error banner if inference fails */}
              {renderAiErrorBanner()}

              {/* Live Invert Depth Polarity Toggle for AI Photo */}
              {aiPhoto && aiBaseDepthMap && (
                <label className="checkbox-label" style={{ marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    id="ai-invert-depth"
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
              ) : activePatternRecipe ? (
                <div className="custom-recipe-active-card">
                  <div className="custom-recipe-info">
                    <span className="custom-recipe-badge">Custom Recipe</span>
                    <span className="custom-recipe-type">{activePatternRecipe.type.toUpperCase()}</span>
                    <span className="custom-recipe-dims">{Math.round(separation)} × {Math.round(verticalPeriod)} px</span>
                  </div>
                  <div className="custom-recipe-actions">
                    <button
                      id="open-texture-studio-btn"
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setIsPatternStudioOpen(true)}
                      title="Edit in Texture Studio"
                    >
                      Customize Pattern
                    </button>
                    <button
                      id="clear-custom-recipe-btn"
                      type="button"
                      className="btn-icon-clear"
                      title="Revert to standard preset"
                      onClick={() => setActivePatternRecipe(null)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    id="texture-preset-select"
                    value={selectedTexturePreset}
                    onChange={(e) => {
                      setSelectedTexturePreset(e.target.value as TexturePresetName);
                      setActivePatternRecipe(null);
                    }}
                  >
                    {TEXTURE_PRESETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <button
                    id="open-texture-studio-btn"
                    type="button"
                    className="btn-texture-studio"
                    onClick={() => setIsPatternStudioOpen(true)}
                  >
                    ✨ Customize Pattern / Texture Studio
                  </button>

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

          {/* SIRDS Palette & Dot Scale (for SIRDS) */}
          {generatorMode === 'sirds' && (
            <>
              <div className="control-group">
                <label htmlFor="sirds-palette-select">SIRDS Color Palette</label>
                <select
                  id="sirds-palette-select"
                  value={sirdsPalette}
                  onChange={(e) => setSirdsPalette(e.target.value as SirdsPaletteName)}
                >
                  <option value="bw">Black & White (1-Bit)</option>
                  <option value="grayscale">Grayscale (16 Shades)</option>
                  <option value="rgb">Full RGB Spectral</option>
                  <option value="duotone">Electric Duotone (Teal & Amber)</option>
                </select>
              </div>

              <div className="control-group">
                <label htmlFor="dot-scale-range">
                  Dot Scale (Retina Display)
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
            </>
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
              Clamped to &le; {maxDisparityCeiling}px (33.3% of S) to prevent visual fusion strain
            </div>
          </div>

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

          {/* Export Action Buttons */}
          <div className="export-group">
            <button
              className="btn-primary"
              id="download-png-btn"
              onClick={() => handleDownload('png')}
            >
              Export PNG
            </button>
            <button
              className="btn-secondary"
              id="download-jpeg-btn"
              onClick={() => handleDownload('jpeg')}
            >
              Export JPEG
            </button>
          </div>
        </aside>

        <main className="viewport-container">
          {/* Zoom & Pan Viewport Toolbar */}
          <div className="viewport-toolbar">
            <button
              type="button"
              className="toolbar-btn"
              title="Zoom In"
              onClick={() => setZoom((z) => Math.min(3.0, parseFloat((z + 0.2).toFixed(1))))}
            >
              ➕
            </button>
            <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="toolbar-btn"
              title="Zoom Out"
              onClick={() => setZoom((z) => Math.max(0.5, parseFloat((z - 0.2).toFixed(1))))}
            >
              ➖
            </button>
            <div className="toolbar-divider" />
            <button
              type="button"
              className="toolbar-btn"
              title="Reset View"
              onClick={handleResetView}
            >
              Reset View
            </button>
          </div>

          {/* Interactive Zoomable / Pannable Canvas Wrapper */}
          <div
            className="canvas-wrapper"
            style={{
              width,
              height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
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

      {/* Preset Library Drawer Modal */}
      {isDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">
                <span>📚</span> Preset Library & Textures
              </div>
              <button
                type="button"
                className="btn-close-drawer"
                onClick={() => setIsDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div>
              <div className="preset-section-title">3D Depth Model Presets</div>
              <div className="preset-grid">
                {SAMPLE_DEPTH_MAPS.map((preset) => (
                  <div
                    key={preset.id}
                    className={`preset-card ${selectedDepthPreset === preset.id && depthSource === 'preset' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedDepthPreset(preset.id);
                      setDepthSource('preset');
                      setIsDrawerOpen(false);
                    }}
                  >
                    <span className="preset-card-icon">{preset.icon}</span>
                    <div className="preset-card-info">
                      <span className="preset-card-name">{preset.name}</span>
                      <span className="preset-card-desc">{preset.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="preset-section-header">
                <div className="preset-section-title">Procedural Seamless Textures</div>
                <button
                  id="drawer-open-texture-studio-btn"
                  type="button"
                  className="btn-preset-trigger"
                  style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.825rem' }}
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsPatternStudioOpen(true);
                  }}
                >
                  ✨ Customize Pattern / Texture Studio
                </button>
              </div>
              <div className="preset-grid">
                {TEXTURE_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    className={`preset-card ${selectedTexturePreset === preset.id && !customPattern && !activePatternRecipe ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTexturePreset(preset.id);
                      setActivePatternRecipe(null);
                      setCustomPattern(null);
                      setGeneratorMode('textured');
                      setIsDrawerOpen(false);
                    }}
                  >
                    <div className="preset-card-info">
                      <span className="preset-card-name">{preset.name}</span>
                      <span className="preset-card-desc">{preset.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Texture Studio Modal */}
      <PatternStudioModal
        isOpen={isPatternStudioOpen}
        onClose={() => setIsPatternStudioOpen(false)}
        onApply={(recipe, vPeriod) => {
          setActivePatternRecipe(recipe);
          setVerticalPeriod(vPeriod);
          setCustomPattern(null);
          setGeneratorMode('textured');
          setIsPatternStudioOpen(false);
        }}
        patternSeparation={separation}
        initialRecipe={activePatternRecipe ?? undefined}
        initialVerticalPeriod={verticalPeriod}
      />
    </div>
  );
};
