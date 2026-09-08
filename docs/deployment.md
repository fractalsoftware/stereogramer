# Static Server Deployment Guide

Because **Stereogramer Web Studio** is completely client-side (including the Web Workers and ONNX WASM models), it can be deployed to any static file server or CDN without needing a backend server or database.

---

## 1. Build the Static Bundle

From the root of the project, run:

```bash
pnpm --filter @stereogramer/web build
```

The production-ready static assets will be output to:
📁 **`packages/web/dist/`**

This directory contains:
* `index.html`
* `assets/index-*.js` and `assets/index-*.css`
* `assets/stereogram.worker-*.js` (Autostereogram generation Web Worker)
* `assets/depth-estimation.worker-*.js` (Depth estimation Web Worker)
* `assets/ort-wasm-simd-threaded.*.wasm` (ONNX Runtime WebAssembly binary)

---

## 2. Test Locally with a Static Server

You can preview the production build locally before uploading:

```bash
# Using Vite's built-in preview server:
pnpm --filter @stereogramer/web preview

# Or using any static file server:
npx serve packages/web/dist
```

---

## 3. Server Configuration & Optimization

To ensure optimal performance (especially for Web Workers and WASM multi-threading), configure your static file server with the following:

### Proper MIME Types
Ensure your server serves `.wasm` files as `application/wasm` (most modern web servers and CDNs do this automatically):
* `.wasm` $\rightarrow$ `application/wasm`
* `.js` $\rightarrow$ `application/javascript`

### Cross-Origin Isolation Headers (Recommended for Multi-threaded WASM)
While **WebGPU** works out of the box, if a user's browser falls back to the **WASM CPU** runtime, enabling Cross-Origin Isolation headers allows `onnxruntime-web` to use `SharedArrayBuffer` for multi-threaded CPU inference:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Subpath Hosting (e.g. GitHub Pages)
If you deploy to a subdirectory instead of the domain root (e.g., `https://example.com/stereogramer/`), set `base` in `packages/web/vite.config.ts`:

```ts
export default defineConfig({
  base: './', // or '/stereogramer/'
  // ...
});
```

---

## 4. Deployment Recipes

### Option A: Nginx
```nginx
server {
    listen 80;
    server_name stereogramer.example.com;

    root /var/www/stereogramer/packages/web/dist;
    index index.html;

    # Cross-Origin Isolation for multi-threaded WASM
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.wasm$ {
        default_type application/wasm;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Option B: Caddy
```caddy
stereogramer.example.com {
    root * /var/www/stereogramer/packages/web/dist
    file_server

    header {
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
    }

    try_files {path} /index.html
}
```

### Option C: Cloudflare Pages / Netlify / Vercel
Connect your repository in the dashboard with these build settings:
* **Framework preset**: Vite
* **Build command**: `pnpm --filter @stereogramer/web build`
* **Build output directory**: `packages/web/dist`
* **Root directory**: `/` (repository root)

*(For Cloudflare Pages or Netlify, you can add a `_headers` file in `packages/web/public/_headers` with the `Cross-Origin-Opener-Policy` headers).*

### Option D: AWS S3 + CloudFront
1. Sync `packages/web/dist/` to your S3 bucket:
   ```bash
   aws s3 sync packages/web/dist/ s3://my-stereogramer-bucket --delete
   ```
2. In CloudFront:
   * Set Default Root Object to `index.html`.
   * Add a Response Headers Policy adding `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
