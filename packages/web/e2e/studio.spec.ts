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
});
