# HANDOVER

Last updated: 2026-10-09, after step 1 follow-ups and the basemap theming pass.

## State

`v0.1.0` is tagged and on GitHub; surf-lab pins `#semver:^0.1.0`. Everything
since is unreleased 0.1.x work, recorded in `CHANGELOG.md` under 0.1.1.
Additive only, so the tag can move when the control plane is ready.

Waiting on Daniel: **pick a basemap theme.** Four presets are rendered at three
views each in `docs/img/themes/`. The demo switcher is live, so
`http://127.0.0.1:5180/?theme=chart` flicks between them (`ink`, `paper`,
`chart`, `mono`, `none`). The demo currently defaults to `ink`.

## Latest verification

All run on this box on 2026-10-09, after the last commit.

```
bun run check    ->  345 FILES 0 ERRORS 0 WARNINGS
bun test         ->  39 pass, 0 fail, 259 expect() calls
bun run build    ->  src/lib -> dist
bunx publint     ->  All good!
bun scripts/verify.mjs            ->  RESULT: pass
bun scripts/verify-webgpu.ts --no-warm  ->  RESULT: pass (18 checks)
```

Demo on `127.0.0.1:5180` in tmux `mapkit-dev`, log at
`~/orch-scratch/mapkit-dev.log`.

`coastlineNear` is unchanged by this round of work and still returns, at zoom
14 with a 2 km radius and `classes: ['ocean']`:

| Place | Polylines | Longest | Vertices | Span |
| --- | --- | --- | --- | --- |
| J-Bay | 3 | 4332 m | 133 | 641 x 3874 m |
| Nazaré | 19 | 2894 m | 58 | 988 x 2081 m |
| Mundaka | 7 | 4562 m | 145 | 1736 x 1725 m |

## What changed since the tag

### 1. Unit tests (`bun test`)

`tests/geo.test.ts` checks `enuFrame` against WGS84 scale factors computed
independently in Python (110922.9424 m/degree latitude and 92351.4294
m/degree longitude at J-Bay, to 0.005 m), round trips both directions,
handles the antimeridian and a polar frame, plus `wrapLongitude`,
`distanceMeters`, `polylineLength` and `simplifyPolyline`.

`tests/coastline.test.ts` builds synthetic vector tiles in tile space and
converts them to lon/lat, reproducing what a real tileset does: clip each
polygon to the tile plus a 64/4096 buffer, and let each tile simplify its own
copy of a shared shore. It covers clip-line detection, that an axis-aligned
shore which does not repeat is left alone, seam splicing across three tiles,
that a river-mouth gap inside bridging range is **not** joined because its
ends are not on a clip line, that two pieces running opposite ways are not
joined, winding, radius clipping, de-duplication, and the class filter.

One thing the tests pinned down: a splice carries a sideways step of a metre
or two where the two tiles disagree about the shore, so the winding assertion
skips segments under 5 m and separately asserts those steps stay under 3 m.

### 2. WebGPU overlay, run for real

`src/routes/webgpu/+page.svelte` plus `scripts/verify-webgpu.ts`. Chrome is
spawned directly in new headless mode with the Vulkan flags and attached over
CDP, the approach surf-lab's `scripts/browser.ts` worked out first. Every one
of those flags is load-bearing: dropping `--disable-vulkan-surface` makes
`requestAdapter` never produce an adapter at all.

Evidence, from the run above:

- adapter `nvidia lovelace`, so the real RTX 4090 over Vulkan, not swiftshader
- `frame.gpu.device` is a `GPUDevice` with `maxTextureDimension2D=8192`,
  `maxBufferSize=268435456`
- a compute shader dispatched on that device returned `[49, 4096, 65025]` for
  indices 7, 64 and 255 of `id.x * id.x`
- the canvas cleared to the requested colour: a corner pixel read back off the
  GPU as rgb 10,23,46 against the requested 0.04/0.09/0.18
- a ring drawn at a projected coordinate read back as rgb 28,199,250, and
  after a drag of -218,-102 px the ring was still at the coordinate

**Screenshots of the GPU path are blank** and are not evidence. Under these
flags headless Chrome composites GPU layers somewhere the screenshotter cannot
see. That is why the harness reads pixels back with `copyTextureToBuffer`
instead, which reads the actual render target and is the stronger proof. The
2d harness and `scripts/shots.mjs` use Playwright's normal launcher with
swiftshader and do capture correctly.

Two things the real run produced:

- **Adapter retry.** A fresh headless Chrome returns `null` from the first
  `requestAdapter`; the harness measured the adapter arriving on attempt 2.
  `<Overlay>` now retries (`gpuAdapterRetries`, default 5). Worth being
  precise: from cold on `/webgpu` the adapter came back on attempt 1, because
  the map has finished loading by the time the overlay asks, so the retry is
  insurance rather than something that fires every time here. It is proven
  deterministically instead: the harness stubs the first two `requestAdapter`
  calls to return `null` and asserts the overlay still reaches ready on
  attempt 3.
