# 3. Declarative Pattern Recipes Synchronized with Pattern Separation

We decided to model procedural autostereogram substrates as declarative, resolution-independent `PatternRecipe` descriptors in `@stereogramer/core` whose horizontal tile width dynamically synchronizes to `patternSeparation`.

In Textured Single Image Stereograms, sampling color via modulo offsets against an unaligned tile width causes horizontal phase discontinuities, periodic beating, and echo artifacts across depth steps. Rather than storing static raster image buffers that distort or alias when ocular separation is adjusted, pattern tiles are synthesized on demand using pure mathematical generators. This guarantees exact 1:1 alignment between pattern periodicity and base ocular convergence distance across any canvas resolution or user-specified separation, while allowing recipes to be serialized as lightweight JSON objects across both Web and CLI runtimes.
