export {
  PatternStudioModal,
  DEFAULT_RECIPES,
  TESTBED_WIDTH,
  TESTBED_HEIGHT,
  getBenchmarkSphereDepthMap,
  resampleDepthMap,
  calculateTestbedSeparation,
  generateTestbedStereogramImage,
  rgbaToHex,
  hexToRgba,
  type PatternStudioModalProps,
} from './PatternStudioModal.js';

export {
  CUSTOM_PATTERNS_STORAGE_KEY,
  getSavedPatterns,
  savePattern,
  deleteSavedPattern,
  clearSavedPatterns,
  isValidPatternRecipe,
  isValidSavedPattern,
  parseAndValidateRecipeJson,
  type SavedPatternRecipe,
  type ExportedPatternRecipe,
} from './storage.js';

