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

async function main() {
  const program = new Command();

  program
    .name('stereogramer')
    .description('Generate single-image autostereograms (SIRDS and Textured SIS) from depth maps')
    .version('0.1.0')
    .option('--sirds', 'Generate a Single Image Random Dot Stereogram (SIRDS)')
    .option('-p, --pattern <path>', 'Input pattern texture image path for Textured SIS')
    .option('-d, --depth <path>', 'Input grayscale depth map image path')
    .option('-t, --text <text>', 'Text string to extrude as 3D depth relief')
    .option('--primitive <name>', 'Procedural 3D primitive: sphere, torus, cone, cylinder, pyramid, heart, slanted, box')
    .option('--shape <shape>', 'Alias for --primitive')
    .option('--font-size <points>', 'Font size for extruded text in pixels')
    .option('--bevel <pixels>', 'Continuous bevel extrusion edge width in pixels', '0')
    .option('--blur <pixels>', 'Separable Gaussian blur filter radius in pixels', '0')
    .option('-o, --output <path>', 'Output file path')
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
        if (opts.mode && opts.mode !== 'parallel' && opts.mode !== 'cross') {
          console.error(`Error: Invalid convergence mode "${opts.mode}". Must be "parallel" or "cross".`);
          process.exit(1);
        }
        const mode: ConvergenceMode = opts.mode === 'cross' ? 'cross' : 'parallel';
        const separation = opts.separation ? parseInt(opts.separation, 10) : undefined;
        const defaultOutput = opts.pattern ? 'textured-sis.png' : 'sirds.png';
        const outputPath = path.resolve(process.cwd(), opts.output || defaultOutput);

        let depthMap: DepthMap;

        if (opts.depth) {
          const depthFilePath = path.resolve(process.cwd(), opts.depth);
          if (!fs.existsSync(depthFilePath)) {
            console.error(`Error: Depth map file not found: ${depthFilePath}`);
            process.exit(1);
          }

          const depthMetadata = await sharp(depthFilePath).metadata();
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

        // Ensure parent directory exists
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        if (opts.pattern) {
          // Textured SIS Mode
          const patternFilePath = path.resolve(process.cwd(), opts.pattern);
          if (!fs.existsSync(patternFilePath)) {
            console.error(`Error: Pattern image file not found: ${patternFilePath}`);
            process.exit(1);
          }

          const { data: patRawData, info: patInfo } = await sharp(patternFilePath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const pattern: RgbaImage = {
            width: patInfo.width,
            height: patInfo.height,
            data: new Uint8ClampedArray(
              patRawData.buffer,
              patRawData.byteOffset,
              patRawData.length
            ),
          };

          const effectiveSeparation = separation ?? Math.round(depthMap.width / 8);
          console.log(
            `Rendering Textured SIS (${depthMap.width}x${depthMap.height}, pattern: ${pattern.width}x${pattern.height}, mode: ${mode}, separation: ${effectiveSeparation}px)...`
          );

          const result = generateTexturedStereogram(depthMap, pattern, {
            convergenceMode: mode,
            patternSeparation: separation,
            depthFactor,
            hsr,
          });

          await sharp(Buffer.from(result.data.buffer), {
            raw: {
              width: result.width,
              height: result.height,
              channels: 4,
            },
          })
            .png()
            .toFile(outputPath);

          console.log(`Successfully generated Textured SIS: ${outputPath} (${result.width}x${result.height})`);
        } else {
          // SIRDS Mode
          const effectiveSeparation = separation ?? Math.round(depthMap.width / 8);
          console.log(
            `Rendering SIRDS (${depthMap.width}x${depthMap.height}, mode: ${mode}, separation: ${effectiveSeparation}px, hsr: ${hsr})...`
          );

          const result = generateSirds(depthMap, {
            convergenceMode: mode,
            patternSeparation: separation,
            depthFactor,
            hsr,
            dotScale,
          });

          await sharp(Buffer.from(result.data.buffer), {
            raw: {
              width: result.width,
              height: result.height,
              channels: 4,
            },
          })
            .png()
            .toFile(outputPath);

          console.log(`Successfully generated SIRDS: ${outputPath} (${result.width}x${result.height})`);
        }
      } catch (err) {
        console.error('Stereogram generation failed:', err);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
