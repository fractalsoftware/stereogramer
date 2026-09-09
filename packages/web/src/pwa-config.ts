import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

export const manifestConfig: Partial<ManifestOptions> = {
  name: 'Stereogramer - 3D Autostereogram Studio',
  short_name: 'Stereogramer',
  description:
    'Create Single Image Stereograms (SIS) and Random Dot Autostereograms (SIRDS) in your browser.',
  theme_color: '#0f172a',
  background_color: '#090d16',
  display: 'standalone',
  orientation: 'any',
  icons: [
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: 'maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
  shortcuts: [
    {
      name: 'Texture Studio',
      url: '/?action=texture-studio',
      description: 'Open procedural pattern and texture generator',
    },
    {
      name: 'AI 3D Photo',
      url: '/?tab=ai-photo',
      description: 'Convert photos to 3D autostereograms',
    },
    {
      name: 'New Stereogram',
      url: '/',
      description: 'Create a new stereogram',
    },
  ],
};

export const workboxConfig: NonNullable<VitePWAOptions['workbox']> = {
  globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
  maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // 30 MB to comfortably precache ort-wasm binaries (~21MB)
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/(?:[a-zA-Z0-9-]+\.)?huggingface\.co\/.*(onnx|bin|json)/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'huggingface-models',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
};

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  strategies: 'generateSW',
  manifest: manifestConfig,
  workbox: workboxConfig,
};
