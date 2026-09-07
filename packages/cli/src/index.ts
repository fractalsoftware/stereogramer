import { Command } from 'commander';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import {
  generateSirds,
  generateTexturedStereogram,
  createSphereDepthMap,
  createBoxDepthMap,
  createSlantedPlaneDepthMap,
  type DepthMap,
  type RgbaImage,
  type ConvergenceMode,
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
    .option('-o, --output <path>', 'Output file path')
    .option('-w, --width <pixels>', 'Image width in pixels')
    .option('-h, --height <pixels>', 'Image height in pixels')
    .option('-s, --separation <pixels>', 'Base pattern separation distance in pixels')
    .option('-f, --depth-factor <factor>', 'Depth intensity factor [0.0 - 1.0]', '1.0')
    .option('-m, --mode <mode>', 'Convergence mode: parallel or cross', 'parallel')
    .option('--dot-scale <scale>', 'Pixel block dimension of dots (SIRDS only)', '1')
    .option('--shape <shape>', 'Procedural depth shape (sphere, box, slanted)', 'sphere')
    .action(async (opts) => {
      try {
        const depthFactor = Math.max(0, Math.min(1, parseFloat(opts.depthFactor) || 1.0));
        const dotScale = Math.max(1, parseInt(opts.dotScale, 10) || 1);
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

          const floatData = new Float32Array(info.width * info.height);
          for (let i = 0; i < data.length; i++) {
            floatData[i] = data[i]! / 255.0;
          }

          depthMap = { width: info.width, height: info.height, data: floatData };
        } else {
          // Generate procedural depth map
          const width = Math.max(1, parseInt(opts.width, 10) || 800);
          const height = Math.max(1, parseInt(opts.height, 10) || 600);
          const shape = (opts.shape || 'sphere').toLowerCase();
          if (shape === 'box') {
            depthMap = createBoxDepthMap(width, height);
          } else if (shape === 'slanted') {
            depthMap = createSlantedPlaneDepthMap(width, height);
          } else {
            depthMap = createSphereDepthMap(width, height);
          }
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
          });

          await sharp(result.data, {
            raw: {
              width: result.width,
              height: result.height,
              channels: 4,
            },
          })
            .png()
            .toFile(outputPath);

          console.log(
            `Successfully generated Textured SIS: ${outputPath} (${result.width}x${result.height})`
          );
        } else {
          // SIRDS Mode
          const effectiveSeparation = separation ?? Math.round(depthMap.width / 8);
          console.log(
            `Rendering SIRDS (${depthMap.width}x${depthMap.height}, mode: ${mode}, separation: ${effectiveSeparation}px)...`
          );

          const sirds = generateSirds(depthMap, {
            convergenceMode: mode,
            patternSeparation: separation,
            depthFactor,
            dotScale,
          });

          await sharp(sirds.data, {
            raw: {
              width: sirds.width,
              height: sirds.height,
              channels: 4,
            },
          })
            .png()
            .toFile(outputPath);

          console.log(`Successfully generated SIRDS: ${outputPath} (${sirds.width}x${sirds.height})`);
        }
      } catch (err) {
        console.error('Error generating stereogram:', err);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
