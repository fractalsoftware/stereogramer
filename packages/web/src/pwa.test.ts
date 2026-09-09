import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { manifestConfig, workboxConfig, pwaOptions } from './pwa-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const indexHtmlPath = path.resolve(__dirname, '../index.html');
const distDir = path.resolve(__dirname, '../dist');

describe('PWA Service Worker & Tiered Caching Infrastructure (Ticket #23 / ADR 0004)', () => {
  describe('Web App Manifest Configuration Object', () => {
    it('declares the required metadata, standalone display mode, and brand theme colors', () => {
      expect(manifestConfig.name).toBe('Stereogramer - 3D Autostereogram Studio');
      expect(manifestConfig.short_name).toBe('Stereogramer');
      expect(manifestConfig.description).toBe(
        'Create Single Image Stereograms (SIS) and Random Dot Autostereograms (SIRDS) in your browser.'
      );
      expect(manifestConfig.display).toBe('standalone');
      expect(manifestConfig.orientation).toBe('any');
      expect(manifestConfig.theme_color).toBe('#0f172a');
      expect(manifestConfig.background_color).toBe('#090d16');
    });

    it('declares all required icon configurations with correct dimensions and types', () => {
      const icons = manifestConfig.icons;
      expect(icons).toBeDefined();
      expect(Array.isArray(icons)).toBe(true);
      expect(icons!.length).toBeGreaterThanOrEqual(3);

      // Check standard 192x192 icon
      const icon192 = icons!.find((icon) => icon.sizes === '192x192');
      expect(icon192).toBeDefined();
      expect(icon192!.src).toContain('pwa-192x192.png');
      expect(icon192!.type).toBe('image/png');

      // Check standard 512x512 icon
      const icon512 = icons!.find((icon) => icon.sizes === '512x512' && (!icon.purpose || icon.purpose === 'any'));
      expect(icon512).toBeDefined();
      expect(icon512!.src).toContain('pwa-512x512.png');
      expect(icon512!.type).toBe('image/png');

      // Check maskable 512x512 icon
      const maskableIcon = icons!.find((icon) => icon.purpose === 'maskable');
      expect(maskableIcon).toBeDefined();
      expect(maskableIcon!.src).toContain('maskable-icon-512x512.png');
      expect(maskableIcon!.sizes).toBe('512x512');
      expect(maskableIcon!.type).toBe('image/png');
    });

    it('declares quick launcher shortcuts with valid deep-link URLs', () => {
      const shortcuts = manifestConfig.shortcuts;
      expect(shortcuts).toBeDefined();
      expect(Array.isArray(shortcuts)).toBe(true);
      expect(shortcuts!.length).toBe(3);

      for (const shortcut of shortcuts!) {
        // Every shortcut URL must start with '/'
        expect(shortcut.url.startsWith('/')).toBe(true);
        expect(shortcut.name).toBeTruthy();
        expect(shortcut.description).toBeTruthy();
      }

      const textureStudio = shortcuts!.find((s) => s.name === 'Texture Studio');
      expect(textureStudio).toBeDefined();
      expect(textureStudio!.url).toBe('/?action=texture-studio');
      expect(textureStudio!.description).toBe('Open procedural pattern and texture generator');

      const aiPhoto = shortcuts!.find((s) => s.name === 'AI 3D Photo');
      expect(aiPhoto).toBeDefined();
      expect(aiPhoto!.url).toBe('/?tab=ai-photo');
      expect(aiPhoto!.description).toBe('Convert photos to 3D autostereograms');

      const newStereogram = shortcuts!.find((s) => s.name === 'New Stereogram');
      expect(newStereogram).toBeDefined();
      expect(newStereogram!.url).toBe('/');
      expect(newStereogram!.description).toBe('Create a new stereogram');
    });
  });

  describe('Physical Icon Assets in packages/web/public/', () => {
    it('verifies that each icon path in the manifest exists in public/ and matches declared pixel dimensions', async () => {
      const icons = manifestConfig.icons;
      expect(icons).toBeDefined();

      for (const icon of icons!) {
        // Strip any leading slash to get relative filename in publicDir
        const filename = icon.src.replace(/^\//, '');
        const filePath = path.join(publicDir, filename);

        expect(fs.existsSync(filePath), `Icon file ${filename} must exist in public/`).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(0);

        const metadata = await sharp(filePath).metadata();
        expect(metadata.format).toBe('png');

        const [expectedWidth, expectedHeight] = (icon.sizes || '').split('x').map(Number);
        expect(metadata.width).toBe(expectedWidth);
        expect(metadata.height).toBe(expectedHeight);
      }
    });
  });

  describe('Workbox & Tiered Caching Strategy (ADR 0004)', () => {
    it('configures prompt-to-update service worker registration lifecycle', () => {
      expect(pwaOptions.registerType).toBe('prompt');
      expect(pwaOptions.strategies).toBe('generateSW');
    });

    it('precaches core app bundles, WASM binaries, and web workers with enlarged file size limit', () => {
      const globPatterns = workboxConfig.globPatterns;
      expect(globPatterns).toBeDefined();
      expect(globPatterns).toContain('**/*.{js,css,html,svg,png,ico,wasm}');

      // Must be set to at least 30MB to accommodate ort-wasm binaries (~21.5MB)
      const maxFileSize = workboxConfig.maximumFileSizeToCacheInBytes;
      expect(maxFileSize).toBeDefined();
      expect(maxFileSize).toBeGreaterThanOrEqual(30 * 1024 * 1024);
    });

    it('configures runtime caching for Hugging Face CDN model weights with CacheFirst strategy and 30-day expiration', () => {
      const runtimeCaching = workboxConfig.runtimeCaching;
      expect(runtimeCaching).toBeDefined();
      expect(Array.isArray(runtimeCaching)).toBe(true);

      const hfRule = runtimeCaching!.find((rule) => {
        const pattern = rule.urlPattern;
        if (pattern instanceof RegExp) {
          return pattern.test('https://huggingface.co/onnx-community/Depth-Anything-V2-Small/resolve/main/onnx/model_quantized.onnx');
        }
        return false;
      });

      expect(hfRule, 'Hugging Face runtime caching rule must be configured').toBeDefined();
      expect(hfRule!.handler).toBe('CacheFirst');

      const options = hfRule!.options;
      expect(options).toBeDefined();
      expect(options!.cacheName).toBe('huggingface-models');

      expect(options!.expiration).toBeDefined();
      expect(options!.expiration!.maxEntries).toBe(10);
      expect(options!.expiration!.maxAgeSeconds).toBe(30 * 24 * 60 * 60); // 30 days

      expect(options!.cacheableResponse).toBeDefined();
      expect(options!.cacheableResponse!.statuses).toEqual([0, 200]);

      // Assert pattern matching behavior against valid and invalid URLs
      const regex = hfRule!.urlPattern as RegExp;
      expect(regex.test('https://huggingface.co/onnx-community/Depth-Anything-V2-Small/resolve/main/onnx/model_quantized.onnx')).toBe(true);
      expect(regex.test('https://cdn-lfs.huggingface.co/repos/onnx/model.onnx')).toBe(true);
      expect(regex.test('https://huggingface.co/onnx-community/Depth-Anything-V2-Small/raw/main/config.json')).toBe(true);
      expect(regex.test('https://huggingface.co/model/weights.bin')).toBe(true);
      expect(regex.test('https://example.com/weights.onnx')).toBe(false);
      expect(regex.test('https://github.com/huggingface/transformers.js')).toBe(false);
    });
  });

  describe('HTML Head PWA Integration in packages/web/index.html', () => {
    it('contains the manifest link tag, Apple mobile web app tags, and theme color', () => {
      const html = fs.readFileSync(indexHtmlPath, 'utf-8');

      // Manifest link
      expect(html).toMatch(/<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/);

      // Theme color
      expect(html).toMatch(/<meta\s+name=["']theme-color["']\s+content=["']#0f172a["']/);

      // Apple mobile web app capable
      expect(html).toMatch(/<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']/);

      // Apple mobile web app status bar style
      expect(html).toMatch(
        /<meta\s+name=["']apple-mobile-web-app-status-bar-style["']\s+content=["']black-translucent["']/
      );

      // Apple mobile web app title
      expect(html).toMatch(/<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["']Stereogramer["']/);
    });
  });

  describe('Build Output Manifest & Service Worker Artifacts', () => {
    it('verifies dist/manifest.webmanifest and dist/sw.js exist and contain correct content when built', () => {
      const manifestPath = path.join(distDir, 'manifest.webmanifest');
      const swPath = path.join(distDir, 'sw.js');

      // If build has been performed, verify dist artifacts
      if (fs.existsSync(manifestPath)) {
        const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        expect(manifestJson.name).toBe('Stereogramer - 3D Autostereogram Studio');
        expect(manifestJson.short_name).toBe('Stereogramer');
        expect(manifestJson.display).toBe('standalone');
        expect(manifestJson.theme_color).toBe('#0f172a');
        expect(manifestJson.background_color).toBe('#090d16');
        expect(manifestJson.icons.length).toBeGreaterThanOrEqual(3);
        expect(manifestJson.shortcuts.length).toBe(3);
      }

      if (fs.existsSync(swPath)) {
        const swContent = fs.readFileSync(swPath, 'utf-8');
        expect(swContent).toContain('SKIP_WAITING');
        expect(swContent).toContain('huggingface-models');
        expect(swContent).toContain('CacheFirst');
      }
    });
  });
});
