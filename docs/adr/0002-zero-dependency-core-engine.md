# 2. Zero-Dependency Pure TypedArray Core Engine

We decided that `packages/core` must have zero external runtime dependencies and cannot depend on DOM APIs, Canvas elements, or Node.js primitives.

The core stereogram generation engine consumes and produces raw pixel buffers represented as flat `Uint8ClampedArray` (RGBA) or normalized `Float32Array` depth matrices along with dimension descriptors. All platform-specific image encoding/decoding, DOM Canvas drawing, Web Worker wrappers, and file I/O are isolated to `packages/web` and `packages/cli`. This guarantees maximum portability and allows the engine to run identically across browsers, Web Workers, Node.js, and serverless environments.
