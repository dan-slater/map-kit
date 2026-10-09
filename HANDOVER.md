# HANDOVER

Last updated: 2026-10-09, after two upstream fixes from the surf-lab line.

## State

`v0.1.0` is tagged and on GitHub. Everything since is unreleased 0.1.x work,
recorded in `CHANGELOG.md` under 0.1.1. **It is no longer purely additive**:
`result.waterSide` now reads `'right'` where it read `'left'`, because the old
label was wrong. Read the Fixed section of the changelog before tagging.

Waiting on Daniel: **pick a basemap theme.** Four presets are rendered at three
views each in `docs/img/themes/`. The demo switcher is live, so
`http://127.0.0.1:5180/?theme=chart` flicks between them (`ink`, `paper`,
`chart`, `mono`, `none`). The demo currently defaults to `ink`.

## The two upstream fixes

### 1. The coastline winding was documented backwards

The surf-lab line was right. Water is on the **right** of a `coastlineNear`
polyline, not the left. The geometry was always right-handed; only the label
and the docs were wrong, so anyone trusting them read the opposite of what
they got.

Settled by measurement, not argument. `scripts/probe-winding.mjs` steps off
each segment and asks the water polygons which side is wet:

```
J-Bay       water only on the LEFT: 0   only on the RIGHT: 60
Nazare      water only on the LEFT: 0   only on the RIGHT: 45
Bells Beach water only on the LEFT: 0   only on the RIGHT: 60
```

The signed area of the largest source ring is negative at all three, meaning
OpenFreeMap winds its water rings clockwise in longitude and latitude, putting
the interior on the right. The widespread assumption that vector tiles follow
the OGC anticlockwise convention is simply not what OpenFreeMap serves.

The side is now a **guarantee** rather than an inheritance. `coastlineNear`
takes `waterSide: 'left' | 'right'` (default `'right'`), measures the source
winding per query from the largest closed ring, and reverses the polylines if
it does not match. `stats.detectedWaterSide` and `stats.reversed` report what
happened. Against OpenFreeMap the default reverses nothing.

Two things this shook out that are worth keeping:

- Only a **closed** ring has an orientation. The first version measured the
  shoelace sum of any ring, which is a meaningless number for an open
  LineString and made a line-based water source report a bogus side.
- The synthetic tiles in `tests/coastline.test.ts` were wound anticlockwise,
  the opposite of the real tileset. They would have passed while the real
  thing behaved differently. They are now wound like OpenFreeMap, and there is
  a test that a tileset wound the other way is corrected rather than passed
  through.

`scripts/verify.mjs` now verifies the claim on every run rather than trusting
it. The probe step is 5 m, not 50 m: it has to be smaller than the narrowest
water or land the coastline wraps around, or it lands on the far bank. At
Mundaka's estuary a 50 m step disagrees on 6 of 131 segments and a 5 m step on
none.

### 2. A git-tag install produced a package with no `dist`

Reproduced in a scratch SvelteKit 3 app at `~/orch-scratch/mapkit-consumer`
(Kit 3.0.1, Vite 8.3.4, vite-plugin-svelte 7.3.1). Installing the `v0.1.0` tag
gave:

```
installed @dan-slater/map-kit@github:dan-slater/map-kit#13fac64
Blocked 1 postinstall. Run `bun pm untrusted` for details.
```

`dist/` absent. Forcing the script with `bun pm trust` gave the real cause:

```
svelte-package: command not found
error: prepare script from "@dan-slater/map-kit" exited with 127
```

**`prepare` can never work for a git dependency.** A git install resolves only
`dependencies`, not `devDependencies`, so `@sveltejs/package` is not in the
consumer's tree. Bun blocking untrusted lifecycle scripts by default just
hides it one layer earlier. This was never really about Kit 3: it would have
failed the same way under Kit 2 unless the consumer happened to have
`svelte-package` hoisted.

Fixed by committing `dist` and deleting `prepare`, so installing is a clone
and nothing else. `bun run check:dist` rebuilds and fails if the committed
output is stale; run it before tagging. `dist` is 236 KB over 37 files.

map-kit was also moved to SvelteKit 3 and Vite 8 so it matches its consumer.
That needed four migrations, each a Kit 3 breaking change:

- `svelte.config.js` is no longer read; the config moved into the
  `sveltekit()` Vite plugin, and without the old `kit` namespace.
- `$lib` was removed in favour of `#lib`, which comes from a `"imports"` field
  in `package.json`. The `alias` escape hatch works but is itself deprecated.
- `.svelte-kit/tsconfig.json` is no longer generated. map-kit's `check` had
  been passing only against a stale Kit 2 leftover, so a fresh clone would
  have failed. `tsconfig.json` now extends `$app/tsconfig`, which pins
  `types`, so `bun` has to be named there for `bun:test` to resolve.
- `@sveltejs/package` 3, `adapter-static` 4.

None of this reaches consumers: `dist` ships prebuilt, so a consumer's Kit and
Vite versions are independent of map-kit's.

**Proof it works.** In the scratch Kit 3 app, against the fixed commit:

