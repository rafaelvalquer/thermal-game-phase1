# Performance benchmark V3

The browser benchmark uses the game's normal `Game`, `Simulation`, and Canvas renderer. Start the dev server and open one of these URLs:

```text
/?benchmark=A   100 racks, 10 cooling units, 30 vents
/?benchmark=B   200 racks, 20 cooling units, 60 vents
/?benchmark=C   300 racks, 30 cooling units, 100 vents, 40 technicians
/?benchmark=E   400 racks, 40 cooling units, 120 vents, 600 ducts, 50 technicians
/?benchmark=E&save=1   scenario E with the real sandbox autosave path enabled
```

After each 60 rendered frames, the on-screen panel reports the latest frame-time window's FPS and frame-time p50/p95, full game-loop/update time, subsystem timings, visible entities, rendered ducts and fluid links, long/severe frame rates, and physics backlog. **Baixar relatório JSON** exports the recent sample history (up to 300 windows, five minutes at 60 FPS) plus the latest metrics, including per-save p50/p95/maximum duration and event rate, capture breakdown (state, tiles, entities, utilities, build), JSON/storage phase timings, save size, structural path allocations, and GC data when the browser exposes GC entries. Heap use is sampled every 30 frames; drops of at least 1 MiB are counted as possible collection activity. Press **F3** for the detailed in-game counter panel. Switch thermal, fluid, or other views to measure their real rendering cost; each sample records the active view.

The command-line simulation benchmark also includes scenario E:

```text
npm run benchmark:datacenter -- --scenario=E --ticks=200
npm run benchmark:gate
```

It measures simulation cost without Canvas or DOM and uses the same A/B/C/E layouts as the browser benchmark. The relative gate warms each profile, then fails if per-tick cost increases by more than 2.5× between adjacent sizes. The browser benchmark is required to assess rendering performance. GC event attribution is browser-dependent; when unavailable, long frames and heap drops remain indirect signals.

The command-line output includes mean and maximum pressure iterations, early-exit rate, and advection substeps so steady-state solver behavior can be checked alongside time cost. CI runs the relative scaling gate after tests, build, and smoke benchmark to catch superlinear growth across A/B/C/E.

Use `save=1` only for save profiling. It enables the real data-center autosave path on the large E layout and writes only to a dedicated IndexedDB key that is cleared when leaving or reloading the page. The ordinary E benchmark does not initialize or touch a sandbox save. Existing localStorage saves are imported on load; the newest save revision wins during migration or when leaving the page. Capture time, JSON serialization time, and storage time are reported separately, with IndexedDB serialization and writes removed from the synchronous frame path.

Normal and thermal duct linework is raster-cached by map topology and zoom resolution; equipment sprite frames cache their ambient effects and status marks. These caches retain the same viewport culling and rebuild when their visual inputs change.
