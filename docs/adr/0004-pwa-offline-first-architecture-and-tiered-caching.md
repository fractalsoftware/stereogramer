# 4. Progressive Web App (PWA) Offline-First Architecture and Tiered Caching

We decided to implement Progressive Web App (PWA) capabilities in `@stereogramer/web` using `vite-plugin-pwa` with Workbox, adopting a Tiered Caching Strategy that segregates instant core precaching from heavy neural network runtime caching, accompanied by a prompt-to-update service worker lifecycle.

Stereogramer is a 100% client-side studio containing lightweight core algorithmic generators (TIW solver, SIRDS, procedural pattern studio) alongside heavyweight monocular depth estimation models (Depth Anything V2 Small ONNX, ~30MB). Pre-bundling neural network weights into the initial PWA service worker precache would introduce unacceptable bandwidth overhead and delay initial installation. Conversely, running without a service worker precludes offline creation and home-screen desktop/mobile integration.

By adopting a Tiered Caching Strategy:
1. Core application code, HTML, CSS, procedural engines, WASM binaries, and presets (<2MB) are precached upon installation for instantaneous sub-second offline launch.
2. Large neural network ONNX model weights are fetched on demand via Hugging Face Transformers.js and cached into the browser's CacheStorage API, enabling offline photo depth estimation on subsequent sessions.
3. The service worker lifecycle is configured with a discrete user prompt-to-reload rather than silent automatic updates, ensuring that creators actively manipulating depth maps and fine-tuning slider parameters in memory do not experience unexpected page reloads.
