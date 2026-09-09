export interface GridConfig {
  rows: number;
  cols: number;
  pitch: number;
  dotRadius: number;
  substrateRadius: number;
  disparityOffset: number;
  colors: {
    background: string;
    cyanLight: string;
    cyanBase: string;
    magentaLight: string;
    magentaBase: string;
    substrate: string;
  };
  pattern: string[];
}

export const GRID_CONFIG: GridConfig;

export function generateSvg(options?: {
  size?: number;
  rx?: number;
  safeZoneScale?: number;
}): string;

export function generateFaviconSvg(): string;
export function generateMaskableSvg(): string;
export function generateStandardSvg(): string;

export interface IcoImageDescriptor {
  width: number;
  height: number;
  buffer: Buffer;
}

export function createIco(images: IcoImageDescriptor[]): Buffer;

export function generateAllIcons(targetDir?: string): Promise<Record<string, string>>;
