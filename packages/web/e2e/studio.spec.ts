import { test, expect } from '@playwright/test';

test.describe('Stereogramer Web Studio E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the main autostereogram canvas to be mounted
    await page.waitForSelector('.canvas-wrapper canvas');
  });

  test('renders initial stereogram studio with canvas and controls', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Stereogramer Studio');

    const canvas = page.locator('.canvas-wrapper canvas');
    await expect(canvas).toBeVisible();

    // Verify canvas dimensions
    const width = await canvas.getAttribute('width');
    const height = await canvas.getAttribute('height');
    expect(width).toBe('640');
    expect(height).toBe('480');

    // Guide dots overlay should be present initially
    const guideDots = page.locator('.guide-dots-overlay');
    await expect(guideDots).toBeVisible();

    // Verify side-by-side layout: viewport is positioned to the right of sidebar, not stacked below
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    const viewportBox = await page.locator('.viewport-container').boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(viewportBox).not.toBeNull();
    expect(viewportBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
    expect(viewportBox!.y).toBeLessThan(sidebarBox!.y + 100);
  });

  test('opens preset drawer and selects a curated depth model and texture', async ({ page }) => {
    // Open preset drawer
    await page.click('#preset-drawer-trigger');

    const drawer = page.locator('.drawer-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Preset Library & Textures');

    // Click Utah Teapot preset
    const teapotCard = page.locator('.preset-card', { hasText: 'Utah Teapot' });
    await expect(teapotCard).toBeVisible();
    await teapotCard.click();

    // Drawer should close after selection
    await expect(page.locator('.drawer-panel')).not.toBeVisible();

    // Verify active depth model reflects Teapot
    const depthPresetSelect = page.locator('#depth-preset-select');
    await expect(depthPresetSelect).toHaveValue('teapot');
  });

  test('switches stereogram type to SIRDS, changes color palette and dot scale', async ({ page }) => {
    // Switch to SIRDS
    const sirdsTab = page.locator('.mode-tab', { hasText: 'Random Dots (SIRDS)' });
    await sirdsTab.click();
    await expect(sirdsTab).toHaveClass(/active/);

    // Change SIRDS color palette to Full RGB
    const paletteSelect = page.locator('#sirds-palette-select');
    await expect(paletteSelect).toBeVisible();
    await paletteSelect.selectOption('rgb');
    await expect(paletteSelect).toHaveValue('rgb');

    // Adjust Dot Scale to 2px for Retina display
    const dotScaleRange = page.locator('#dot-scale-range');
    await dotScaleRange.fill('2');
    await expect(page.locator('label[for="dot-scale-range"] .val')).toHaveText('2px');
  });

  test('adjusts convergence mode and separation slider', async ({ page }) => {
    // Toggle cross-eyed convergence mode
    const crossTab = page.locator('.mode-tab', { hasText: 'Cross-eyed' });
    await crossTab.click();
    await expect(crossTab).toHaveClass(/active/);
    await expect(page.locator('.viewing-tip')).toContainText('Viewing Tip (Cross-eyed)');

    // Adjust pattern separation slider
    const sepRange = page.locator('#separation-range');
    await sepRange.fill('90');
    await expect(page.locator('label[for="separation-range"] .val')).toHaveText('90px');
  });

  test('supports zoom and reset view interactions', async ({ page }) => {
    const zoomIndicator = page.locator('.zoom-indicator');
    await expect(zoomIndicator).toHaveText('100%');

    // Click zoom in button
    const zoomInBtn = page.locator('.toolbar-btn', { hasText: '➕' });
    await zoomInBtn.click();
    await expect(zoomIndicator).toHaveText('120%');

    // Click reset view button
    const resetBtn = page.locator('.toolbar-btn', { hasText: 'Reset View' });
    await resetBtn.click();
    await expect(zoomIndicator).toHaveText('100%');
  });

  test('triggers clean high-resolution download exports', async ({ page }) => {
    // Test PNG download
    const downloadPromisePng = page.waitForEvent('download');
    await page.click('#download-png-btn');
    const downloadPng = await downloadPromisePng;
    expect(downloadPng.suggestedFilename()).toMatch(/stereogram\.png$/);

    // Test JPEG download
    const downloadPromiseJpeg = page.waitForEvent('download');
    await page.click('#download-jpeg-btn');
    const downloadJpeg = await downloadPromiseJpeg;
    expect(downloadJpeg.suggestedFilename()).toMatch(/stereogram\.jpg$/);
  });

  test.describe('AI Photo Depth Estimation', () => {
    // Base64-encoded 10x10 RGB test image
    const TEST_IMAGE_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGVUAoAABYnQf5/X1XfAAAAABJRU5ErkJggg==';
    const TEST_IMAGE_BUFFER = Buffer.from(TEST_IMAGE_BASE64, 'base64');

    test('switches to AI Photo tab and verifies dropzone and responsive layout', async ({ page }) => {
      await page.goto('/?syntheticDepth=true');
      await page.waitForSelector('.canvas-wrapper canvas');

      // Click AI Photo tab in Depth Map Source selector
      const aiTab = page.locator('.mode-tab', { hasText: 'AI Photo' });
      await expect(aiTab).toBeVisible();
      await aiTab.click();
      await expect(aiTab).toHaveClass(/active/);

      // Dropzone should be visible
      const dropzone = page.locator('#ai-photo-dropzone');
      await expect(dropzone).toBeVisible();
      await expect(dropzone).toContainText('Upload 2D Photo');
      await expect(dropzone).toContainText('Drop JPEG, PNG, or WebP photo');

      // Side-by-side flex layout preserved without horizontal regression
      const sidebarBox = await page.locator('.sidebar').boundingBox();
      const viewportBox = await page.locator('.viewport-container').boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(viewportBox).not.toBeNull();
      expect(viewportBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
    });

    test('uploads 2D photo, asserts progress states, and verifies canvas updates', async ({ page }) => {
      // Navigate with synthetic progress simulation
      await page.goto('/?syntheticDepth=true&syntheticDelay=80');
      await page.waitForSelector('.canvas-wrapper canvas');

      // Capture initial canvas dataURLs
      const initialDepthData = await page.evaluate(() => {
        const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });
      const initialStereogramData = await page.evaluate(() => {
        const canvas = document.querySelector('.canvas-wrapper canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });

      // Switch to AI Photo tab
      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();

      // Upload test image fixture via input file chooser
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'sunset-portrait.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      // Progress banner should appear immediately
      const progressBanner = page.locator('#ai-progress-banner');
      await expect(progressBanner).toBeVisible();

      const statusText = page.locator('#ai-status-text');
      await expect(statusText).toBeVisible();

      // Verify progress text reaches Complete
      await expect(statusText).toHaveText('Complete', { timeout: 10000 });
      await expect(page.locator('#ai-progress-bar-fill')).toHaveCSS('width', /.+/);

      // Verify loaded photo preview card
      const photoCard = page.locator('#ai-photo-card');
      await expect(photoCard).toBeVisible();
      await expect(photoCard.locator('.dropzone-filename')).toHaveText('sunset-portrait.png');
      await expect(photoCard.locator('.dropzone-dim')).toHaveText('10 × 10');
      await expect(photoCard.locator('#clear-ai-photo-btn')).toBeVisible();

      // Verify Reference Previews "Depth Map" canvas has updated with the estimated depth
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }, { timeout: 5000 }).not.toBe(initialDepthData);

      // Verify main stereogram canvas has updated
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.canvas-wrapper canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }, { timeout: 5000 }).not.toBe(initialStereogramData);
    });

    test('reactively applies Invert Depth, Bevel Extrusion, and Blur without re-inference', async ({ page }) => {
      await page.goto('/?syntheticDepth=true');
      await page.waitForSelector('.canvas-wrapper canvas');

      // Switch to AI Photo tab and upload
      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'mountain.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      await expect(page.locator('#ai-status-text')).toHaveText('Complete', { timeout: 10000 });

      const baseDepthData = await page.evaluate(() => {
        const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });

      // 1. Toggle Invert Depth Polarity
      const invertCheckbox = page.locator('#ai-invert-depth');
      await expect(invertCheckbox).toBeVisible();
      await invertCheckbox.check();

      // Depth preview canvas should update to inverted representation
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }).not.toBe(baseDepthData);

      // Verify no re-inference was triggered (status remains Complete)
      await expect(page.locator('#ai-status-text')).toHaveText('Complete');

      // 2. Adjust Bevel Extrusion slider
      const invertedDepthData = await page.evaluate(() => {
        const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });

      const bevelRange = page.locator('#bevel-range');
      await bevelRange.fill('8');
      await expect(page.locator('label[for="bevel-range"] .val')).toHaveText('8px');

      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }).not.toBe(invertedDepthData);

      // 3. Adjust Gaussian Blur slider
      const beveledDepthData = await page.evaluate(() => {
        const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });

      const blurRange = page.locator('#blur-range');
      await blurRange.fill('5');
      await expect(page.locator('label[for="blur-range"] .val')).toHaveText('5.0px');

      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }).not.toBe(beveledDepthData);
    });

    test('cancels in-flight inference and reverts cleanly', async ({ page }) => {
      // Navigate with a long synthetic delay so cancel button can be clicked
      await page.goto('/?syntheticDepth=true&syntheticDelay=500');
      await page.waitForSelector('.canvas-wrapper canvas');

      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();

      // Upload photo to trigger inference
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'large-photo.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      // Cancel button should be visible during estimation
      const cancelBtn = page.locator('#cancel-ai-inference-btn');
      await expect(cancelBtn).toBeVisible();

      // Click Cancel
      await cancelBtn.click();

      // Cancel button and progress banner should disappear
      await expect(cancelBtn).not.toBeVisible();
      await expect(page.locator('#ai-progress-banner')).not.toBeVisible();

      // Dropzone should be restored
      await expect(page.locator('#ai-photo-dropzone')).toBeVisible();

      // Main canvas remains valid
      const canvas = page.locator('.canvas-wrapper canvas');
      await expect(canvas).toBeVisible();
    });

    test('clears active AI photo and reverts depth map to preset', async ({ page }) => {
      await page.goto('/?syntheticDepth=true');
      await page.waitForSelector('.canvas-wrapper canvas');

      // Get preset depth dataURL
      const presetDepthData = await page.evaluate(() => {
        const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
        return canvas ? canvas.toDataURL() : null;
      });

      // Switch to AI Photo tab and upload
      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'to-clear.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      await expect(page.locator('#ai-status-text')).toHaveText('Complete', { timeout: 10000 });
      await expect(page.locator('#ai-photo-card')).toBeVisible();

      // Click clear button (✕)
      await page.locator('#clear-ai-photo-btn').click();

      // Photo card removed and dropzone restored
      await expect(page.locator('#ai-photo-card')).not.toBeVisible();
      await expect(page.locator('#ai-photo-dropzone')).toBeVisible();

      // Depth preview canvas reverts back to preset
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const canvas = document.querySelector('.previews-row .preview-card:first-child canvas') as HTMLCanvasElement;
          return canvas ? canvas.toDataURL() : null;
        });
      }).toBe(presetDepthData);
    });

    test('provides accessible ARIA attributes and screen-reader announcements during inference', async ({ page }) => {
      await page.goto('/?syntheticDepth=true&syntheticDelay=150');
      await page.waitForSelector('.canvas-wrapper canvas');

      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'portrait.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      // Banner should have aria-live and role="status"
      const progressBanner = page.locator('#ai-progress-banner');
      await expect(progressBanner).toBeVisible();
      await expect(progressBanner).toHaveAttribute('aria-live', 'polite');
      await expect(progressBanner).toHaveAttribute('role', 'status');

      // Progress bar track should have role="progressbar" and numeric bounds
      const progressBar = page.locator('#ai-progress-bar');
      await expect(progressBar).toBeVisible();
      await expect(progressBar).toHaveAttribute('role', 'progressbar');
      await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      await expect(progressBar).toHaveAttribute('aria-valuemax', '100');
      await expect(progressBar).toHaveAttribute('aria-label', 'Depth estimation progress');

      // Wait for completion
      await expect(page.locator('#ai-status-text')).toHaveText('Complete', { timeout: 10000 });
      await expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });

    test('renders error banner with Retry and Use Presets recovery actions on failure', async ({ page }) => {
      // Simulate inference failure
      await page.goto('/?simulateError=true');
      await page.waitForSelector('.canvas-wrapper canvas');

      await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();
      await page.locator('#ai-photo-input').setInputFiles({
        name: 'failing.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      // Error banner should appear with alert role and action buttons
      const errorBanner = page.locator('#ai-error-banner');
      await expect(errorBanner).toBeVisible();
      await expect(errorBanner).toHaveAttribute('role', 'alert');
      await expect(errorBanner).toContainText('WebGPU out of memory or device lost');

      const retryBtn = page.locator('#ai-retry-btn');
      const presetsBtn = page.locator('#ai-use-presets-btn');
      await expect(retryBtn).toBeVisible();
      await expect(presetsBtn).toBeVisible();

      // Click "Use Presets" recovery button
      await presetsBtn.click();

      // Error banner should be dismissed and depth source reverted to preset
      await expect(errorBanner).not.toBeVisible();
      const presetTab = page.locator('.mode-tab', { hasText: 'Presets' });
      await expect(presetTab).toHaveClass(/active/);
    });

    test('supports Estimate 3D Depth (AI) toggle switch inside Upload tab', async ({ page }) => {
      await page.goto('/?syntheticDepth=true');
      await page.waitForSelector('.canvas-wrapper canvas');

      // Switch to Upload Depth Map tab
      const uploadTab = page.locator('.mode-tab', { hasText: 'Upload' });
      await uploadTab.click();
      await expect(uploadTab).toHaveClass(/active/);

      // Verify AI Depth estimation toggle exists with descriptive tooltip
      const toggleLabel = page.locator('#upload-ai-depth-toggle-label');
      await expect(toggleLabel).toBeVisible();
      await expect(toggleLabel).toHaveAttribute(
        'title',
        'Enable to estimate 3D depth from regular 2D photos using in-browser AI, instead of treating as a pre-rendered grayscale depth map'
      );

      const toggleCheckbox = page.locator('#upload-ai-depth-toggle');
      await expect(toggleCheckbox).not.toBeChecked();

      // Enable the AI Depth toggle
      await toggleCheckbox.check();
      await expect(toggleCheckbox).toBeChecked();

      // Upload image via the upload tab dropzone
      await page.locator('#upload-depth-input').setInputFiles({
        name: 'regular-photo.png',
        mimeType: 'image/png',
        buffer: TEST_IMAGE_BUFFER,
      });

      // AI Progress banner should appear in the upload tab and complete
      const progressBanner = page.locator('#ai-progress-banner');
      await expect(progressBanner).toBeVisible();
      await expect(page.locator('#ai-status-text')).toHaveText('Complete', { timeout: 10000 });

      // Verify loaded upload card is visible
      await expect(page.locator('#upload-depth-card')).toBeVisible();

      // Canvas should be rendered
      const canvas = page.locator('.canvas-wrapper canvas');
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Texture Studio (Pattern Procedural Synthesis & Toroidal Inspector)', () => {
    test('opens Texture Studio from sidebar, explores generator tabs, and verifies accessible dialog semantics', async ({ page }) => {
      // Open Texture Studio via sidebar button
      const openBtn = page.locator('#open-texture-studio-btn');
      await expect(openBtn).toBeVisible();
      await openBtn.click();

      // Check modal overlay and dialog attributes
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(dialog).toHaveAttribute('aria-labelledby', 'pattern-studio-title');
      await expect(page.locator('#pattern-studio-title')).toHaveText('Texture Studio');

      // Verify default 1x and 3x3 dimension badges
      await expect(page.locator('#pattern-1x-badge')).toHaveText('80 × 80 px');
      await expect(page.locator('#pattern-3x-badge')).toHaveText('240 × 240 px');

      // Switch generator tabs and verify tailored controls appear
      // Voronoi
      await page.click('#generator-tab-voronoi');
      await expect(page.locator('#voronoi-cells-range')).toBeVisible();

      // Checkerboard
      await page.click('#generator-tab-checker');
      await expect(page.locator('#checker-cell-range')).toBeVisible();

      // Stripes
      await page.click('#generator-tab-stripes');
      await expect(page.locator('#stripes-width-range')).toBeVisible();
      await expect(page.locator('#stripes-direction-select')).toBeVisible();

      // Mosaic
      await page.click('#generator-tab-mosaic');
      await expect(page.locator('#mosaic-cell-range')).toBeVisible();
      await expect(page.locator('#mosaic-radius-range')).toBeVisible();

      // Perlin
      await page.click('#generator-tab-perlin');
      await expect(page.locator('#perlin-scale-range')).toBeVisible();
      await expect(page.locator('#perlin-octaves-range')).toBeVisible();

      // Verify Escape key closes dialog
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    });

    test('opens Texture Studio from preset drawer and closes via Cancel button', async ({ page }) => {
      // Open preset drawer
      await page.click('#preset-drawer-trigger');
      const drawer = page.locator('.drawer-panel');
      await expect(drawer).toBeVisible();

      // Click Texture Studio button inside drawer
      const drawerStudioBtn = page.locator('#drawer-open-texture-studio-btn');
      await expect(drawerStudioBtn).toBeVisible();
      await drawerStudioBtn.click();

      // Drawer should close and modal should open
      await expect(drawer).not.toBeVisible();
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Close via Cancel button
      await page.click('#pattern-studio-cancel-btn');
      await expect(dialog).not.toBeVisible();
    });

    test('adjusts vertical period slider and inspects 3x3 repetition grid zoom controls', async ({ page }) => {
      await page.click('#open-texture-studio-btn');
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Adjust vertical period slider to 120px
      const vPeriodRange = page.locator('#vertical-period-range');
      await vPeriodRange.fill('120');

      // Badges should update in real-time
      await expect(page.locator('#pattern-1x-badge')).toHaveText('80 × 120 px');
      await expect(page.locator('#pattern-3x-badge')).toHaveText('240 × 360 px');

      // Test 3x3 repetition zoom controls
      const zoomIndicator = page.locator('#grid-zoom-indicator');
      await expect(zoomIndicator).toHaveText('100%');

      // Zoom in
      await page.locator('.grid-toolbar button[title="Zoom In"]').click();
      await expect(zoomIndicator).toHaveText('125%');

      // Zoom out
      await page.locator('.grid-toolbar button[title="Zoom Out"]').click();
      await expect(zoomIndicator).toHaveText('100%');

      // Test seed shuffle button
      const seedInput = page.locator('#recipe-seed-input');
      const initialSeed = await seedInput.inputValue();
      await page.click('#recipe-seed-random-btn');
      const randomizedSeed = await seedInput.inputValue();
      expect(randomizedSeed).not.toEqual(initialSeed);

      // Reset to defaults
      await page.click('#pattern-studio-reset-btn');
      await expect(page.locator('#pattern-1x-badge')).toHaveText('80 × 80 px');

      await page.click('#pattern-studio-cancel-btn');
    });

    test('applies custom Voronoi pattern to stereogram and reverts to standard preset', async ({ page }) => {
      await page.click('#open-texture-studio-btn');

      // Switch to Voronoi and customize
      await page.click('#generator-tab-voronoi');
      await page.locator('#voronoi-cells-range').fill('24');
      await page.locator('#vertical-period-range').fill('96');

      // Click Apply Pattern
      await page.click('#pattern-studio-apply-btn');

      // Modal closes
      await expect(page.locator('div[role="dialog"]')).not.toBeVisible();

      // Sidebar shows active custom recipe card
      const customCard = page.locator('.custom-recipe-active-card');
      await expect(customCard).toBeVisible();
      await expect(customCard).toContainText('Custom Recipe');
      await expect(customCard).toContainText('VORONOI');
      await expect(customCard).toContainText('80 × 96 px');

      // Main stereogram canvas remains visible and updated
      const canvas = page.locator('.canvas-wrapper canvas');
      await expect(canvas).toBeVisible();

      // Clear custom recipe back to standard preset
      await page.click('#clear-custom-recipe-btn');
      await expect(customCard).not.toBeVisible();
      await expect(page.locator('#texture-preset-select')).toBeVisible();
    });

    test('renders instant 3D fusibility mini-stereogram testbed, toggles reference scene & guide dots, and reflects convergence mode', async ({ page }) => {
      // 1. Open Texture Studio
      await page.click('#open-texture-studio-btn');
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      // 2. Locate 3D Fusibility Testbed card and badges
      const testbedCard = page.locator('.testbed-card');
      await expect(testbedCard).toBeVisible();
      await expect(page.locator('#testbed-fusibility-badge')).toHaveText('Binocular Fusibility');
      await expect(page.locator('#testbed-dimension-badge')).toHaveText('240 × 160 px');
      await expect(page.locator('#testbed-convergence-badge')).toHaveText('Parallel');
      await expect(page.locator('#testbed-sep-badge')).toHaveText('Sep: 30px');

      // 3. Verify 240×160 Testbed Canvas is rendered
      const testbedCanvas = page.locator('#testbed-stereogram-canvas');
      await expect(testbedCanvas).toBeVisible();
      await expect(testbedCanvas).toHaveAttribute('width', '240');
      await expect(testbedCanvas).toHaveAttribute('height', '160');

      // 4. Verify Convergence Guide Dots overlay and toggle
      const guideDotsOverlay = page.locator('.testbed-guide-dots-overlay');
      await expect(guideDotsOverlay).toBeVisible();
      const guideDots = page.locator('.testbed-guide-dot');
      await expect(guideDots).toHaveCount(2);

      const guideDotsCheckbox = page.locator('#testbed-guide-dots-checkbox');
      await expect(guideDotsCheckbox).toBeChecked();

      // Toggle guide dots off
      await guideDotsCheckbox.uncheck();
      await expect(guideDotsOverlay).not.toBeVisible();

      // Toggle guide dots back on
      await guideDotsCheckbox.check();
      await expect(guideDotsOverlay).toBeVisible();

      // 5. Test Reference Scene Selector (Benchmark Sphere vs Active Project Depth Map)
      const benchmarkBtn = page.locator('#testbed-scene-benchmark-btn');
      const projectBtn = page.locator('#testbed-scene-project-btn');

      await expect(benchmarkBtn).toHaveClass(/active/);
      await expect(projectBtn).not.toHaveClass(/active/);

      // Switch to Active Project Depth Map
      await projectBtn.click();
      await expect(projectBtn).toHaveClass(/active/);
      await expect(benchmarkBtn).not.toHaveClass(/active/);

      // Switch back to Benchmark Sphere
      await benchmarkBtn.click();
      await expect(benchmarkBtn).toHaveClass(/active/);
      await expect(projectBtn).not.toHaveClass(/active/);

      // 6. Test interaction when scrubbing recipe parameters
      await page.click('#generator-tab-voronoi');
      await page.locator('#voronoi-cells-range').fill('32');
      await expect(testbedCanvas).toBeVisible();

      // Close modal
      await page.click('#pattern-studio-cancel-btn');
      await expect(dialog).not.toBeVisible();

      // 7. Toggle convergence mode in sidebar to Cross-eyed
      const crossTab = page.locator('.mode-tab', { hasText: 'Cross-eyed' });
      await crossTab.click();
      await expect(crossTab).toHaveClass(/active/);

      // Reopen Texture Studio and assert convergence mode badge updates to Cross-eyed
      await page.click('#open-texture-studio-btn');
      await expect(dialog).toBeVisible();
      await expect(page.locator('#testbed-convergence-badge')).toHaveText('Cross-eyed');

      // Close modal to cleanup
      await page.click('#pattern-studio-cancel-btn');
      await expect(dialog).not.toBeVisible();
    });
  });
});

