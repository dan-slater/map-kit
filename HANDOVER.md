# HANDOVER

Last updated: 2026-10-09, end of build-order step 1.

## State

Step 1 is complete. The package builds, type-checks, and every component is
exercised by a demo that has been driven through a headless browser.

`@dan-slater/map-kit` v0.1.0, consumed by git tag, never published to npm.

## What is built

`src/lib` is the package, `src/routes` is a demo that is not shipped.

| File | What it is |
| --- | --- |
| `Map.svelte` | MapLibre map, globe projection by default, OpenFreeMap style. Bindable `map`, `center`, `zoom`, `bearing`, `pitch`, `loaded`. Context for children. `flyTo`/`getMap`/`ready` as component methods. |
| `Pins.svelte` | Pins from `[{id, lat, lon, props}]`. Bindable `selected` (id), `selectedPin` (object), `hovered`. Custom pin snippet. Default marker is plain SVG on tokens. Occlusion fade on the globe. |
| `Panel.svelte` | Side panel bound to an item, `left`/`right`, bottom sheet below 640px. `children`/`empty`/`header`/`footer` snippets. |
| `Layer.svelte` | GeoJSON source plus one or more MapLibre layers, bindable `visible`, `setData` on change, re-added after `setStyle`. |
| `Overlay.svelte` | Canvas over the map at device pixel ratio, 2d or WebGPU. Hands out the frame object. Coalesced redraws on move/resize/style. |
| `coastline.ts` | `coastlineNear`. The important one. See below. |
| `geo.ts` | `enuFrame`, plus `distanceMeters`, `wrapLongitude`, `polylineLength`, `simplifyPolyline`. No MapLibre import, so it runs anywhere. |
| `flyTo.ts` | `flyTo(map, opts)` resolving on `moveend`. |
| `mapUtils.ts` | `metersPerPixel` (measured, not assumed), `isLocationOccluded`, `waitForIdle`. |
| `shapes.ts` | `circle`, `points`, `linesFromMeters`, `cssToken`. |
| `styles.ts`, `context.ts`, `types.ts`, `layerDef.ts`, `overlay.ts`, `tokens.css` | Style URLs, map context, shared types, theme tokens. |

Docs: `docs/overlay.md` (the overlay contract), `docs/theming.md` (every
token), `docs/coastline.md` (the tile query, with measured numbers). README
covers install by tag and one example per component.

## Evidence

All of the following was run on this box on 2026-10-09.

```
bun run check   ->  182 FILES 0 ERRORS 0 WARNINGS
bun run build   ->  src/lib -> dist   (33 files emitted)
bunx publint    ->  All good!
```

Demo serving on `127.0.0.1:5180` in tmux session `mapkit-dev`
(`bunx vite dev --host 127.0.0.1 --port 5180`, log at
`~/orch-scratch/mapkit-dev.log`). Returns HTTP 200.

`bun scripts/verify.mjs` drives the demo through headless Chromium
(swiftshader, no GPU needed) and prints:

```
=== J-Bay (point break, curved coast) ===
  -34.0308, 24.9338 at zoom 14, radius 2000 m
  tileZoom=14 settled=true features=9 segments=136
  edgeDrops=14 clipOffsets=[-64, 64] duplicates=4
  tileWidth=2027 m bridge=79.2 m bridgedGaps=1
  polylines=3 vertices=137
    [0] 133 vertices, 4332 m long, span 641 x 3874 m, -619,-1902 -> -331,1972

=== Nazare (straight beach) ===
  polylines=19 vertices=241
    [0] 58 vertices, 2894 m long, span 988 x 2081 m, -101,1997 -> 810,-83

=== Mundaka (river mouth) ===
  polylines=7 vertices=287
    [0] 145 vertices, 4562 m long, span 1736 x 1725 m, 118,-203 -> -1575,1232

  panel title: Jeffreys Bay
  status: 3 polylines, 137 vertices. Longest 4332 m with 133 vertices.
  pin screen position moved by -244, -68 px after a drag
RESULT: pass
```

`enuFrame` round-trips to within 6e-9 m.

Screenshots land in `shots/` (gitignored). `04-coastline.png` shows the
returned polyline tracing J-Bay's shoreline bay by bay, with the crosshair on
the pin and the 2 km ring. `05-panned.png` is the same after a drag: coastline
and crosshair stay registered. `01-globe.png` shows globe projection with the
Pacific pins correctly hidden behind the planet.

