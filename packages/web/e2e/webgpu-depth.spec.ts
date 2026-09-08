import { test, expect } from '@playwright/test';

// Minimal 4x4 red PNG fixture
const TEST_IMAGE_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAADklEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Real WebGPU Depth Estimation Pipeline', () => {
  // Skip live Hugging Face model download in headless CI runners without GPU
  test.skip(!!process.env.CI, 'Skip live ONNX model download on headless CI runners');

  test('initializes WebGPU cleanly without node assignment warnings, fallback alerts, or errors', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const consoleLogs: { type: string; text: string }[] = [];
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate WITHOUT syntheticDepth (exercises real WebGPU / ONNX pipeline)
    await page.goto('/');
    await page.waitForSelector('.canvas-wrapper canvas');

    // Switch to AI Photo tab
    await page.locator('.mode-tab', { hasText: 'AI Photo' }).click();

    // Upload photo fixture
    await page.locator('#ai-photo-input').setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: TEST_IMAGE_BUFFER,
    });

    // Wait for model download and inference to complete cleanly
    await expect(page.locator('#ai-status-text')).toHaveText('Complete', { timeout: 60000 });

    // Assert error banner did not appear
    const errorBanner = page.locator('#ai-error-banner');
    expect(await errorBanner.isVisible()).toBe(false);

    // Assert no WebGPU failure or fallback occurred
    const hasWebGpuWarning = consoleLogs.some((l) =>
      l.text.includes('WebGPU depth estimation initialization failed')
    );
    expect(hasWebGpuWarning).toBe(false);

    // Assert no ONNX Runtime graph partitioning / CPU fallback warnings were logged
    const hasNodeWarning = consoleLogs.some((l) =>
      l.text.includes('VerifyEachNodeIsAssignedToAnEp')
    );
    expect(hasNodeWarning).toBe(false);

    // Assert depth preview canvas has rendered content
    const previewCanvasExists = await page.locator('.preview-card canvas').first().isVisible();
    expect(previewCanvasExists).toBe(true);
  });
});
