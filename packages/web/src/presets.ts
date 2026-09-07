import {
  type DepthMap,
  type RgbaImage,
  createTorusDepthMap,
  createHeartDepthMap,
  generatePerlinTexture,
  generateVoronoiTexture,
  generateCheckerboardTexture,
} from '@stereogramer/core';

export type SampleDepthName = 'shark' | 'teapot' | 'ring' | 'heart' | 'skull';

export interface DepthPresetInfo {
  id: SampleDepthName;
  name: string;
  description: string;
  icon: string;
  generate: (width: number, height: number) => DepthMap;
}

export type TexturePresetName = 'perlin' | 'voronoi' | 'checker' | 'stripes' | 'mosaic';

export interface TexturePresetInfo {
  id: TexturePresetName;
  name: string;
  description: string;
  generate: (width: number, height: number) => RgbaImage;
}

/**
 * Procedural 3D Shark depth map:
 * Streamlined body, dorsal fin, pectoral fins, and crescent caudal tail.
 */
function createSharkDepthMap(width: number, height: number): DepthMap {
  const data = new Float32Array(width * height);
  const cx = width * 0.48;
  const cy = height * 0.52;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxZ = 0.0;

      // 1. Torpedo Main Body
      const bx = (x - cx) / (width * 0.32);
      const by = (y - cy) / (height * 0.16);
      const bDist2 = bx * bx + by * by;
      if (bDist2 <= 1.0) {
        const bodyZ = Math.sqrt(1.0 - bDist2) * 0.88;
        if (bodyZ > maxZ) maxZ = bodyZ;
      }

      // 2. Dorsal Fin (triangular fin on top-center)
      const dfX = (x - (cx - width * 0.04)) / (width * 0.08);
      const dfY = (y - (cy - height * 0.12)) / (height * 0.18);
      if (dfY <= 0 && dfY >= -1.0) {
        const span = 0.5 * (1.0 + dfY); // narrows toward tip
        if (Math.abs(dfX - dfY * 0.3) <= span) {
          const finZ = (1.0 + dfY) * 0.75;
          if (finZ > maxZ) maxZ = finZ;
        }
      }

      // 3. Caudal Tail Fin (crescent fork at right)
      const tailX = (x - (cx + width * 0.32)) / (width * 0.1);
      const tailY = (y - cy) / (height * 0.28);
      if (tailX >= 0 && tailX <= 1.0) {
        const fork = Math.abs(tailY);
        if (fork <= 1.0 && fork >= tailX * 0.3) {
          const tailZ = (1.0 - tailX * 0.5) * (1.0 - fork * 0.4) * 0.7;
          if (tailZ > maxZ) maxZ = tailZ;
        }
      }

      // 4. Pectoral Fin (swept fin on bottom left)
      const pfX = (x - (cx - width * 0.12)) / (width * 0.12);
      const pfY = (y - (cy + height * 0.12)) / (height * 0.14);
      if (pfY >= 0 && pfY <= 1.0) {
        const pSpan = 0.4 * (1.0 - pfY);
        if (Math.abs(pfX - pfY * 0.6) <= pSpan) {
          const pFinZ = (1.0 - pfY * 0.5) * 0.72;
          if (pFinZ > maxZ) maxZ = pFinZ;
        }
      }

      data[y * width + x] = Math.max(0.02, maxZ);
    }
  }

  return { width, height, data };
}

/**
 * Procedural Utah Teapot depth map:
 * Bulbous body, arched handle, curved spout, lid and knob.
 */
