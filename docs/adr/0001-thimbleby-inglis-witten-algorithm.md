# 1. Use Thimbleby-Inglis-Witten Algorithm with Hidden Surface Removal

We decided to implement the Thimbleby–Inglis–Witten (TIW) constraint-linking algorithm with hidden surface removal on the CPU (using Web Workers for the web UI) rather than naive pixel shifting or a WebGL fragment shader.

Autostereograms require bidirectional pixel equivalence constraints across horizontal scanlines that depend on antecedent pixel assignments and occlusion geometry. Naive scanline shifting creates severe "echo" artifacts behind depth steps, while WebGL shaders struggle with the sequential horizontal dependency chains inherent to autostereogram constraint resolution. The TIW algorithm executes in linear O(W × H) time using disjoint-set pixel linking, completely eliminating ghosting artifacts while running in tens of milliseconds per frame in pure JavaScript.
