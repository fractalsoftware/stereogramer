import {
  type PatternRecipe,
  type PatternGeneratorType,
  type RgbaColor,
} from '@stereogramer/core';

export const CUSTOM_PATTERNS_STORAGE_KEY = '@stereogramer:custom-patterns';

export interface SavedPatternRecipe {
  id: string;
  name: string;
  createdAt: number;
  verticalPeriod: number;
  recipe: PatternRecipe;
}

export interface ExportedPatternRecipe {
  name: string;
  verticalPeriod: number;
  recipe: PatternRecipe;
}

const VALID_GENERATOR_TYPES: Set<string> = new Set([
  'perlin',
  'voronoi',
  'checker',
  'stripes',
  'mosaic',
]);

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isRgbaColor(val: unknown): val is RgbaColor {
  return (
    Array.isArray(val) &&
    val.length === 4 &&
    val.every((n) => typeof n === 'number' && !isNaN(n) && n >= 0 && n <= 255)
  );
}

/**
 * Validates whether an unknown object strictly matches the PatternRecipe discriminated union.
 */
export function isValidPatternRecipe(obj: unknown): obj is PatternRecipe {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;

  if (typeof candidate.type !== 'string' || !VALID_GENERATOR_TYPES.has(candidate.type)) {
    return false;
  }
  if (candidate.seed !== undefined && (typeof candidate.seed !== 'number' || isNaN(candidate.seed))) {
    return false;
  }
  if (candidate.colorA !== undefined && !isRgbaColor(candidate.colorA)) {
    return false;
  }
  if (candidate.colorB !== undefined && !isRgbaColor(candidate.colorB)) {
    return false;
  }
  if ((candidate as any).color1 !== undefined && !isRgbaColor((candidate as any).color1)) {
    return false;
  }
  if ((candidate as any).color2 !== undefined && !isRgbaColor((candidate as any).color2)) {
    return false;
  }

  switch (candidate.type as PatternGeneratorType) {
    case 'perlin':
      if (candidate.scale !== undefined && (typeof candidate.scale !== 'number' || isNaN(candidate.scale) || candidate.scale <= 0)) {
        return false;
      }
      if (candidate.octaves !== undefined && (typeof candidate.octaves !== 'number' || isNaN(candidate.octaves) || candidate.octaves < 1 || candidate.octaves > 8)) {
        return false;
      }
      return true;

    case 'voronoi':
      if (candidate.numCells !== undefined && (typeof candidate.numCells !== 'number' || isNaN(candidate.numCells) || candidate.numCells <= 0 || candidate.numCells > 500)) {
        return false;
      }
      if ((candidate as any).count !== undefined && (typeof (candidate as any).count !== 'number' || isNaN((candidate as any).count) || (candidate as any).count <= 0 || (candidate as any).count > 500)) {
        return false;
      }
      if ((candidate as any).edgeThreshold !== undefined && (typeof (candidate as any).edgeThreshold !== 'number' || isNaN((candidate as any).edgeThreshold) || (candidate as any).edgeThreshold < 0)) {
        return false;
      }
      if ((candidate as any).palette !== undefined && (!Array.isArray((candidate as any).palette) || !(candidate as any).palette.every(isRgbaColor))) {
        return false;
      }
      if (candidate.metric !== undefined && !['euclidean', 'manhattan', 'chebyshev'].includes(candidate.metric as string)) {
        return false;
      }
      if (candidate.borderWidth !== undefined && (typeof candidate.borderWidth !== 'number' || isNaN(candidate.borderWidth) || candidate.borderWidth < 0)) {
        return false;
      }
      if (candidate.borderColor !== undefined && !isRgbaColor(candidate.borderColor)) {
        return false;
      }
      return true;

    case 'checker':
      if (candidate.cellSize !== undefined && (typeof candidate.cellSize !== 'number' || isNaN(candidate.cellSize) || candidate.cellSize <= 0)) {
        return false;
      }
      return true;

    case 'stripes':
      if (candidate.stripeWidth !== undefined && (typeof candidate.stripeWidth !== 'number' || isNaN(candidate.stripeWidth) || candidate.stripeWidth <= 0)) {
        return false;
      }
      if (candidate.direction !== undefined && !['horizontal', 'vertical'].includes(candidate.direction as string)) {
        return false;
      }
      if (candidate.colors !== undefined && (!Array.isArray(candidate.colors) || candidate.colors.length === 0 || !candidate.colors.every(isRgbaColor))) {
        return false;
      }
      return true;

    case 'mosaic':
      if (candidate.cellSize !== undefined && (typeof candidate.cellSize !== 'number' || isNaN(candidate.cellSize) || candidate.cellSize <= 0)) {
        return false;
      }
      if (candidate.dotRadius !== undefined && (typeof candidate.dotRadius !== 'number' || isNaN(candidate.dotRadius) || candidate.dotRadius <= 0)) {
        return false;
      }
      if (
        candidate.cellSize !== undefined &&
        candidate.dotRadius !== undefined &&
        candidate.dotRadius > candidate.cellSize
      ) {
        return false;
      }
      if (candidate.dotColor !== undefined && !isRgbaColor(candidate.dotColor)) {
        return false;
      }
      if (candidate.bgColor !== undefined && !isRgbaColor(candidate.bgColor)) {
        return false;
      }
      return true;

    default:
      return false;
  }
}

