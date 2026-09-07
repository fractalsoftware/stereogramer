import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import sharp from 'sharp';

interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

function runCli(
  args: string[],
  options: {
    stdin?: Buffer | string;
    cwd?: string;
  } = {}
): Promise<RunResult> {
  const cliPath = path.resolve(__dirname, '../dist/index.js');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr,
      });
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

describe('Stereogramer CLI Subprocess Integration', () => {
  let tmpDir: string;
  let sampleDepthPath: string;
  let samplePatternPath: string;
  let corruptFilePath: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stereogramer-cli-test-'));

    // Create a 200x150 sample grayscale depth image
    sampleDepthPath = path.join(tmpDir, 'sample-depth.png');
    await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .grayscale()
      .png()
      .toFile(sampleDepthPath);

    // Create a 30x30 sample pattern tile
    samplePatternPath = path.join(tmpDir, 'sample-pattern.png');
    await sharp({
      create: {
        width: 30,
        height: 30,
        channels: 4,
        background: { r: 56, g: 189, b: 248, alpha: 1 },
      },
    })
      .png()
      .toFile(samplePatternPath);

    // Create a corrupted image file
    corruptFilePath = path.join(tmpDir, 'corrupt.png');
    await fs.writeFile(corruptFilePath, Buffer.from('NOT_A_VALID_IMAGE_HEADER_123456'));
  });

  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Procedural Primitives and Text Extrusion', () => {
    it('generates SIRDS with procedural torus primitive', async () => {
      const outPath = path.join(tmpDir, 'torus.png');
      const res = await runCli(['--primitive', 'torus', '-w', '200', '-h', '150', '-o', outPath]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(150);
    });

    it('generates SIRDS from 3D extruded text with bevel and blur', async () => {
      const outPath = path.join(tmpDir, 'text.png');
      const res = await runCli([
        '--text',
        'HELLO',
        '--bevel',
        '3',
        '--blur',
        '1.5',
        '-w',
        '240',
        '-h',
        '160',
        '-o',
        outPath,
      ]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(240);
      expect(meta.height).toBe(160);
    });

    it('generates Textured SIS using an input depth file and pattern file', async () => {
      const outPath = path.join(tmpDir, 'textured.png');
      const res = await runCli([
        '-d',
        sampleDepthPath,
        '-p',
        samplePatternPath,
        '-o',
        outPath,
      ]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(150);
    });
  });

  describe('Multi-Format Support (PNG, JPEG, WebP, AVIF)', () => {
    it('outputs WebP image inferred from file extension', async () => {
      const outPath = path.join(tmpDir, 'output.webp');
      const res = await runCli(['--primitive', 'sphere', '-w', '160', '-h', '120', '-o', outPath]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(160);
      expect(meta.height).toBe(120);
    });

    it('outputs JPEG image with explicit --format and --quality', async () => {
      const outPath = path.join(tmpDir, 'output.jpg');
      const res = await runCli([
        '--primitive',
        'cone',
        '-w',
        '160',
        '-h',
        '120',
        '--format',
        'jpeg',
        '--quality',
        '85',
        '-o',
        outPath,
      ]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(160);
      expect(meta.height).toBe(120);
    });

    it('outputs AVIF image with explicit --format', async () => {
      const outPath = path.join(tmpDir, 'output.avif');
      const res = await runCli([
        '--primitive',
        'pyramid',
        '-w',
        '160',
        '-h',
        '120',
        '--format',
        'avif',
        '--quality',
        '75',
        '-o',
        outPath,
      ]);

      expect(res.code).toBe(0);
      const meta = await sharp(outPath).metadata();
      expect(['avif', 'heif']).toContain(meta.format);
      expect(meta.width).toBe(160);
      expect(meta.height).toBe(120);
    });
  });

  describe('Unix Pipes (stdin -> CLI -> stdout)', () => {
    it('pipes depth map via stdin and writes SIRDS to stdout', async () => {
      const depthBuffer = await fs.readFile(sampleDepthPath);

      const res = await runCli(['-d', '-', '-o', '-'], { stdin: depthBuffer });

      expect(res.code).toBe(0);
      expect(res.stdout.length).toBeGreaterThan(0);

      // Verify stdout contains a valid PNG image
      const meta = await sharp(res.stdout).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(150);
    });

    it('pipes depth map via stdin with pattern flag to stdout as WebP', async () => {
      const depthBuffer = await fs.readFile(sampleDepthPath);

      const res = await runCli(
        ['-d', '-', '-p', samplePatternPath, '--format', 'webp', '-o', '-'],
        { stdin: depthBuffer }
      );

      expect(res.code).toBe(0);
      expect(res.stdout.length).toBeGreaterThan(0);

      const meta = await sharp(res.stdout).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(150);
    });
  });

  describe('Error Handling and Non-Zero Exit Codes', () => {
    it('exits with code 1 when depth file does not exist', async () => {
      const res = await runCli(['-d', path.join(tmpDir, 'nonexistent.png')]);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Depth map file not found');
    });

    it('exits with code 1 when pattern file does not exist', async () => {
      const res = await runCli([
        '--primitive',
        'sphere',
        '-p',
        path.join(tmpDir, 'nonexistent.png'),
      ]);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Pattern image file not found');
    });

    it('exits with code 1 when input depth file is corrupt', async () => {
      const res = await runCli(['-d', corruptFilePath]);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Corrupt or unsupported depth map file');
    });

    it('exits with code 1 when stdin input is corrupt', async () => {
      const res = await runCli(['-d', '-', '-o', '-'], {
        stdin: Buffer.from('NOT_A_VALID_IMAGE_STREAM'),
      });
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Corrupt or unsupported input depth image');
    });

    it('exits with code 1 when stdin input is empty', async () => {
      const res = await runCli(['-d', '-', '-o', '-'], { stdin: Buffer.alloc(0) });
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('No depth map data received on stdin');
    });

    it('exits with code 1 for invalid primitive name', async () => {
      const res = await runCli(['--primitive', 'octagon']);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Invalid primitive "octagon"');
    });

    it('exits with code 1 for invalid convergence mode', async () => {
      const res = await runCli(['--mode', 'diagonal']);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Invalid convergence mode "diagonal"');
    });

    it('exits with code 1 for invalid output format', async () => {
      const res = await runCli(['--primitive', 'sphere', '--format', 'bmp', '-o', '-']);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Unsupported output format "bmp"');
    });
  });
});