## `coastlineNear`, and why it is not trivial

This is the helper surf-lab depends on, so the reasoning is worth keeping.

Reading `water` polygons out of loaded tiles gets you most of the way, but raw
output has two defects, both now handled:

1. **Vector tiles invent straight edges.** Every polygon is clipped to the tile
   plus a buffer, so clipped water polygons gain long straight walls along the
   clip line. Measured against OpenFreeMap, those edges are exactly
   axis-aligned on the tile grid and land at exactly ±64 units of 4096, every
   time, while genuinely north-south coastline lands at arbitrary offsets
   (-297, -941, +998, ...). So the code tallies the offsets of axis-aligned
   edges and drops the ones shared by at least three segments. That detects the
   buffer instead of hard-coding it, and it reports what it found in
   `stats.clipOffsets`. An earlier version used a fixed ±0.025-tile band and
   wrongly dropped real coastline at Nazaré, where the shore runs almost
   exactly north-south.

2. **Removing clip edges leaves overlapping, non-matching pieces.** Each tile's
   coast now ends on its own clip line, and neighbours clip on opposite sides
   of the shared boundary, so consecutive pieces overlap by about 60 m at zoom
   14 rather than meeting. The two tiles also simplify the same shore
   independently, so inside the overlap their vertices disagree by a metre or
   two and never coincide. The fix searches the tail of one piece and the head
   of the next for their closest approach **segment to segment** (vertex to
   vertex is not enough: the copies run ~0.4 m apart with no shared vertex) and
   splices there. Both ends must sit on a detected clip line, which is what
   keeps a real river mouth from being joined up.

Effect of (2) at J-Bay: 4 fragments with a 3938 m longest, became 3 with a
4332 m longest covering the whole shoreline in the radius.

Output carries direction: walking a polyline from index 0, water is on the
left. Nothing is ever reversed, so the OGC winding of the source rings
survives. That is how a consumer gets the seaward normal without a second
query.

## What is next

Nothing is blocking. Candidates for step 2, roughly in order of value:

1. **Tag `v0.1.0`** so surf-lab can depend on it. Needs the control plane to
   push; `git push` is denied here by design.
2. **WebGPU overlay has not been run.** The 2d path is verified end to end; the
   `mode="webgpu"` path is written against the spec but never executed, because
   swiftshader in the harness covers WebGL, not WebGPU. First surf-lab spike
   will exercise it. Worth a headless run with
   `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` before relying on
   it.
3. **Unit tests.** `geo.ts` and the stitching in `coastline.ts` are pure
   functions and deserve `bun test` coverage. Everything so far is verified
   through the browser harness, which is slow and needs a dev server.
4. **Nazaré still returns 19 polylines.** The dominant one is now 2894 m, which
   is usable, but a 2 km circle there contains breakwaters, a harbour mouth and
   a river. Worth confirming with surf-lab whether the fragments are a problem
   before tuning further; they may be genuinely separate water boundaries.
5. **`<Pins>` at scale.** Positions are written as transforms on every map
   move. Fine for tens or low hundreds; a client map with thousands of
   competitor pins will want a symbol layer instead.
6. **Clustering.** `<Layer>` already passes `cluster: true` through to the
   GeoJSON source, but nothing demos or documents it.

## Open questions for Daniel

- Should `<Pins>` grow a `cluster` mode, or will client data maps use `<Layer>`
  with a symbol layer for large sets? That decides whether `<Pins>` stays
  DOM-based.
- `coastlineNear` currently returns polylines only. Does surf-lab also want the
  water polygons themselves (for a land mask), or is the boundary enough?
- Is zoom 14 always the right query zoom, or should `coastlineNear` fly there
  itself? Right now the caller flies, which keeps the helper free of camera
  side effects.

## Box notes

- No Node. Bun 1.4 at `~/.bun/bin/bun`; `export PATH=$HOME/.bun/bin:$PATH`.
- Playwright needed `bun node_modules/playwright/cli.js install chromium`.
  `bunx playwright install` fetched a different build than the pinned
  `playwright-core` wanted and left the launch broken.
- Dev server lives in tmux `mapkit-dev`, bound to 127.0.0.1:5180.
