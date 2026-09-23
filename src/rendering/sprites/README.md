# Equipment sprite pipeline

Equipment art is kept as transparent SVG sprite sheets in `public/assets/sprites`. Each frame occupies a 64 × 64 source cell, while `SpriteManifest.js` controls the number of frames, animation rate, draw scale, foot anchor, physical footprint, and optional connection ports. The physical simulation remains on its existing half-metre grid.

Run `npm run sprites:generate` after editing the authored SVG templates in `scripts/generate-sprite-assets.js`. Keep a shared orthographic top-down view, a soft upper-left key light, cool fill light, dark steel and gunmetal materials, restrained cyan and amber emissive details, and matching outline weight. Leave empty pixels transparent and animate only moving parts such as rotors, water, indicators, and flame.

`SpriteManager` preloads and caches sheets, `SpriteAtlas` resolves frame rectangles, and `SpriteAnimator` derives deterministic frames from simulation time and entity state. Canvas effects add shadows, temperature glow, status LEDs, warnings, and selection feedback. If an asset is missing or has the wrong dimensions, `EntityRenderer` falls back to its procedural drawing path.

All current physical equipment keeps a 1 × 1 footprint. Larger visual bodies use `visualScale`, `visualWidth`, `visualHeight`, and the foot anchor; this lets the art grow without changing placement, collision, heat transfer, or pipe connectivity. `prefers-reduced-motion` freezes sprite and ambient animation.
