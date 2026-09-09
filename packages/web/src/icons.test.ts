import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  generateFaviconSvg,
  generateMaskableSvg,
  generateStandardSvg,
  createIco,
  GRID_CONFIG,
} from '../scripts/generate-icons.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const indexHtmlPath = path.resolve(__dirname, '../index.html');

// Standard PNG 8-byte header
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Helper to parse IHDR chunk from a PNG buffer.
 */
function parsePngIhdr(buf: Buffer) {
  // Check PNG signature
  expect(buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  // IHDR chunk: 4 bytes length, 4 bytes type ('IHDR'), 4 bytes width, 4 bytes height, etc.
  const ihdrLen = buf.readUInt32BE(8);
  expect(ihdrLen).toBe(13);
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  expect(ihdrType).toBe('IHDR');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  return { width, height, bitDepth, colorType };
}

describe('Brand Icon Vector Master & Multi-Resolution Asset Pipeline (Ticket #22)', () => {
  describe('Generated Asset File Presence in packages/web/public/', () => {
    const requiredFiles = [
      'favicon.svg',
      'maskable-icon.svg',
      'favicon.ico',
      'apple-touch-icon.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'maskable-icon-512x512.png',
    ];

    for (const fileName of requiredFiles) {
      it(`verifies that ${fileName} exists and is non-empty`, () => {
        const filePath = path.join(publicDir, fileName);
        expect(fs.existsSync(filePath), `Expected ${fileName} to exist`).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(0);
      });
    }
  });

  describe('PNG Image Dimensions and Metadata Analysis', () => {
    it('verifies apple-touch-icon.png is 180×180 with valid PNG IHDR header', async () => {
      const filePath = path.join(publicDir, 'apple-touch-icon.png');
      const buf = fs.readFileSync(filePath);

      // Binary header check
      const ihdr = parsePngIhdr(buf);
      expect(ihdr.width).toBe(180);
      expect(ihdr.height).toBe(180);

      // Sharp metadata check
      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(180);
      expect(metadata.height).toBe(180);
      expect(metadata.channels).toBe(4);
    });

    it('verifies pwa-192x192.png is 192×192 with valid PNG IHDR header', async () => {
      const filePath = path.join(publicDir, 'pwa-192x192.png');
      const buf = fs.readFileSync(filePath);

      const ihdr = parsePngIhdr(buf);
      expect(ihdr.width).toBe(192);
      expect(ihdr.height).toBe(192);

      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(192);
      expect(metadata.height).toBe(192);
      expect(metadata.channels).toBe(4);
    });

    it('verifies pwa-512x512.png is 512×512 with valid PNG IHDR header', async () => {
      const filePath = path.join(publicDir, 'pwa-512x512.png');
      const buf = fs.readFileSync(filePath);

      const ihdr = parsePngIhdr(buf);
      expect(ihdr.width).toBe(512);
      expect(ihdr.height).toBe(512);

      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
      expect(metadata.channels).toBe(4);
    });

    it('verifies maskable-icon-512x512.png is 512×512 with valid PNG IHDR header', async () => {
      const filePath = path.join(publicDir, 'maskable-icon-512x512.png');
      const buf = fs.readFileSync(filePath);

      const ihdr = parsePngIhdr(buf);
      expect(ihdr.width).toBe(512);
      expect(ihdr.height).toBe(512);

      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
      expect(metadata.channels).toBe(4);
    });

    it('verifies maskable-icon-512x512.png has 100% opaque obsidian perimeter (W3C Maskable safe zone)', async () => {
      const filePath = path.join(publicDir, 'maskable-icon-512x512.png');
      const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });

      expect(info.channels).toBe(4);
      // Sample 4 corners: (0,0), (511,0), (0,511), (511,511)
      const corners = [
        0, // top-left
        (511) * 4, // top-right
        (511 * 512) * 4, // bottom-left
        (511 * 512 + 511) * 4, // bottom-right
      ];

      for (const idx of corners) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // Must be fully opaque
        expect(a).toBe(255);
        // Obsidian background color: #090d16 -> R=9, G=13, B=22
        expect(r).toBe(9);
        expect(g).toBe(13);
        expect(b).toBe(22);
      }
    });
  });

  describe('Multi-Resolution ICO Container Analysis (favicon.ico)', () => {
    it('verifies favicon.ico binary header and directory entries (16×16 and 32×32)', async () => {
      const filePath = path.join(publicDir, 'favicon.ico');
      const buf = fs.readFileSync(filePath);

      // 6-byte ICO header:
      // [0..1] Reserved (0)
      expect(buf.readUInt16LE(0)).toBe(0);
      // [2..3] Type (1 = ICO)
      expect(buf.readUInt16LE(2)).toBe(1);
      // [4..5] Image count (2: 16x16 and 32x32)
      const imageCount = buf.readUInt16LE(4);
      expect(imageCount).toBe(2);

      // Entry 0: 16x16
      const entry0Offset = 6;
      const w0 = buf.readUInt8(entry0Offset);
      const h0 = buf.readUInt8(entry0Offset + 1);
      const planes0 = buf.readUInt16LE(entry0Offset + 4);
      const bitCount0 = buf.readUInt16LE(entry0Offset + 6);
      const size0 = buf.readUInt32LE(entry0Offset + 8);
      const offset0 = buf.readUInt32LE(entry0Offset + 12);

      expect(w0).toBe(16);
      expect(h0).toBe(16);
      expect(planes0).toBe(1);
      expect(bitCount0).toBe(32);
      expect(size0).toBeGreaterThan(0);
      expect(offset0).toBe(6 + 2 * 16); // right after header & directory entries

      // Verify embedded 16x16 image is a valid PNG
      const img0Buf = buf.subarray(offset0, offset0 + size0);
      expect(img0Buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const meta0 = await sharp(img0Buf).metadata();
      expect(meta0.width).toBe(16);
      expect(meta0.height).toBe(16);
      expect(meta0.format).toBe('png');

      // Entry 1: 32x32
      const entry1Offset = 6 + 16;
      const w1 = buf.readUInt8(entry1Offset);
      const h1 = buf.readUInt8(entry1Offset + 1);
      const planes1 = buf.readUInt16LE(entry1Offset + 4);
      const bitCount1 = buf.readUInt16LE(entry1Offset + 6);
      const size1 = buf.readUInt32LE(entry1Offset + 8);
      const offset1 = buf.readUInt32LE(entry1Offset + 12);

      expect(w1).toBe(32);
      expect(h1).toBe(32);
      expect(planes1).toBe(1);
      expect(bitCount1).toBe(32);
      expect(size1).toBeGreaterThan(0);
      expect(offset1).toBe(offset0 + size0);

      // Verify embedded 32x32 image is a valid PNG
      const img1Buf = buf.subarray(offset1, offset1 + size1);
      expect(img1Buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const meta1 = await sharp(img1Buf).metadata();
      expect(meta1.width).toBe(32);
      expect(meta1.height).toBe(32);
      expect(meta1.format).toBe('png');
    });
  });

  describe('Master Vector SVG Specification & Disparity Dot Matrix', () => {
    it('verifies favicon.svg conforms to the 7×7 Disparity Dot Matrix design specifications', () => {
      const svgPath = path.join(publicDir, 'favicon.svg');
      const content = fs.readFileSync(svgPath, 'utf-8');

      // Checks XML/SVG root and viewBox
      expect(content).toContain('<svg');
      expect(content).toContain('viewBox="0 0 512 512"');
      expect(content).toContain('</svg>');

      // Background color: #090d16
      expect(content).toContain('#090d16');

      // Neon cyan colors: #06b6d4 and #22d3ee
      expect(content).toContain('#06b6d4');
      expect(content).toContain('#22d3ee');

      // Disparity magenta/purple colors: #c084fc and #e879f9
      expect(content).toContain('#c084fc');
      expect(content).toContain('#e879f9');

      // Substrate dots: #1e293b
      expect(content).toContain('#1e293b');

      // Mix blend mode screen for binocular disparity additive overlap
      expect(content).toContain('mix-blend-mode: screen');

      // Verify 7x7 matrix points: 49 substrate circles
      const substrateCount = (content.match(/fill="#1e293b"/g) || []).length;
      expect(substrateCount).toBe(49);

      // Verify disparity letter 'S' dot pairs
      const magentaCount = (content.match(/fill="url\(#magentaGrad\)"/g) || []).length;
      const cyanCount = (content.match(/fill="url\(#cyanGrad\)"/g) || []).length;
      expect(magentaCount).toBe(15);
      expect(cyanCount).toBe(15);
    });

    it('verifies maskable-icon.svg incorporates the 20% safe zone transformation', () => {
      const svgPath = path.join(publicDir, 'maskable-icon.svg');
      const content = fs.readFileSync(svgPath, 'utf-8');

      expect(content).toContain('scale(0.8)');
      expect(content).toContain('translate(51.2, 51.2)');
    });
  });

  describe('HTML Head Tag Integration in packages/web/index.html', () => {
    it('verifies index.html contains all required icon link elements', () => {
      const html = fs.readFileSync(indexHtmlPath, 'utf-8');

      // <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      expect(html).toMatch(/<link\s+rel=["']icon["']\s+type=["']image\/svg\+xml["']\s+href=["']\/favicon\.svg["']/);

      // <link rel="alternate icon" href="/favicon.ico" />
      expect(html).toMatch(/<link\s+rel=["']alternate icon["']\s+href=["']\/favicon\.ico["']/);

      // <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      expect(html).toMatch(/<link\s+rel=["']apple-touch-icon["']\s+href=["']\/apple-touch-icon\.png["']/);
    });
  });

  describe('Generator Unit Functions', () => {
    it('verifies generateFaviconSvg produces valid SVG string with rounded corners', () => {
      const svg = generateFaviconSvg();
      expect(svg).toContain('rx="96"');
      expect(svg).toContain('<rect');
    });

    it('verifies generateStandardSvg produces square full-bleed SVG', () => {
      const svg = generateStandardSvg();
      expect(svg).not.toContain('rx=');
      expect(svg).toContain('fill="#090d16"');
    });

    it('verifies generateMaskableSvg incorporates 20% safe zone scaling', () => {
      const svg = generateMaskableSvg();
      expect(svg).toContain('scale(0.8)');
    });

    it('verifies createIco handles arbitrary image buffer inputs correctly', () => {
      const dummy16 = Buffer.alloc(100, 0x11);
      const dummy32 = Buffer.alloc(200, 0x22);

      const ico = createIco([
        { width: 16, height: 16, buffer: dummy16 },
        { width: 32, height: 32, buffer: dummy32 },
      ]);

      expect(ico.readUInt16LE(0)).toBe(0);
      expect(ico.readUInt16LE(2)).toBe(1);
      expect(ico.readUInt16LE(4)).toBe(2);
      expect(ico.length).toBe(6 + 32 + 100 + 200);
    });
  });
});
