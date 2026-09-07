import { Command } from 'commander';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import {
  generateSirds,
  generateTexturedStereogram,
  createPrimitiveDepthMap,
  applyGaussianBlur,
  applyBevel,
  type DepthMap,
  type RgbaImage,
  type ConvergenceMode,
  type DepthPrimitive,
} from '@stereogramer/core';

/**
 * Reads all binary data from process.stdin until EOF.
 */
async function readStdin(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', (err) => reject(err));
  });
}

/**
 * Validates and formats a Sharp instance according to format name and quality.
 */
function applyOutputFormat(
  sharpInstance: sharp.Sharp,
  format: string,
  quality: number
): sharp.Sharp {
  const normFormat = format.toLowerCase().replace(/^\./, '');
  switch (normFormat) {
    case 'png':
      return sharpInstance.png({ compressionLevel: 9 });
    case 'jpeg':
    case 'jpg':
      return sharpInstance.jpeg({ quality });
    case 'webp':
      return sharpInstance.webp({ quality });
    case 'avif':
      return sharpInstance.avif({ quality });
    default:
      throw new Error(
        `Unsupported output format "${format}". Valid options: png, jpeg, webp, avif.`
      );
  }
}

/**
 * Determines output format based on flag, output path, or default.
 */
function resolveOutputFormat(formatOption?: string, outputPath?: string): string {
  if (formatOption) {
    return formatOption.toLowerCase().replace(/^\./, '');
  }
  if (outputPath && outputPath !== '-') {
    const ext = path.extname(outputPath).toLowerCase().replace(/^\./, '');
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'webp') return 'webp';
    if (ext === 'avif') return 'avif';
    if (ext === 'png') return 'png';
  }
  return 'png';
}

