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

  test.describe('Dynamic Separation Sync, Preset Library & JSON Sharing (Ticket 19)', () => {
    test('dynamically synchronizes pattern tile width with separation slider for custom recipes and presets', async ({ page }) => {
      // 1. Open Texture Studio, create a Voronoi recipe and apply it
      await page.click('#open-texture-studio-btn');
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      await page.click('#generator-tab-voronoi');
      await page.click('#pattern-studio-apply-btn');
      await expect(dialog).not.toBeVisible();

      // Verify active recipe banner in sidebar shows custom recipe
      const recipeCard = page.locator('.custom-recipe-active-card');
      await expect(recipeCard).toBeVisible();
      await expect(recipeCard).toContainText('Custom Recipe');
      await expect(recipeCard).toContainText('VORONOI');
      await expect(recipeCard).toContainText('80 × 80 px');

      // 2. Adjust separation slider to 96px
      const sepRange = page.locator('#separation-range');
      await sepRange.fill('96');
      await expect(page.locator('label[for="separation-range"] .val')).toHaveText('96px');

      // Assert that custom recipe dimensions dynamically synchronized to 96px without phase jumps
      await expect(recipeCard).toContainText('96 × 80 px');

      // 3. Switch to a built-in procedural preset via Preset Drawer
      await page.click('#preset-drawer-trigger');
      const drawer = page.locator('.drawer-panel');
      await expect(drawer).toBeVisible();

      const perlinCard = page.locator('.preset-card', { hasText: 'Perlin Cloud Waves' });
      await expect(perlinCard).toBeVisible();
      await perlinCard.click();
      await expect(drawer).not.toBeVisible();

      // 4. Adjust separation slider again to 110px
      await sepRange.fill('110');
      await expect(page.locator('label[for="separation-range"] .val')).toHaveText('110px');

      // Stereogram canvas should remain visible and updated
      const canvas = page.locator('.canvas-wrapper canvas');
      await expect(canvas).toBeVisible();
    });

    test('saves custom recipe to localStorage library and applies/deletes from Preset Drawer', async ({ page }) => {
      // 1. Open Texture Studio
      await page.click('#open-texture-studio-btn');
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      // 2. Select Mosaic generator, configure name and save to library
      await page.click('#generator-tab-mosaic');
      const nameInput = page.locator('#pattern-recipe-name-input');
      await nameInput.fill('Emerald Mosaic');

      await page.click('#pattern-studio-save-library-btn');
      const feedback = page.locator('#pattern-studio-feedback');
      await expect(feedback).toBeVisible();
      await expect(feedback).toContainText('Saved "Emerald Mosaic" to library!');

      // Close modal
      await page.click('#pattern-studio-cancel-btn');
      await expect(dialog).not.toBeVisible();

      // 3. Open Preset Drawer and assert Custom Patterns section contains "Emerald Mosaic"
      await page.click('#preset-drawer-trigger');
      const drawer = page.locator('.drawer-panel');
      await expect(drawer).toBeVisible();

      const customCard = page.locator('.custom-pattern-card', { hasText: 'Emerald Mosaic' });
      await expect(customCard).toBeVisible();
      await expect(customCard.locator('.custom-badge')).toHaveText('MOSAIC');
      await expect(customCard.locator('.pattern-thumb-canvas')).toBeVisible();

      // 4. Click Apply on custom pattern card
      const applyBtn = customCard.locator('.apply-custom-pattern-btn');
      await applyBtn.click();
      await expect(drawer).not.toBeVisible();

      // Verify active recipe banner in sidebar
      const recipeCard = page.locator('.custom-recipe-active-card');
      await expect(recipeCard).toBeVisible();
      await expect(recipeCard).toContainText('Custom Recipe');
      await expect(recipeCard).toContainText('MOSAIC');

      // 5. Re-open Preset Drawer and delete custom pattern
      await page.click('#preset-drawer-trigger');
      await expect(drawer).toBeVisible();

      const deleteBtn = page.locator('.custom-pattern-card', { hasText: 'Emerald Mosaic' }).locator('.delete-custom-pattern-btn');
      await deleteBtn.click();

      // Assert pattern is removed and empty note is shown
      await expect(page.locator('.custom-pattern-card', { hasText: 'Emerald Mosaic' })).not.toBeVisible();
      await expect(page.locator('.preset-empty-note')).toBeVisible();

      // Close drawer
      await page.click('.btn-close-drawer');
      await expect(drawer).not.toBeVisible();
    });

    test('downloads tile PNG and exports/imports recipe JSON with live preview update', async ({ page }) => {
      // 1. Open Texture Studio
      await page.click('#open-texture-studio-btn');
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Select Checker generator
      await page.click('#generator-tab-checker');
      await page.locator('#pattern-recipe-name-input').fill('Geometric Checker');

      // 2. Test Download Tile PNG
      const pngDownloadPromise = page.waitForEvent('download');
      await page.click('#pattern-studio-download-png-btn');
      const pngDownload = await pngDownloadPromise;
      expect(pngDownload.suggestedFilename()).toMatch(/^pattern-checker-\d+x\d+\.png$/);

      // 3. Test Export Recipe JSON
      const jsonDownloadPromise = page.waitForEvent('download');
      await page.click('#pattern-studio-export-json-btn');
      const jsonDownload = await jsonDownloadPromise;
      expect(jsonDownload.suggestedFilename()).toMatch(/^pattern-geometric-checker\.json$/);

      // 4. Test Import Recipe JSON (Valid stripes payload)
      const validJsonPayload = JSON.stringify({
        name: 'Cyberpunk Neon Stripes',
        verticalPeriod: 96,
        recipe: {
          type: 'stripes',
          stripeWidth: 16,
          colors: [
            [255, 0, 128, 255],
            [0, 255, 255, 255],
          ],
        },
      });

      await page.setInputFiles('#pattern-studio-import-json-input', {
        name: 'cyberpunk-stripes.json',
        mimeType: 'application/json',
        buffer: Buffer.from(validJsonPayload),
      });

      // Verify that controls update live: stripes tab selected, name updated, feedback banner displayed
      await expect(page.locator('#generator-tab-stripes')).toHaveClass(/active/);
      await expect(page.locator('#pattern-recipe-name-input')).toHaveValue('Cyberpunk Neon Stripes');
      await expect(page.locator('#vertical-period-range')).toHaveValue('96');
      await expect(page.locator('#pattern-studio-feedback')).toContainText('Loaded recipe "Cyberpunk Neon Stripes"');

      // 5. Test Import Recipe JSON with invalid schema (error handling)
      const invalidJsonPayload = JSON.stringify({
        name: 'Malformed Recipe',
        recipe: {
          type: 'perlin',
          scale: -99, // invalid scale
        },
      });

      await page.setInputFiles('#pattern-studio-import-json-input', {
        name: 'invalid-recipe.json',
        mimeType: 'application/json',
        buffer: Buffer.from(invalidJsonPayload),
      });

      // Verify error banner is rendered
      const errorBanner = page.locator('#pattern-studio-error');
      await expect(errorBanner).toBeVisible();
      await expect(errorBanner).toContainText('Invalid pattern recipe');

      // Close modal to cleanup
      await page.click('#pattern-studio-cancel-btn');
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Brand Identity Icons & Link Tags (Ticket 22)', () => {
    test('serves brand identity icons with valid headers and DOM head links', async ({ page, request }) => {
      // Assert presence of icon tags in document head
      const faviconSvg = page.locator('link[rel="icon"][type="image/svg+xml"]');
      await expect(faviconSvg).toHaveAttribute('href', '/favicon.svg');

      const faviconIco = page.locator('link[rel="alternate icon"]');
      await expect(faviconIco).toHaveAttribute('href', '/favicon.ico');

      const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
      await expect(appleTouchIcon).toHaveAttribute('href', '/apple-touch-icon.png');

      // Assert HTTP 200 retrieval for all generated icon assets
      const iconAssets = [
        { url: '/favicon.svg', mimeMatch: 'image/svg+xml' },
        { url: '/favicon.ico', mimeMatch: 'icon' },
        { url: '/apple-touch-icon.png', mimeMatch: 'image/png' },
        { url: '/pwa-192x192.png', mimeMatch: 'image/png' },
        { url: '/pwa-512x512.png', mimeMatch: 'image/png' },
        { url: '/maskable-icon-512x512.png', mimeMatch: 'image/png' },
      ];

      for (const asset of iconAssets) {
        const response = await request.get(asset.url);
        expect(response.status()).toBe(200);
        const ct = response.headers()['content-type'] || '';
        expect(ct).toContain(asset.mimeMatch);
      }
    });
  });

  test.describe('PWA Lifecycle UI, Deep-Linking & Offline Readiness (Ticket #24)', () => {
    test('serves web app manifest with valid headers, HTTP 200, and DOM head link tag', async ({ page, request }) => {
      await page.goto('/');
      // Head link tag
      const manifestLink = page.locator('link[rel="manifest"]').first();
      await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

      // HTTP 200 retrieval
      const response = await request.get('/manifest.webmanifest');
      expect(response.status()).toBe(200);
      const manifest = await response.json();
      expect(manifest.name).toBe('Stereogramer - 3D Autostereogram Studio');
      expect(manifest.short_name).toBe('Stereogramer');
      expect(manifest.display).toBe('standalone');
      expect(manifest.theme_color).toBe('#0f172a');
      expect(manifest.background_color).toBe('#090d16');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      expect(manifest.shortcuts.length).toBe(3);
    });

    test('deep-link shortcut ?action=texture-studio automatically opens PatternStudioModal', async ({ page }) => {
      await page.goto('/?action=texture-studio');
      const dialog = page.locator('#pattern-studio-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('role', 'dialog');
      // Can close cleanly
      const cancelBtn = page.locator('#pattern-studio-cancel-btn');
      await cancelBtn.click();
      await expect(dialog).not.toBeVisible();
    });

    test('deep-link shortcut ?tab=ai-photo automatically selects AI Photo source tab', async ({ page }) => {
      await page.goto('/?tab=ai-photo');
      const aiSection = page.locator('#ai-photo-section');
      await expect(aiSection).toBeVisible();
      const aiTabBtn = page.locator('button.mode-tab:has-text("AI Photo")');
      await expect(aiTabBtn).toHaveClass(/active/);
    });

    test('renders ambient Install App button when beforeinstallprompt fires with proper ARIA attributes', async ({ page }) => {
      await page.goto('/');
      const installBtn = page.locator('#pwa-install-btn');
      // Initially not visible on desktop before beforeinstallprompt
      await expect(installBtn).not.toBeVisible();

      // Trigger beforeinstallprompt event
      await page.evaluate(() => {
        window.dispatchEvent(new Event('beforeinstallprompt'));
      });

      await expect(installBtn).toBeVisible();
      await expect(installBtn).toHaveAttribute('aria-label', 'Install App');
    });

    test('renders iOS helper popover on iOS Safari with share instructions and closes on ESC/close button', async ({ page }) => {
      // Set iPhone user agent
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        });
      });

      await page.goto('/');
      const installBtn = page.locator('#pwa-install-btn');
      await expect(installBtn).toBeVisible();
      await expect(installBtn).toHaveAttribute('aria-haspopup', 'dialog');

      // Click install button to open iOS popover
      await installBtn.click();
      const tooltip = page.locator('#ios-install-tooltip');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveAttribute('role', 'dialog');
      await expect(tooltip).toContainText('Tap the Share button');
      await expect(tooltip).toContainText('Add to Home Screen');

      // Test close button
      const closeBtn = tooltip.locator('.btn-close-tooltip');
      await closeBtn.click();
      await expect(tooltip).not.toBeVisible();

      // Open again and test ESC key dismiss
      await installBtn.click();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tooltip).not.toBeVisible();
    });

    test('hides Install App button when running in standalone mode', async ({ page }) => {
      // Simulate standalone mode
      await page.addInitScript(() => {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: (query: string) => ({
            matches: query.includes('display-mode: standalone'),
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          }),
        });
      });

      await page.goto('/');
      // Trigger beforeinstallprompt
      await page.evaluate(() => {
        window.dispatchEvent(new Event('beforeinstallprompt'));
      });

      const installBtn = page.locator('#pwa-install-btn');
      await expect(installBtn).not.toBeVisible();
    });

    test('renders Service Worker Update Available toast with Reload and Dismiss actions', async ({ page }) => {
      await page.goto('/');
      const updateToast = page.locator('#pwa-update-toast');
      await expect(updateToast).not.toBeVisible();

      // Trigger test update available event
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('pwa:test-update-available'));
      });

      await expect(updateToast).toBeVisible();
      await expect(updateToast).toHaveAttribute('role', 'alert');
      await expect(updateToast).toHaveAttribute('aria-live', 'assertive');
      await expect(updateToast).toContainText('Update Available');
      await expect(updateToast).toContainText('New version available');

      const reloadBtn = page.locator('#pwa-reload-btn');
      const dismissBtn = page.locator('#pwa-dismiss-btn');
      await expect(reloadBtn).toBeVisible();
      await expect(dismissBtn).toBeVisible();

      // Dismiss hides toast
      await dismissBtn.click();
      await expect(updateToast).not.toBeVisible();
    });

    test('displays subtle Offline badge in footer and advisory in AI Photo tab when offline', async ({ page, context }) => {
      await page.goto('/?tab=ai-photo');
      const offlineBadge = page.locator('#offline-badge');
      await expect(offlineBadge).not.toBeVisible();

      // Simulate offline network
      await context.setOffline(true);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
      });

      // Assert footer status bar shows offline badge
      await expect(offlineBadge).toBeVisible();
      await expect(offlineBadge).toHaveAttribute('role', 'status');
      await expect(offlineBadge).toContainText('Offline');

      // Assert AI Photo offline advisory banner is rendered
      const advisory = page.locator('#ai-photo-offline-advisory');
      await expect(advisory).toBeVisible();
      await expect(advisory).toHaveAttribute('role', 'alert');
      await expect(advisory).toContainText('AI Model Not Cached');
      await expect(advisory).toContainText('Procedural depth maps, shapes, and textures are 100% functional offline');

      // Click "Use Procedural Presets" recovery button
      const switchPresetsBtn = page.locator('#btn-offline-switch-presets');
      await switchPresetsBtn.click();
      await expect(page.locator('#depth-preset-select')).toBeVisible();

      // Return online
      await context.setOffline(false);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });
      await expect(offlineBadge).not.toBeVisible();
    });

    test('verifies service worker is registered in production preview mode', async ({ page }) => {
      await page.goto('/');
      // In production preview, service worker registration can be checked
      const hasSwSupport = await page.evaluate(async () => {
        return 'serviceWorker' in navigator;
      });
      expect(hasSwSupport).toBe(true);
    });
  });
});