function createTeapotDepthMap(width: number, height: number): DepthMap {
  const data = new Float32Array(width * height);
  const cx = width * 0.48;
  const cy = height * 0.55;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxZ = 0.0;

      // 1. Teapot Main Body (squashed ellipsoid)
      const bx = (x - cx) / (width * 0.24);
      const by = (y - cy) / (height * 0.22);
      const bDist2 = bx * bx + by * by;
      if (bDist2 <= 1.0) {
        const bodyZ = Math.sqrt(1.0 - bDist2) * 0.92;
        if (bodyZ > maxZ) maxZ = bodyZ;
      }

      // 2. Lid (smaller dome on top)
      const lx = (x - cx) / (width * 0.16);
      const ly = (y - (cy - height * 0.20)) / (height * 0.08);
      const lDist2 = lx * lx + ly * ly;
      if (lDist2 <= 1.0 && ly <= 0.2) {
        const lidZ = Math.sqrt(Math.max(0, 1.0 - lDist2)) * 0.85;
        if (lidZ > maxZ) maxZ = lidZ;
      }

      // 3. Lid Knob
      const kx = (x - cx) / (width * 0.035);
      const ky = (y - (cy - height * 0.27)) / (height * 0.035);
      const kDist2 = kx * kx + ky * ky;
      if (kDist2 <= 1.0) {
        const knobZ = Math.sqrt(1.0 - kDist2) * 0.95;
        if (knobZ > maxZ) maxZ = knobZ;
      }

      // 4. Handle (arched loop on left)
      const hx = (x - (cx - width * 0.26)) / (width * 0.12);
      const hy = (y - (cy - height * 0.02)) / (height * 0.18);
      const hDist = Math.sqrt(hx * hx + hy * hy);
      if (hDist >= 0.65 && hDist <= 1.0 && hx < 0) {
        const handleZ = Math.sin((hDist - 0.65) / 0.35 * Math.PI) * 0.7;
        if (handleZ > maxZ) maxZ = handleZ;
      }

      // 5. Spout (curved tubular horn on right)
      const sx = (x - (cx + width * 0.22)) / (width * 0.18);
      const sy = (y - (cy - height * 0.04)) / (height * 0.18);
      if (sx >= 0 && sx <= 1.0 && sy >= -0.8 && sy <= 0.4) {
        const spoutCenterY = -Math.pow(sx, 1.4) * 0.7;
        const spoutDist = Math.abs(sy - spoutCenterY);
        const spoutThickness = 0.18 * (1.0 - sx * 0.4);
        if (spoutDist <= spoutThickness) {
          const spoutZ = Math.cos((spoutDist / spoutThickness) * (Math.PI / 2)) * 0.78;
          if (spoutZ > maxZ) maxZ = spoutZ;
        }
      }

      data[y * width + x] = Math.max(0.02, maxZ);
    }
  }

  return { width, height, data };
}

/**
 * Procedural Interlocking 3D Rings depth map:
 * Two interwoven toruses with depth layer overlap.
 */
function createInterlockingRingsDepthMap(width: number, height: number): DepthMap {
  const data = new Float32Array(width * height);
  const cx1 = width * 0.40;
  const cy1 = height * 0.50;
  const cx2 = width * 0.60;
  const cy2 = height * 0.50;

  const R = Math.min(width, height) * 0.24; // major radius
  const r = Math.min(width, height) * 0.08; // minor tube radius

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Ring 1 (Left)
      const d1 = Math.sqrt((x - cx1) ** 2 + (y - cy1) ** 2);
      const tubeDist1 = Math.abs(d1 - R);
      let z1 = 0.0;
      if (tubeDist1 < r) {
        z1 = Math.sqrt(r * r - tubeDist1 * tubeDist1) / r * 0.85;
      }

      // Ring 2 (Right)
      const d2 = Math.sqrt((x - cx2) ** 2 + (y - cy2) ** 2);
      const tubeDist2 = Math.abs(d2 - R);
      let z2 = 0.0;
      if (tubeDist2 < r) {
        z2 = Math.sqrt(r * r - tubeDist2 * tubeDist2) / r * 0.85;
      }

      // Interweaving: Ring 1 passes over Ring 2 on top, under at bottom
      let finalZ = 0.0;
      if (z1 > 0 && z2 > 0) {
        finalZ = y < cy1 ? z1 : z2;
      } else {
        finalZ = Math.max(z1, z2);
      }

      data[y * width + x] = Math.max(0.02, finalZ);
    }
  }

  return { width, height, data };
}

/**
 * Procedural 3D Stylized Skull depth map:
 * Rounded cranium, hollow eye sockets, nasal cavity, cheekbones, and jaw.
 */