- **`gpuUsage`.** The canvas was configured `RENDER_ATTACHMENT` only, so
  nothing could read it back. `gpuUsage` plus the exported
  `GPU_RENDER_ATTACHMENT` and `GPU_COPY_SRC` constants let a consumer ask for
  `COPY_SRC` without needing `@webgpu/types` to name it.

### 3. Basemap theming

`src/lib/theme.ts` (`themeStyle`, `tokensFor`) and `src/lib/themes.ts` (the
four presets). `<Map theme={...}>` applies it.

Colours are rewritten inside whatever expression the style already uses, so a
zoom-interpolated colour keeps its stops and its interpolation shape and only
the colour at each stop changes; alpha is carried over so layers the style
made faint stay faint. The theme also sets the style's `sky` block for the
globe atmosphere, and can add a coastline hairline, which the stock styles do
not have and which is most of what makes a coast read as drawn.

Three things worth knowing:

- **Fonts.** OpenFreeMap serves only `Noto Sans Regular`, `Noto Sans Italic`
  and `Noto Sans Bold` (probed: anything else 404s). So `chart` cannot have a
  real monospace and `paper` cannot have a real serif. They use spaced
  capitals and italic instead. Real ones would mean hosting glyph PBFs, which
  is vendoring.
- **`--mk-map-background`.** Under globe projection the canvas is transparent
  outside the planet, so the host page was showing through behind the globe
  and fighting the theme. This was visible as a dark void behind `mono` even
  though its sky is white. Each preset now sets it to its sky colour.
- **A real bug this surfaced.** `--mk-panel-background` was declared at
  `:root` as `var(--mk-color-surface)`. A custom property whose value is
  another `var()` resolves on the element it is declared on, so that alias
  froze to the `:root` value: any consumer overriding `--mk-color-surface` on
  a wrapper got a white panel anyway. `<Panel>` now writes the fallback at the
  point of use. Same for `--mk-panel-inset`.

`scripts/shots.mjs` renders every preset at the three views and enforces the
400 KB budget (largest is 328 KB). The demo reads `?theme=` and writes it back
to the URL.

## Decisions taken (from the control plane)

- No cluster mode in `<Pins>`. Large sets go through `<Layer>` with a GeoJSON
  source and a symbol or circle layer, which MapLibre can cluster. Noted in
  the README.
- `coastlineNear` returns boundaries only. No water polygons; surf-lab does
  not need a land mask.
- `coastlineNear` stays a pure query. The caller flies first; the two-line
  example stays in the docs.

## What is next

1. **Daniel picks a theme.** Then make it the demo default and say so in the
   README. If none of the four land, the quickest lever is a copy of `paper`
   or `ink` with different `water`, `land` and `coastline`.
2. **Tag 0.1.1** once the theme is settled, so surf-lab gets the adapter retry
   and `gpuUsage`. Needs the control plane; `git push` is denied here.
3. **`<Pins>` at scale** is still DOM-based, fine for tens or low hundreds.
   A client map with thousands of competitor pins wants the `<Layer>` route,
   which is documented but not demonstrated.
4. **Clustering is undemonstrated.** `<Layer>` passes `cluster: true` through
   to the source, but nothing in the demo or docs shows it working.
5. **Nazaré still returns 19 polylines.** The dominant one is 2894 m and
   usable. A 2 km circle there holds breakwaters, a harbour mouth and a river,
   so the fragments may be real. Worth confirming against surf-lab before
   tuning further.
6. **`themeStyle` has no unit tests.** The colour parser and the
   expression-preserving recolour are pure functions and deserve the same
   treatment `geo.ts` got. They are currently only checked by eye in the
   screenshots.

## Open questions for Daniel

- Which theme, and does the chosen one want a tweak before it becomes the
  default?
- `chart` tints inland water lighter than ocean via `properties.class`. It
  reads as shallows, but it is not depth. Is that the right call, or should
  the preset drop the effect rather than imply bathymetry?

## Box notes

- No Node. Bun 1.4 at `~/.bun/bin/bun`; `export PATH=$HOME/.bun/bin:$PATH`.
- Playwright browsers: `bun node_modules/playwright/cli.js install chromium`.
  `bunx playwright install` fetches a build that does not match the pinned
  `playwright-core` and leaves launching broken.
- Two browser paths on purpose. `scripts/verify.mjs` and `scripts/shots.mjs`
  use Playwright's launcher with swiftshader, which screenshots correctly.
  `scripts/verify-webgpu.ts` spawns Chrome itself for the real GPU and cannot
  screenshot. Do not try to merge them.
- Dev server in tmux `mapkit-dev`, bound to 127.0.0.1:5180.
