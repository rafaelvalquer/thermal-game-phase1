# Industrial pixel-art pipeline

`npm run sprites:generate` regenerates all local equipment sheets and the campaign illustration. The generator uses the shared palette in `IndustrialPalette.js` and integer rectangles on a 32px logical grid (64px source frames). The industrial condenser has one original 64×32 logical drawing, exported as a 128×64 frame for its existing two-tile footprint. No simulation sizes are changed.

Each sheet has animation frames across columns and two rows: operation and stopped. `SpriteManifest` declares frames, dimensions, state rows, physical footprint metadata and ports. `spriteIdFor` resolves condenser models; `spriteIconStyle` supplies the same dimensions to toolbar and inspector icons. Disabled, electrically blocked and idle equipment use the stopped row. Missing or undersized sheets use the procedural fallback.

`Simulation.visualTime` advances in physics seconds, independently of the accelerated Data Center calendar. Pausing freezes machinery and flow; selection feedback uses UI time. Reduced motion freezes visual animation. Source art and scene composition use nearest-neighbor sampling. Material textures are cached, visible tiles/equipment are culled, and decorative particles have per-frame budgets. Diagnostic modes keep their existing data colors.

## Inspection

Start `npm run dev -- --port 5179`, then open `/visual-lab.html`. This isolated fixture does not read or write saves. It has operation/off/blocked/hot rows, rotations, all assets, a closed hydraulic loop, a duct network, overlay selection, zoom presets, pause, speed and a dense scene. Its measurement button reports mean and p95 rendering CPU time over 120 measured frames after 20 warm-up frames; this is **not** end-to-end gameplay FPS.

For review: inspect all three game modes at normal/thermal/airflow/pressure/fluid/cooling views, zoom extremes, build drag previews, inspector icons and narrow-screen panels. Check blocked units stop, operational motion freezes on pause, and failure symbols remain legible. Compare the same dense scene, browser, viewport and device scale before/after; target 60 FPS in actual gameplay, without inferring FPS from the CPU-only lab measurement.

Run the test suite and build. Pixel-art tests cover manifest/grid/state layout, stopped frames, physics-clock behavior, viewport culling and every overlay at three zoom levels. Existing physics and saved-game tests protect gameplay compatibility.