async function main() {
  const program = new Command();

  program
    .name('stereogramer')
    .description('Generate single-image autostereograms (SIRDS and Textured SIS) from depth maps')
    .version('0.1.0')
    .option('--sirds', 'Generate a Single Image Random Dot Stereogram (SIRDS)')
    .option('-p, --pattern <path>', 'Input pattern texture image path for Textured SIS')
    .option('-d, --depth <path>', 'Input grayscale depth map image path (or "-" for stdin)')
    .option('-t, --text <text>', 'Text string to extrude as 3D depth relief')
    .option('--primitive <name>', 'Procedural 3D primitive: sphere, torus, cone, cylinder, pyramid, heart, slanted, box')
    .option('--shape <shape>', 'Alias for --primitive')
    .option('--font-size <points>', 'Font size for extruded text in pixels')
    .option('--bevel <pixels>', 'Continuous bevel extrusion edge width in pixels', '0')
    .option('--blur <pixels>', 'Separable Gaussian blur filter radius in pixels', '0')
    .option('-o, --output <path>', 'Output file path (or "-" for stdout)')
    .option('--format <format>', 'Output image format: png, jpeg, webp, avif (default: inferred from filename or png)')
    .option('-q, --quality <quality>', 'Compression quality for lossy formats [1-100]', '90')
    .option('-w, --width <pixels>', 'Image width in pixels')
    .option('-h, --height <pixels>', 'Image height in pixels')
    .option('-s, --separation <pixels>', 'Base pattern separation distance in pixels')
    .option('-f, --factor <factor>', 'Depth intensity factor [0.0 - 1.0]', '1.0')
    .option('--depth-factor <factor>', 'Alias for --factor')
    .option('--no-hsr', 'Disable Hidden Surface Removal (HSR)')
    .option('-m, --mode <mode>', 'Convergence mode: parallel or cross', 'parallel')
    .option('--dot-scale <scale>', 'Pixel block dimension of dots (SIRDS only)', '1')
    .action(async (opts) => {
      try {
        const rawFactor = opts.factor ?? opts.depthFactor;
        const depthFactor = Math.max(0, Math.min(1, parseFloat(rawFactor) || 1.0));
        const hsr = opts.hsr !== false;
        const dotScale = Math.max(1, parseInt(opts.dotScale, 10) || 1);
        const quality = Math.max(1, Math.min(100, parseInt(opts.quality, 10) || 90));

        if (opts.mode && opts.mode !== 'parallel' && opts.mode !== 'cross') {
          console.error(`Error: Invalid convergence mode "${opts.mode}". Must be "parallel" or "cross".`);
          process.exit(1);
        }
        const mode: ConvergenceMode = opts.mode === 'cross' ? 'cross' : 'parallel';
        const separation = opts.separation ? parseInt(opts.separation, 10) : undefined;

        // Determine if output is destined for stdout
        const isStdout = opts.output === '-' || (!opts.output && !process.stdout.isTTY);
        const format = resolveOutputFormat(opts.format, opts.output);
        const validFormats = ['png', 'jpeg', 'jpg', 'webp', 'avif'];
        if (!validFormats.includes(format)) {
          console.error(`Error: Unsupported output format "${format}". Valid options: png, jpeg, webp, avif.`);
          process.exit(1);
        }

        // Determine if depth should be read from stdin
        const shouldReadStdin =
          opts.depth === '-' ||
          (!opts.depth && !opts.text && !opts.primitive && !opts.shape && !opts.sirds && !process.stdin.isTTY);

        let depthMap: DepthMap;

        if (shouldReadStdin) {
          const stdinBuffer = await readStdin();
          if (stdinBuffer.length === 0) {
            console.error('Error: No depth map data received on stdin.');
            process.exit(1);
          }

          let depthSharp: sharp.Sharp;
          let depthMetadata: sharp.Metadata;
          try {
            depthSharp = sharp(stdinBuffer);
            depthMetadata = await depthSharp.metadata();
          } catch (err: any) {
            console.error(`Error: Corrupt or unsupported input depth image: ${err.message || err}`);
            process.exit(1);
          }

          const targetWidth = opts.width
            ? Math.max(1, parseInt(opts.width, 10))
            : (depthMetadata.width || 800);
          const targetHeight = opts.height
            ? Math.max(1, parseInt(opts.height, 10))
            : (depthMetadata.height || 600);

          const { data, info } = await sharp(stdinBuffer)
            .resize(targetWidth, targetHeight, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const floatData = new Float32Array(data.length);
          for (let i = 0; i < data.length; i++) {
            floatData[i] = data[i]! / 255.0;
          }

          depthMap = { width: info.width, height: info.height, data: floatData };
        } else if (opts.depth) {
          const depthFilePath = path.resolve(process.cwd(), opts.depth);
          if (!fs.existsSync(depthFilePath)) {
            console.error(`Error: Depth map file not found: ${depthFilePath}`);
            process.exit(1);
          }

          let depthMetadata: sharp.Metadata;
          try {
            depthMetadata = await sharp(depthFilePath).metadata();
          } catch (err: any) {
            console.error(`Error: Corrupt or unsupported depth map file: ${err.message || err}`);
            process.exit(1);
          }

          const targetWidth = opts.width
            ? Math.max(1, parseInt(opts.width, 10))
            : (depthMetadata.width || 800);
          const targetHeight = opts.height
            ? Math.max(1, parseInt(opts.height, 10))
            : (depthMetadata.height || 600);

          const { data, info } = await sharp(depthFilePath)
            .resize(targetWidth, targetHeight, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const floatData = new Float32Array(data.length);
          for (let i = 0; i < data.length; i++) {
            floatData[i] = data[i]! / 255.0;
          }

          depthMap = { width: info.width, height: info.height, data: floatData };
        } else if (opts.text) {
          // Extrude text string into depth map
          const width = Math.max(1, parseInt(opts.width, 10) || 800);
          const height = Math.max(1, parseInt(opts.height, 10) || 600);
          const fontSize = opts.fontSize ? parseInt(opts.fontSize, 10) : Math.round(height * 0.35);

          const escapedText = opts.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

          const svgText = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
              <rect width="100%" height="100%" fill="black" />
              <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
                    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    font-size="${fontSize}" font-weight="bold" fill="white">
                ${escapedText}
              </text>
            </svg>
          `;

          const { data, info } = await sharp(Buffer.from(svgText))
            .resize(width, height)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const floatData = new Float32Array(data.length);
          for (let i = 0; i < data.length; i++) {
            floatData[i] = data[i]! / 255.0;
          }

          depthMap = { width: info.width, height: info.height, data: floatData };
        } else {
          // Generate procedural depth primitive
          const width = Math.max(1, parseInt(opts.width, 10) || 800);
          const height = Math.max(1, parseInt(opts.height, 10) || 600);
          const primitiveName = (opts.primitive || opts.shape || 'sphere').toLowerCase();
          const validPrimitives: DepthPrimitive[] = [
            'sphere',
            'torus',
            'cone',
            'cylinder',
            'pyramid',
            'heart',
            'slanted',
            'box',
          ];

          if (!validPrimitives.includes(primitiveName as DepthPrimitive)) {
            console.error(
              `Error: Invalid primitive "${primitiveName}". Valid options: ${validPrimitives.join(', ')}`
            );
            process.exit(1);
          }

          depthMap = createPrimitiveDepthMap(primitiveName as DepthPrimitive, width, height);
        }

        // Apply bevel extrusion if requested
        const bevelWidth = parseFloat(opts.bevel || '0');
        if (bevelWidth > 0) {
          depthMap = applyBevel(depthMap, bevelWidth);
        }

        // Apply separable Gaussian blur if requested
        const blurRadius = parseFloat(opts.blur || '0');
        if (blurRadius > 0) {
          depthMap = applyGaussianBlur(depthMap, blurRadius);
        }

        let stereogramResult: RgbaImage;

        if (opts.pattern) {
          // Textured SIS Mode
          const patternFilePath = path.resolve(process.cwd(), opts.pattern);
          if (!fs.existsSync(patternFilePath)) {
            console.error(`Error: Pattern image file not found: ${patternFilePath}`);
            process.exit(1);
          }

          let patRawData: Buffer;
          let patInfo: sharp.OutputInfo;
          try {
            const loaded = await sharp(patternFilePath)
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true });
            patRawData = loaded.data;
            patInfo = loaded.info;
          } catch (err: any) {
            console.error(`Error: Corrupt or unsupported pattern image: ${err.message || err}`);
            process.exit(1);
          }

          const pattern: RgbaImage = {
            width: patInfo.width,
            height: patInfo.height,
            data: new Uint8ClampedArray(
              patRawData.buffer,
              patRawData.byteOffset,
              patRawData.length
            ),
          };

          stereogramResult = generateTexturedStereogram(depthMap, pattern, {
            convergenceMode: mode,
            patternSeparation: separation,
            depthFactor,
            hsr,
          });
        } else {
          // SIRDS Mode
          stereogramResult = generateSirds(depthMap, {
            convergenceMode: mode,
            patternSeparation: separation,
            depthFactor,
            hsr,
            dotScale,
          });
        }

        // Encode to desired image format
        const sharpInstance = sharp(Buffer.from(stereogramResult.data.buffer), {
          raw: {
            width: stereogramResult.width,
            height: stereogramResult.height,
            channels: 4,
          },
        });

        const formattedSharp = applyOutputFormat(sharpInstance, format, quality);

        if (isStdout) {
          const outBuffer = await formattedSharp.toBuffer();
          process.stdout.write(outBuffer);
        } else {
          const defaultOutput = opts.pattern ? `textured-sis.${format}` : `sirds.${format}`;
          const outputPath = path.resolve(process.cwd(), opts.output || defaultOutput);
          const outDir = path.dirname(outputPath);
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          await formattedSharp.toFile(outputPath);
          console.error(
            `Successfully generated ${opts.pattern ? 'Textured SIS' : 'SIRDS'}: ${outputPath} (${stereogramResult.width}x${stereogramResult.height}, ${format.toUpperCase()})`
          );
        }
      } catch (err: any) {
        console.error(`Error: ${err.message || err}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