/**
 * Validates whether an unknown object matches the SavedPatternRecipe schema.
 */
export function isValidSavedPattern(obj: unknown): obj is SavedPatternRecipe {
  if (!obj || typeof obj !== 'object') return false;
  const item = obj as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    item.id.trim().length > 0 &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    typeof item.createdAt === 'number' &&
    !isNaN(item.createdAt) &&
    item.createdAt >= 0 &&
    typeof item.verticalPeriod === 'number' &&
    !isNaN(item.verticalPeriod) &&
    item.verticalPeriod >= 10 &&
    isValidPatternRecipe(item.recipe)
  );
}

function notifyPatternsUpdated(patterns: SavedPatternRecipe[]): void {
  const target: any =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : null;

  if (target && typeof target.dispatchEvent === 'function') {
    try {
      target.dispatchEvent(
        new CustomEvent('stereogramer:patterns-updated', { detail: patterns })
      );
    } catch {
      // Ignore if CustomEvent dispatch fails in non-browser env
    }
  }
}

/**
 * Retrieves all saved custom pattern recipes from localStorage.
 * Automatically filters out corrupt or schema-incompatible records.
 */
export function getSavedPatterns(): SavedPatternRecipe[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(CUSTOM_PATTERNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedPattern);
  } catch (err) {
    console.error('Failed to read saved pattern recipes from localStorage:', err);
    return [];
  }
}

/**
 * Persists a new custom pattern recipe into localStorage.
 */
export function savePattern(
  name: string,
  verticalPeriod: number,
  recipe: PatternRecipe
): SavedPatternRecipe {
  if (!isValidPatternRecipe(recipe)) {
    throw new Error('Invalid PatternRecipe provided to savePattern');
  }

  const existing = getSavedPatterns();
  const trimmedName = name.trim() || `${recipe.type.charAt(0).toUpperCase() + recipe.type.slice(1)} Pattern`;
  const sanitizedPeriod = Math.max(30, Math.min(240, Math.round(verticalPeriod || 80)));

  const newEntry: SavedPatternRecipe = {
    id: `pattern-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    name: trimmedName,
    createdAt: Date.now(),
    verticalPeriod: sanitizedPeriod,
    recipe: { ...recipe },
  };

  const updated = [newEntry, ...existing];
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(CUSTOM_PATTERNS_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to persist pattern recipes to localStorage:', err);
    }
  }

  notifyPatternsUpdated(updated);
  return newEntry;
}

/**
 * Deletes a saved pattern recipe by ID from localStorage.
 * Returns true if an item was found and removed, false otherwise.
 */
export function deleteSavedPattern(id: string): boolean {
  const existing = getSavedPatterns();
  const updated = existing.filter((p) => p.id !== id);
  if (updated.length === existing.length) {
    return false;
  }

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(CUSTOM_PATTERNS_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to delete pattern recipe from localStorage:', err);
    }
  }

  notifyPatternsUpdated(updated);
  return true;
}

/**
 * Clears all saved pattern recipes from localStorage.
 */
export function clearSavedPatterns(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(CUSTOM_PATTERNS_STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear pattern recipes from localStorage:', err);
    }
  }

  notifyPatternsUpdated([]);
}

/**
 * Parses and validates an exported Pattern Recipe JSON string.
 * Supports both full exported bundles: { name, verticalPeriod, recipe }
 * and raw PatternRecipe descriptors.
 */
export function parseAndValidateRecipeJson(jsonString: string): ExportedPatternRecipe {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('Invalid JSON: expected a non-empty string');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err.message || 'Syntax error'}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON: content must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  // Case 1: Wrapped bundle with `{ name, verticalPeriod, recipe }`
  if ('recipe' in obj) {
    if (!isValidPatternRecipe(obj.recipe)) {
      throw new Error('Invalid recipe configuration: schema validation failed');
    }
    const name = typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : `${(obj.recipe as PatternRecipe).type.charAt(0).toUpperCase() + (obj.recipe as PatternRecipe).type.slice(1)} Pattern`;
    const verticalPeriod = typeof obj.verticalPeriod === 'number' && !isNaN(obj.verticalPeriod)
      ? Math.max(30, Math.min(240, Math.round(obj.verticalPeriod)))
      : 80;

    return {
      name,
      verticalPeriod,
      recipe: obj.recipe,
    };
  }

  // Case 2: Raw PatternRecipe descriptor
  if (isValidPatternRecipe(obj)) {
    return {
      name: `${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)} Pattern`,
      verticalPeriod: 80,
      recipe: obj,
    };
  }

  throw new Error('Invalid recipe configuration: JSON object does not conform to PatternRecipe schema');
}