function createSkullDepthMap(width: number, height: number): DepthMap {
  const data = new Float32Array(width * height);
  const cx = width * 0.50;
  const cy = height * 0.48;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let z = 0.0;

      // 1. Cranium (large upper sphere)
      const craniumDx = (x - cx) / (width * 0.22);
      const craniumDy = (y - (cy - height * 0.08)) / (height * 0.22);
      const cDist2 = craniumDx * craniumDx + craniumDy * craniumDy;
      if (cDist2 <= 1.0) {
        z = Math.sqrt(1.0 - cDist2) * 0.95;
      }

      // 2. Maxilla / Jaw (lower narrower block)
      const jawDx = (x - cx) / (width * 0.14);
      const jawDy = (y - (cy + height * 0.16)) / (height * 0.12);
      const jDist2 = jawDx * jawDx + jawDy * jawDy;
      if (jDist2 <= 1.0) {
        const jawZ = Math.sqrt(1.0 - jDist2) * 0.78;
        if (jawZ > z) z = jawZ;
      }

      // 3. Hollow Eye Sockets (deep cavities carved out)
      const eyeY = cy - height * 0.02;
      const leftEyeX = cx - width * 0.08;
      const rightEyeX = cx + width * 0.08;
      const eyeR = width * 0.05;

      const dLeftEye = Math.hypot(x - leftEyeX, y - eyeY);
      const dRightEye = Math.hypot(x - rightEyeX, y - eyeY);
      if (dLeftEye < eyeR) {
        const cavity = (1.0 - dLeftEye / eyeR);
        z = Math.max(0.05, z - cavity * 0.85);
      }
      if (dRightEye < eyeR) {
        const cavity = (1.0 - dRightEye / eyeR);
        z = Math.max(0.05, z - cavity * 0.85);
      }

      // 4. Nasal Cavity (inverted triangle below eyes)
      const noseY = cy + height * 0.07;
      const noseDx = Math.abs(x - cx) / (width * 0.035);
      const noseDy = (y - noseY) / (height * 0.06);
      if (noseDy >= 0 && noseDy <= 1.0 && noseDx <= (1.0 - noseDy * 0.6)) {
        z = Math.max(0.05, z - 0.55);
      }

      data[y * width + x] = Math.max(0.02, z);
    }
  }

  return { width, height, data };
}

export const SAMPLE_DEPTH_MAPS: DepthPresetInfo[] = [
  {
    id: 'shark',
    name: '3D Great White Shark',
    description: 'Streamlined predator with dorsal fin and crescent tail',
    icon: '🦈',
    generate: createSharkDepthMap,
  },
  {
    id: 'teapot',
    name: 'Utah Teapot',
    description: 'Computer graphics classic with spout, lid, and handle',
    icon: '🫖',
    generate: createTeapotDepthMap,
  },
  {
    id: 'ring',
    name: 'Interlocking Rings',
    description: 'Interwoven 3D toruses with crossing depth layers',
    icon: '🪐',
    generate: createInterlockingRingsDepthMap,
  },
  {
    id: 'heart',
    name: 'Puffy 3D Heart',
    description: 'Smooth volumetric Valentine cardioid',
    icon: '❤️',
    generate: (w, h) => createHeartDepthMap(w, h),
  },
  {
    id: 'skull',
    name: 'Stylized 3D Skull',
    description: 'Curved cranium with carved eye cavities and jawline',
    icon: '💀',
    generate: createSkullDepthMap,
  },
];

export const TEXTURE_PRESETS: TexturePresetInfo[] = [
  {
    id: 'perlin',
    name: 'Perlin Cloud Waves',
    description: 'Seamless procedural fractal gradient noise',
    generate: (w, h) => generatePerlinTexture(w, h, { scale: 5, octaves: 3 }),
  },
  {
    id: 'voronoi',
    name: 'Voronoi Organic Cells',
    description: 'Seamless cellular tessellation with boundary edges',
    generate: (w, h) => generateVoronoiTexture(w, h, { numCells: 18 }),
  },
  {
    id: 'checker',
    name: 'Geometric Tiles',
    description: 'High-contrast alternating cyan & slate squares',
    generate: (w, h) => generateCheckerboardTexture(w, h, 10),
  },
  {
    id: 'stripes',
    name: 'Color Spectrum Bands',
    description: 'Vibrant 4-tone vertical color stripes',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
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
      return { width: w, height: h, data };
    },
  },
  {
    id: 'mosaic',
    name: 'Dot Mosaic',
    description: 'Circular polka-dot grid with contrasting background',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
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
      return { width: w, height: h, data };
    },
  },
];
