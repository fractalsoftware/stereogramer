import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CUSTOM_PATTERNS_STORAGE_KEY,
  getSavedPatterns,
  savePattern,
  deleteSavedPattern,
  clearSavedPatterns,
  isValidPatternRecipe,
  isValidSavedPattern,
  parseAndValidateRecipeJson,
  type SavedPatternRecipe,
} from './storage.js';
import type { PatternRecipe } from '@stereogramer/core';

// Mock localStorage for test isolation
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

describe('Pattern Storage & JSON Validation', () => {
  beforeEach(() => {
    const mockStorage = new LocalStorageMock();
    vi.stubGlobal('localStorage', mockStorage);
    const mockWindow = new EventTarget();
    (mockWindow as any).localStorage = mockStorage;
    vi.stubGlobal('window', mockWindow);
  });

  describe('isValidPatternRecipe', () => {
    it('accepts valid perlin recipes', () => {
      expect(isValidPatternRecipe({ type: 'perlin', scale: 5, octaves: 3 })).toBe(true);
      expect(isValidPatternRecipe({ type: 'perlin', scale: 10, octaves: 6, persistence: 0.7 })).toBe(true);
      expect(
        isValidPatternRecipe({
          type: 'perlin',
          colorA: [0, 0, 0, 255],
          colorB: [255, 255, 255, 255],
        })
      ).toBe(true);
    });

    it('rejects invalid perlin recipes', () => {
      expect(isValidPatternRecipe({ type: 'perlin', scale: -1 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'perlin', octaves: 0 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'perlin', octaves: 9 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'perlin', colorA: [0, 0, 0] })).toBe(false); // 3-tuple
      expect(isValidPatternRecipe({ type: 'perlin', colorA: [0, 0, 0, 300] })).toBe(false); // > 255
    });

    it('accepts valid voronoi recipes', () => {
      expect(isValidPatternRecipe({ type: 'voronoi', numCells: 18 })).toBe(true);
      expect(
        isValidPatternRecipe({
          type: 'voronoi',
          numCells: 30,
          colorA: [255, 0, 0, 255],
          colorB: [0, 255, 0, 255],
        })
      ).toBe(true);
    });

    it('rejects invalid voronoi recipes', () => {
      expect(isValidPatternRecipe({ type: 'voronoi', numCells: 0 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'voronoi', numCells: 600 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'voronoi', colorA: [255, 0] })).toBe(false);
    });

    it('accepts valid checker recipes', () => {
      expect(isValidPatternRecipe({ type: 'checker', cellSize: 10 })).toBe(true);
      expect(
        isValidPatternRecipe({
          type: 'checker',
          cellSize: 20,
          colorA: [10, 20, 30, 255],
          colorB: [40, 50, 60, 255],
        })
      ).toBe(true);
    });

    it('rejects invalid checker recipes', () => {
      expect(isValidPatternRecipe({ type: 'checker', cellSize: 0 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'checker', cellSize: -5 })).toBe(false);
    });

    it('accepts valid stripes recipes', () => {
      expect(isValidPatternRecipe({ type: 'stripes', stripeWidth: 10 })).toBe(true);
      expect(
        isValidPatternRecipe({
          type: 'stripes',
          stripeWidth: 8,
          colors: [
            [255, 0, 0, 255],
            [0, 0, 255, 255],
          ],
        })
      ).toBe(true);
    });

    it('rejects invalid stripes recipes', () => {
      expect(isValidPatternRecipe({ type: 'stripes', stripeWidth: 0 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'stripes', colors: [] })).toBe(false);
    });

    it('accepts valid mosaic recipes', () => {
      expect(isValidPatternRecipe({ type: 'mosaic', cellSize: 20, dotRadius: 7 })).toBe(true);
      expect(
        isValidPatternRecipe({
          type: 'mosaic',
          cellSize: 24,
          dotRadius: 10,
          colorA: [0, 0, 0, 255],
          colorB: [255, 255, 255, 255],
        })
      ).toBe(true);
    });

    it('rejects invalid mosaic recipes', () => {
      expect(isValidPatternRecipe({ type: 'mosaic', cellSize: 0, dotRadius: 5 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'mosaic', cellSize: 20, dotRadius: -1 })).toBe(false);
      expect(isValidPatternRecipe({ type: 'mosaic', cellSize: 20, dotRadius: 30 })).toBe(false); // dotRadius > cellSize
    });

    it('rejects non-objects, null, or unsupported generator types', () => {
      expect(isValidPatternRecipe(null)).toBe(false);
      expect(isValidPatternRecipe(undefined)).toBe(false);
      expect(isValidPatternRecipe('checker')).toBe(false);
      expect(isValidPatternRecipe({})).toBe(false);
      expect(isValidPatternRecipe({ type: 'unknown_generator' })).toBe(false);
    });
  });

  describe('isValidSavedPattern', () => {
    it('accepts valid SavedPatternRecipe objects', () => {
      const valid: SavedPatternRecipe = {
        id: 'pat-12345678',
        name: 'My Custom Waves',
        createdAt: Date.now(),
        verticalPeriod: 80,
        recipe: { type: 'perlin', scale: 5, octaves: 3 },
      };
      expect(isValidSavedPattern(valid)).toBe(true);
    });

    it('rejects objects with missing or invalid fields', () => {
      expect(isValidSavedPattern(null)).toBe(false);
      expect(isValidSavedPattern({ id: '', name: 'Test', createdAt: 123, verticalPeriod: 80, recipe: { type: 'checker', cellSize: 10 } })).toBe(false);
      expect(isValidSavedPattern({ id: '1', name: '', createdAt: 123, verticalPeriod: 80, recipe: { type: 'checker', cellSize: 10 } })).toBe(false);
      expect(isValidSavedPattern({ id: '1', name: 'Test', createdAt: -1, verticalPeriod: 80, recipe: { type: 'checker', cellSize: 10 } })).toBe(false);
      expect(isValidSavedPattern({ id: '1', name: 'Test', createdAt: 123, verticalPeriod: 0, recipe: { type: 'checker', cellSize: 10 } })).toBe(false);
      expect(isValidSavedPattern({ id: '1', name: 'Test', createdAt: 123, verticalPeriod: 80, recipe: { type: 'unknown' } })).toBe(false);
    });
  });

  describe('LocalStorage CRUD Operations', () => {
    it('returns empty array when storage is empty', () => {
      expect(getSavedPatterns()).toEqual([]);
    });

    it('saves a pattern and returns the created record', () => {
      const recipe: PatternRecipe = { type: 'perlin', scale: 8, octaves: 4 };
      const saved = savePattern('Cosmic Swirl', 100, recipe);

      expect(saved.id).toMatch(/^pattern-/);
      expect(saved.name).toBe('Cosmic Swirl');
      expect(saved.verticalPeriod).toBe(100);
      expect(saved.recipe).toEqual(recipe);
      expect(typeof saved.createdAt).toBe('number');

      const all = getSavedPatterns();
      expect(all.length).toBe(1);
      expect(all[0]).toEqual(saved);
    });

    it('defaults pattern name when given an empty name', () => {
      const recipe: PatternRecipe = { type: 'stripes', stripeWidth: 12 };
      const saved = savePattern('   ', 60, recipe);
      expect(saved.name).toBe('Stripes Pattern');
    });

    it('sorts saved patterns newest first', () => {
      const p1 = savePattern('First Pattern', 80, { type: 'checker', cellSize: 10 });
      const p2 = savePattern('Second Pattern', 90, { type: 'voronoi', numCells: 15 });

      const all = getSavedPatterns();
      expect(all.length).toBe(2);
      expect(all[0]!.id).toBe(p2.id);
      expect(all[1]!.id).toBe(p1.id);
    });

    it('deletes a pattern by id', () => {
      const p1 = savePattern('To Keep', 80, { type: 'checker', cellSize: 10 });
      const p2 = savePattern('To Delete', 90, { type: 'voronoi', numCells: 15 });

      expect(getSavedPatterns().length).toBe(2);

      const deleted = deleteSavedPattern(p2.id);
      expect(deleted).toBe(true);

      const remaining = getSavedPatterns();
      expect(remaining.length).toBe(1);
      expect(remaining[0]!.id).toBe(p1.id);
    });

    it('returns false when deleting a non-existent id', () => {
      const deleted = deleteSavedPattern('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('clears all saved patterns', () => {
      savePattern('Pattern 1', 80, { type: 'checker', cellSize: 10 });
      savePattern('Pattern 2', 90, { type: 'mosaic', cellSize: 16, dotRadius: 5 });

      expect(getSavedPatterns().length).toBe(2);
      clearSavedPatterns();
      expect(getSavedPatterns()).toEqual([]);
    });

    it('handles corrupted JSON in localStorage gracefully', () => {
      localStorage.setItem(CUSTOM_PATTERNS_STORAGE_KEY, 'invalid json {[');
      expect(getSavedPatterns()).toEqual([]);
    });

    it('filters out corrupted items in array from localStorage', () => {
      const valid: SavedPatternRecipe = {
        id: 'pat-valid',
        name: 'Valid Pattern',
        createdAt: 1000,
        verticalPeriod: 80,
        recipe: { type: 'checker', cellSize: 10 },
      };
      const corrupted = { id: 'invalid', name: 'Broken' };
      localStorage.setItem(CUSTOM_PATTERNS_STORAGE_KEY, JSON.stringify([valid, corrupted]));

      const results = getSavedPatterns();
      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe('pat-valid');
    });

    it('dispatches custom event on save, delete, and clear', () => {
      const listener = vi.fn();
      window.addEventListener('stereogramer:patterns-updated', listener);

      const saved = savePattern('Event Test', 80, { type: 'checker', cellSize: 10 });
      expect(listener).toHaveBeenCalledTimes(1);

      deleteSavedPattern(saved.id);
      expect(listener).toHaveBeenCalledTimes(2);

      clearSavedPatterns();
      expect(listener).toHaveBeenCalledTimes(3);

      window.removeEventListener('stereogramer:patterns-updated', listener);
    });
  });

  describe('parseAndValidateRecipeJson', () => {
    it('parses bundled ExportedPatternRecipe JSON format', () => {
      const json = JSON.stringify({
        name: 'Sunset Tiles',
        verticalPeriod: 96,
        recipe: {
          type: 'checker',
          cellSize: 16,
          color1: [255, 100, 0, 255],
          color2: [50, 0, 100, 255],
        },
      });

      const parsed = parseAndValidateRecipeJson(json);
      expect(parsed.name).toBe('Sunset Tiles');
      expect(parsed.verticalPeriod).toBe(96);
      expect(parsed.recipe.type).toBe('checker');
      expect((parsed.recipe as any).cellSize).toBe(16);
    });

    it('parses raw PatternRecipe JSON format with fallback metadata', () => {
      const json = JSON.stringify({
        type: 'stripes',
        stripeWidth: 14,
      });

      const parsed = parseAndValidateRecipeJson(json);
      expect(parsed.name).toBe('Stripes Pattern');
      expect(parsed.verticalPeriod).toBe(80); // default fallback
      expect(parsed.recipe.type).toBe('stripes');
      expect((parsed.recipe as any).stripeWidth).toBe(14);
    });

    it('throws on invalid JSON syntax', () => {
      expect(() => parseAndValidateRecipeJson('{ invalid json')).toThrow(/Invalid JSON/);
    });

    it('throws on non-object JSON values', () => {
      expect(() => parseAndValidateRecipeJson('"a string"')).toThrow(/must be a JSON object/);
      expect(() => parseAndValidateRecipeJson('null')).toThrow(/must be a JSON object/);
      expect(() => parseAndValidateRecipeJson('[1, 2, 3]')).toThrow(/must be a JSON object/);
    });

    it('throws when schema validation fails', () => {
      const invalidRecipeJson = JSON.stringify({
        name: 'Broken',
        verticalPeriod: 80,
        recipe: {
          type: 'perlin',
          scale: -5, // invalid scale
        },
      });
      expect(() => parseAndValidateRecipeJson(invalidRecipeJson)).toThrow(/Invalid pattern recipe/);
    });

    it('throws when recipe property is completely missing in an unknown format', () => {
      const missingTypeJson = JSON.stringify({
        foo: 'bar',
      });
      expect(() => parseAndValidateRecipeJson(missingTypeJson)).toThrow(/Invalid pattern recipe/);
    });
  });
});
