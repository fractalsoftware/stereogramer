import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 7×7 Disparity Dot Matrix configuration for Stereogramer.
 * 
 * Matrix layout:
 * - 7 rows (0 to 6) and 7 columns (0 to 6)
 * - Foreground neon cyan dots (#06b6d4 / #22d3ee) form the primary letter 'S'
 * - Horizontally offset neon purple/magenta dots (#c084fc / #e879f9) simulate binocular disparity / ocular disparity
 * - Dark obsidian/slate background (#090d16)
 * - Ambient substrate dots (#1e293b, opacity ~0.45)
 */
export const GRID_CONFIG = {
  rows: 7,
  cols: 7,
  pitch: 46, // Spacing between dot centers
  dotRadius: 17, // Radius of glyph dots
  substrateRadius: 5.5, // Radius of unlit ambient matrix dots
  disparityOffset: 10, // Horizontal disparity offset (pixels)
  colors: {
    background: '#090d16',
    cyanLight: '#22d3ee',
    cyanBase: '#06b6d4',
    magentaLight: '#e879f9',
    magentaBase: '#c084fc',
    substrate: '#1e293b',
  },
  // 180° rotationally symmetric 7x7 matrix representation of 'S'
  pattern: [
    '..OOO..', // row 0: cols 2, 3, 4
    '.O...O.', // row 1: cols 1, 5
    '.O.....', // row 2: col 1
    '..OOO..', // row 3: cols 2, 3, 4 (middle spine)
    '.....O.', // row 4: col 5
    '.O...O.', // row 5: cols 1, 5
    '..OOO..', // row 6: cols 2, 3, 4
  ],
};

/**
 * Generates an SVG string representation of the 7x7 Disparity Dot Matrix icon.
 *
 * @param {object} options
 * @param {number} [options.size=512] - SVG canvas dimension (square)
 * @param {number} [options.rx=0] - Border radius of background rectangle
 * @param {number} [options.safeZoneScale=1.0] - Scale factor to fit inside central safe zone circle (e.g. 0.8 for 20% safe zone padding)
 * @returns {string} SVG markup
 */
export function generateSvg({
  size = 512,
  rx = 0,
  safeZoneScale = 1.0,
} = {}) {
  const { pitch, dotRadius, substrateRadius, disparityOffset, colors, pattern } = GRID_CONFIG;

  let substrateDots = '';
  let disparityDots = '';
  let primaryDots = '';

  for (let r = 0; r < 7; r++) {
    const cy = 256 + (r - 3) * pitch;
    for (let c = 0; c < 7; c++) {
      const cx = 256 + (c - 3) * pitch;
      const isGlyph = pattern[r][c] === 'O';

      // Ambient 7x7 matrix substrate dot
      substrateDots += `    <circle cx="${cx}" cy="${cy}" r="${substrateRadius}" fill="${colors.substrate}" opacity="0.45" />\n`;

      if (isGlyph) {
        // Horizontally shifted neon purple/magenta dot simulating binocular disparity
        const dispX = cx + disparityOffset;
        disparityDots += `      <circle cx="${dispX}" cy="${cy}" r="${dotRadius}" fill="url(#magentaGrad)" />\n`;

        // Foreground neon cyan dot forming the primary letter 'S'
        const primaryX = cx - disparityOffset * 0.3;
        primaryDots += `      <circle cx="${primaryX}" cy="${cy}" r="${dotRadius}" fill="url(#cyanGrad)" />\n`;
      }
    }
  }

  const translateVal = Number((256 * (1 - safeZoneScale)).toFixed(2));
  const transform = safeZoneScale !== 1.0
    ? ` transform="translate(${translateVal}, ${translateVal}) scale(${safeZoneScale})"`
    : '';

  const rxAttr = rx > 0 ? ` rx="${rx}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <!-- Foreground neon cyan radial gradient -->
    <radialGradient id="cyanGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#a5f3fc" />
      <stop offset="35%" stop-color="${colors.cyanLight}" />
      <stop offset="100%" stop-color="${colors.cyanBase}" />
    </radialGradient>
    <!-- Horizontally offset neon purple/magenta radial gradient (binocular disparity) -->
    <radialGradient id="magentaGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fdf4ff" />
      <stop offset="35%" stop-color="${colors.magentaLight}" />
      <stop offset="100%" stop-color="${colors.magentaBase}" />
    </radialGradient>
  </defs>
  <!-- Dark obsidian/slate background -->
  <rect width="512" height="512"${rxAttr} fill="${colors.background}" />
  <g${transform}>
    <!-- 7x7 Substrate Matrix Dots -->
${substrateDots}    <!-- Disparity Dot Matrix Letter 'S' with Screen Blend Overlap -->
    <g style="mix-blend-mode: screen;">
${disparityDots}${primaryDots}    </g>
  </g>
</svg>
`;
}

/**
 * Master vector SVG for browser favicons.
 */
export function generateFaviconSvg() {
  return generateSvg({ size: 512, rx: 96, safeZoneScale: 1.0 });
}

/**
 * Maskable vector SVG with guaranteed 20% safe zone padding per W3C Maskable Icon standards.
 */
export function generateMaskableSvg() {
  return generateSvg({ size: 512, rx: 0, safeZoneScale: 0.8 });
}

/**
 * Standard vector SVG for full-bleed square raster icons.
 */
export function generateStandardSvg() {
  return generateSvg({ size: 512, rx: 0, safeZoneScale: 1.0 });
}

/**
 * Creates a valid multi-resolution ICO file from an array of image descriptors.
 *
 * @param {Array<{ width: number, height: number, buffer: Buffer }>} images
 * @returns {Buffer} ICO binary buffer
 */
export function createIco(images) {
  const count = images.length;
  const headerLen = 6 + count * 16;
  let currentOffset = headerLen;

  const header = Buffer.alloc(headerLen);
  header.writeUInt16LE(0, 0); // Reserved (must be 0)
  header.writeUInt16LE(1, 2); // Resource type: 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  const buffers = [header];

  images.forEach((img, i) => {
    const entryOffset = 6 + i * 16;
    header.writeUInt8(img.width >= 256 ? 0 : img.width, entryOffset); // Width (0 = 256px)
    header.writeUInt8(img.height >= 256 ? 0 : img.height, entryOffset + 1); // Height (0 = 256px)
    header.writeUInt8(0, entryOffset + 2); // Color count in palette (0 = no palette / 32-bit)
    header.writeUInt8(0, entryOffset + 3); // Reserved (must be 0)
    header.writeUInt16LE(1, entryOffset + 4); // Color planes (1)
    header.writeUInt16LE(32, entryOffset + 6); // Bits per pixel (32-bit RGBA)
    header.writeUInt32LE(img.buffer.length, entryOffset + 8); // Size of image data in bytes
    header.writeUInt32LE(currentOffset, entryOffset + 12); // Offset of image data from beginning of file

    buffers.push(img.buffer);
    currentOffset += img.buffer.length;
  });

  return Buffer.concat(buffers);
}

/**
 * Generates all multi-resolution icon assets and writes them to the target directory.
 *
 * @param {string} [targetDir] - Destination directory (defaults to packages/web/public)
 * @returns {Promise<Record<string, string>>} Map of generated file names to paths
 */
export async function generateAllIcons(targetDir) {
  const publicDir = targetDir || path.resolve(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const faviconSvgContent = generateFaviconSvg();
  const maskableSvgContent = generateMaskableSvg();
  const standardSvgContent = generateStandardSvg();

  const faviconSvgPath = path.join(publicDir, 'favicon.svg');
  const maskableSvgPath = path.join(publicDir, 'maskable-icon.svg');
  fs.writeFileSync(faviconSvgPath, faviconSvgContent, 'utf-8');
  fs.writeFileSync(maskableSvgPath, maskableSvgContent, 'utf-8');

  const standardBuf = Buffer.from(standardSvgContent);
  const maskableBuf = Buffer.from(maskableSvgContent);
  const faviconBuf = Buffer.from(faviconSvgContent);

  // 1. Apple touch icon: 180×180 px (solid square background per Apple requirements)
  const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png');
  await sharp(standardBuf).resize(180, 180).png().toFile(appleTouchPath);

  // 2. Standard PWA icons (192×192 and 512×512)
  const pwa192Path = path.join(publicDir, 'pwa-192x192.png');
  await sharp(standardBuf).resize(192, 192).png().toFile(pwa192Path);

  const pwa512Path = path.join(publicDir, 'pwa-512x512.png');
  await sharp(standardBuf).resize(512, 512).png().toFile(pwa512Path);

  // 3. Maskable PWA icon with 20% safe zone padding: 512×512 px
  const maskable512Path = path.join(publicDir, 'maskable-icon-512x512.png');
  await sharp(maskableBuf).resize(512, 512).png().toFile(maskable512Path);

  // 4. Multi-resolution favicon.ico container (16×16 and 32×32)
  const p16 = await sharp(faviconBuf).resize(16, 16).png().toBuffer();
  const p32 = await sharp(faviconBuf).resize(32, 32).png().toBuffer();

  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: p16 },
    { width: 32, height: 32, buffer: p32 },
  ]);
  const icoPath = path.join(publicDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);

  return {
    'favicon.svg': faviconSvgPath,
    'maskable-icon.svg': maskableSvgPath,
    'favicon.ico': icoPath,
    'apple-touch-icon.png': appleTouchPath,
    'pwa-192x192.png': pwa192Path,
    'pwa-512x512.png': pwa512Path,
    'maskable-icon-512x512.png': maskable512Path,
  };
}

// Execute when run directly as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  console.log('Generating Stereogramer brand icon assets...');
  generateAllIcons().then((files) => {
    console.log('Successfully generated all icon assets in public directory:');
    for (const [name, filePath] of Object.entries(files)) {
      const stats = fs.statSync(filePath);
      console.log(` - ${name} (${stats.size} bytes)`);
    }
  }).catch((err) => {
    console.error('Error generating icons:', err);
    process.exit(1);
  });
}
