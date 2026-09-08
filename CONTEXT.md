# Stereogramer

A domain model for generating single-image autostereograms from depth representations and textures.

## Language

**Autostereogram**:
A single two-dimensional image that encodes a three-dimensional scene, perceived stereoscopically when viewed with altered ocular convergence.
_Avoid_: 3D image, magic picture

**SIRDS**:
A Single Image Random Dot Stereogram whose background substrate consists of pseudo-random dots rather than an image texture.
_Avoid_: Noise stereogram, static stereogram

**Textured SIS**:
A Single Image Stereogram that repeats a graphical pattern or texture tile across the horizontal axis, deformed according to depth values.
_Avoid_: Wallpaper stereogram, Magic Eye

**Depth Map**:
A two-dimensional grid where each coordinate represents an elevation or distance value in the encoded 3D scene.
_Avoid_: Z-buffer, heightmap, bump map

**Convergence Mode**:
The ocular alignment technique used to resolve the stereogram, either parallel (eyes diverging toward infinity) or cross-eyed (eyes converging in front of the image plane).
_Avoid_: Focus mode, 3D trick

**Guide Dots**:
A pair of visual markers displayed in the viewing interface, spaced at the exact pattern separation distance, to assist the observer in locking ocular convergence without altering the underlying image.
_Avoid_: Calibration marks, target points, alignment dots

**Hidden Surface Removal**:
An algorithmic procedure during constraint resolution that eliminates sightlines occluded by foreground depth features, preventing visual ghosting and echo artifacts.
_Avoid_: Occlusion culling, echo clipping

**Pattern Separation**:
The horizontal repetition interval of the visual substrate across the stereogram, defining the base ocular convergence distance.
_Avoid_: Strip width, repeat frequency, tile span

**Depth Discontinuity**:
An abrupt step change between adjacent depth values, mitigated via smoothing or beveling to prevent perceptual tearing.
_Avoid_: Depth cliff, step edge

**Bevel Extrusion**:
A procedural depth generation method that applies a continuous, rounded gradient along the perimeter of 2D shapes and glyphs.
_Avoid_: 3D embossing, pillowing

**Dot Scale**:
The pixel block dimension of individual noise elements in a SIRDS, adjusted to ensure visual fusibility across high-density displays.
_Avoid_: Pixel size, grain size, noise resolution

**Procedural Texture**:
A mathematically synthesized seamless pattern generated algorithmically (such as Perlin noise or cellular lattices) used as an autostereogram substrate.
_Avoid_: Algorithmic wallpaper, synthetic background

**SVG Vector Extrusion**:
The raster transformation of two-dimensional vector paths into an elevation field with beveled boundaries.
_Avoid_: Vector 3D conversion, path heightmap

**Disparity**:
The horizontal pixel offset between corresponding left-eye and right-eye features across an autostereogram scanline, bounded to preserve human ocular comfort.
_Avoid_: Depth shift, parallax offset

**Depth Polarity**:
The orientation mapping between depth map luminance and spatial distance, where higher luminance standardly represents proximity to the observer.
_Avoid_: Depth direction, height sign

**Fusibility**:
The ease with which human binocular vision can converge disparate pattern elements into a coherent, non-diplopic three-dimensional percept.
_Avoid_: Viewability, 3D lock

**Pattern Tile**:
The discrete two-dimensional graphical substrate block repeated across the horizontal and vertical axes of a Textured SIS.
_Avoid_: Texture patch, repeat unit, background slice

**Toroidal Seamlessness**:
A boundary continuity property where the opposing edges of a visual substrate seamlessly interpolate with one another across both axes, preventing perceptual seam discontinuities when tiled.
_Avoid_: Wrap-around continuity, edge blending, seamless tiling

**Pattern Recipe**:
A declarative, resolution-independent parameter specification (generator type, frequency, seed, and color mappings) that synthesizes a Pattern Tile deterministically on demand.
_Avoid_: Pattern config, texture settings, preset definition