```
bun add git+file:///home/danielslater/code/map-kit#f99f00a
  -> installed, no blocked postinstall, dist present (37 files)
bun run check  ->  198 FILES 0 ERRORS 0 WARNINGS
```

and driven headless at `http://127.0.0.1:5184/`:

```
status: map-ready        (<Map onready> fired)
canvases: 1              (MapLibre canvas rendered)
pins: 1                  (<Pins> rendered)
pinFill: rgb(255,122,89) (the ink theme's coral reached the pin)
bg: rgb(3,7,12)          (--mk-map-background from the theme)
errors: none
```

Screenshot at `~/orch-scratch/consumer-map.png`: the ink globe over southern
Africa with the coral pin at J-Bay.

A `git+file://` URL was used because the fix is not pushed yet. It exercises
the identical code path in bun (clone the repo, no build, use the committed
`dist`); only the remote differs. The `github:` form needs the push.

## Latest verification

All run on this box on 2026-10-09, after the last commit.

```
bun run check     ->  361 FILES 0 ERRORS 0 WARNINGS
bun test          ->  76 pass, 0 fail, 265 expect() calls
bun run build     ->  src/lib -> dist
bun run check:dist->  clean
bunx publint      ->  All good!
bun scripts/verify.mjs  ->  RESULT: pass, water verified on the right
                            60/60, 45/45 and 60/60 sampled segments
```

Demo on `127.0.0.1:5180` in tmux `mapkit-dev`, log at
`~/orch-scratch/mapkit-dev.log`. Scratch consumer in tmux `mapkit-consumer`.

**`scripts/verify-webgpu.ts` cannot currently complete on this box, and it is
not map-kit's doing.** Under the Vulkan flags, MapLibre's own WebGL fragment
shader fails to compile (`Could not compile fragment shader`), which kills the
basemap on every route including `/`, so the overlay never reaches ready. On
`--swiftshader` the same build gets a real `GPUDevice` with working queue and
limits, which is what says the `<Overlay>` code is fine; that run then trips a
separate swiftshader quirk on buffer readback (`A valid external Instance
reference no longer exists`). The GPU path passed in full this morning with
unchanged overlay code. The GPU itself is idle (219 MiB used, 1 percent), so
this looks like driver or ANGLE state on the shared box. Worth re-running
before anyone relies on the WebGPU path.

`coastlineNear` output is unchanged by this work, at zoom 14, 2 km radius,
`classes: ['ocean']`:

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
four presets). `<Map theme={...}>` applies it. `tests/theme.test.ts` covers
all of it, including a hand-written theme rather than a preset.

**A theme only touches the OpenMapTiles groups it recognises.** Everything
else is returned exactly as it came in, paint and layout objects included: a
consumer's own layers on their own sources, and any source-layer OpenMapTiles
adds later. That is asserted against every preset, `mono` included, so a theme
that hides almost the whole basemap still leaves a consumer's data alone.

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

**`chart` no longer tints inland water lighter than the sea** (control plane,
2026-10-09): it read as shallows and OpenMapTiles has no depth behind it. The
option that does the split survives for anyone who wants lakes distinct from
the sea, renamed `waterShallow` to `waterInland` so the name cannot imply
bathymetry either. No preset uses it, and a test asserts none does. The
`chart` screenshots have been re-rendered.

## Decisions taken (from the control plane)

- No cluster mode in `<Pins>`. Large sets go through `<Layer>` with a GeoJSON
  source and a symbol or circle layer, which MapLibre can cluster. Noted in
  the README.
- `coastlineNear` returns boundaries only. No water polygons; surf-lab does
  not need a land mask.
- `coastlineNear` stays a pure query. The caller flies first; the two-line
  example stays in the docs.
- No depth implied anywhere. `chart` shows all water in one colour.

## What is next

1. **Daniel picks a theme.** Then make it the demo default and say so in the
   README. If none of the four land, the quickest lever is a copy of `paper`
   or `ink` with different `water`, `land` and `coastline`.
2. **Push and tag 0.1.1.** surf-lab needs it for the installable `dist` and the
   corrected winding label. Needs the control plane; `git push` is denied here.
   The winding label change is not backwards compatible, so the tag note should
   say so.
3. **Re-run `scripts/verify-webgpu.ts` on the GPU path** once the box's
   ANGLE/Vulkan state is healthy again. Nothing in map-kit changed, but the
   full GPU proof is currently stale.
4. **`<Pins>` at scale** is still DOM-based, fine for tens or low hundreds.
   A client map with thousands of competitor pins wants the `<Layer>` route,
   which is documented but not demonstrated.
5. **Clustering is undemonstrated.** `<Layer>` passes `cluster: true` through
   to the source, but nothing in the demo or docs shows it working.
6. **Nazaré still returns 19 polylines.** The dominant one is 2894 m and
   usable. A 2 km circle there holds breakwaters, a harbour mouth and a river,
   so the fragments may be real. Worth confirming against surf-lab before
   tuning further.

## Open questions for Daniel

- Which theme, and does the chosen one want a tweak before it becomes the
  default?

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
