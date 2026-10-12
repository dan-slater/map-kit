# Changelog

Consumed by git tag, so every release here is also a tag on `main`.

## Unreleased

## 0.1.1 (2026-10-12)

Mostly additive, with one correction that matters: `coastlineNear` reported
the wrong side for the water. The geometry is unchanged, but
`result.waterSide` now reads `'right'` where it used to read `'left'`. Anyone
who trusted the old label was getting the opposite of what they were told, so
read the Fixed entry before upgrading.

### Added

- `coastlineNear` takes a `waterSide` option, `'right'` (default) or
  `'left'`, and the side is now a guarantee rather than an observation. Each
  query measures the winding of the source from the signed area of the
  largest closed ring it read, and reverses the polylines when that does not
  match what was asked for, so the contract holds against a tileset that winds
  the other way. `stats.detectedWaterSide` and `stats.reversed` report what
  happened. The default matches OpenFreeMap, so it reverses nothing.
- **A settings pattern, without a settings UI.** `theme` and `projection` are
  now two-way on `<Map>`; `mapSettings()` is a headless runes store holding
  the theme, projection, effect toggles and derived `--mk-` tokens; and
  `<Controls>` is one optional stock panel, themed by the tokens, with a slot
  for your own controls. Take as few of the three as you like.
- `themeNameOf(theme)` names a preset, or returns `null` for a theme of your
  own.
- **Globe effects**, five of them, each opt-in and off by default: they do
  nothing until mounted, so a client data map can take one and skip the rest.
  `<GlobeGlow>` traces a rim of light around the limb in any colour, fading
  into space, which MapLibre's style-driven `sky` cannot do. `<Graticule>`
  draws meridians and parallels as a `<Layer>` that fades out with zoom.
  `<AutoRotate>` spins the globe while nobody is touching it, stops on any
  interaction, resumes after `idleMs`, and stands down when the tab is hidden.
  `<StarField>` puts a deterministic star field behind the planet as a CSS
  background, at no per-frame cost. `sweepTo` flies pitched and straightens up
  on arrival.
- `graticuleGeoJSON`, `starFieldDataUri` and `destination` are exported, so the
  geometry and the image behind the effects are usable on their own.
- - **Basemap theming.** `themeStyle(style, theme)` recolours an OpenMapTiles
  style from a small token set, and `<Map theme={...}>` applies it. Colours are
  rewritten inside whatever expression the style already uses, so a
  zoom-interpolated colour keeps its stops and its interpolation, and alpha is
  carried over. The theme also sets the globe's atmosphere, and can add a
  coastline hairline, which the stock styles do not have.
  A theme only touches the OpenMapTiles groups it recognises; every other
  layer, including a consumer's own and any source-layer OpenMapTiles adds
  later, is passed through untouched rather than recoloured by guesswork or
  dropped.
- Four presets in `themes`: `ink`, `paper`, `chart` and `mono`. `ink` is the
  demo's default; `<Map theme>` still defaults to `null`, so installing
  map-kit never changes an app's cartography on its own. Each carries
  matching `--mk-` overrides, which `tokensFor(theme)` returns as a CSS
  declaration list so the pins and panel follow the basemap.
- `--mk-map-background` paints behind the map canvas. Under globe projection
  the canvas is transparent outside the planet, so without this the host page
  shows through and fights the theme. Defaults to `transparent`, which is the
  previous behaviour; each preset sets it to its sky colour.
- `scripts/shots.mjs` renders every preset at three views into
  `docs/img/themes/`, and the demo takes `?theme=<name>` so a link carries a
  look.
- `<Overlay>` retries `requestAdapter` when it comes back `null`. A browser
  that has not yet started its GPU process answers `null` once and succeeds a
  moment later, which is routine in headless Chrome and in a cold tab. New
  props `gpuAdapterRetries` (default 5) and `gpuAdapterRetryDelayMs` (default
  300). Previously a single `null` ended in `onerror` and no overlay.
- `<Overlay gpuUsage>` sets the WebGPU canvas `usage`. Defaults to
  `RENDER_ATTACHMENT`, as before; add `COPY_SRC` to read the rendered canvas
  back with `copyTextureToBuffer`.
- `<Overlay gpuPowerPreference>` passes `powerPreference` to `requestAdapter`,
  for picking the discrete GPU.
- `GPU_RENDER_ATTACHMENT` and `GPU_COPY_SRC` constants, so naming a texture
  usage does not require `@webgpu/types`.
- `OverlayGpu.usage` and `OverlayGpu.adapterAttempts`. The attempt count is the
  first thing to look at when overlay startup feels slow.
- `bun test`: unit tests for `geo.ts` against independently computed WGS84
  values, and for the coastline stitcher against synthetic vector tiles that
  reproduce real tile clipping.
- A `/webgpu` route in the demo app, and `scripts/verify-webgpu.ts`, which
  drives it on real hardware and reads pixels back off the GPU.

### Changed

- `result.waterSide` reads `'right'` rather than `'left'`. See Fixed.
- `dist` is committed and the `prepare` script is gone. `files` is unchanged.
  New `bun run check:dist` rebuilds and fails if the committed output is
  stale; run it before tagging.
- map-kit itself is built with SvelteKit 3 and Vite 8. `svelte.config.js` is
  gone (Kit 3 removed it; the config moved into the `sveltekit()` Vite
  plugin), the demo uses `#lib` rather than the removed `$lib`, and
  `tsconfig.json` extends `$app/tsconfig`, since Kit 3 no longer writes
  `.svelte-kit/tsconfig.json`. None of this reaches consumers, because `dist`
  ships prebuilt: a consumer's Kit and Vite versions are independent of
  map-kit's.
- The `chart` preset no longer tints inland water lighter than the sea. It
  read as shallows, and OpenMapTiles has no depth data behind it. The theme
  option that does the split is still there for anyone who wants lakes
  distinct from the sea, renamed from `waterShallow` to `waterInland` so the
  name says what it is. No preset uses it.

### Fixed

- **The first theme change after load was silently ignored.** `<Map>`'s
  restyle effect read a non-reactive variable to find the map, so it never ran
  when the map appeared; the first real change then hit the guard meant for
  the initial render and was swallowed. Changing theme twice worked, which is
  why it survived the first round of screenshots.
- **A style change dropped the projection**, leaving a globe map on mercator.
  Putting the projection back from the `styledata` handler depended on timing
  that did not always come out right, so it is now carried into the incoming
  style by `transformStyle`.
- **A git-tag install produced a package with no `dist`.** Up to 0.1.0 the
  `prepare` script built `dist` on install. That cannot work: a git dependency
  installs only its `dependencies`, so `svelte-package` (a devDependency) is
  not present in the consumer, and `bun pm trust` surfaced it as
  `svelte-package: command not found`. Before even reaching that, bun blocks
  lifecycle scripts for untrusted dependencies by default, so the build was
  skipped silently and `exports` pointed at a `dist` that did not exist.
  `dist` is now committed and `prepare` is gone, so installing is a clone and
  nothing else. Reported by the surf-lab line against SvelteKit 3.
- **`coastlineNear` documented the wrong side for the water.** Up to 0.1.0 the
  docs and `result.waterSide` said water lay to the left of a polyline's
  direction of travel. It is the right: OpenFreeMap's water rings run
  clockwise in longitude and latitude, not anticlockwise as the OGC convention
  would suggest. Measured with the new `scripts/probe-winding.mjs`, which
  steps off each segment and asks the water polygons: 165 of 165 segments at
  J-Bay, Nazaré and Bells Beach have water on the right. The geometry never
  changed, only the label was wrong, so code written against the old label was
  reading the opposite of what it got. Reported by the surf-lab line.
- `--mk-panel-background` and `--mk-panel-inset` were declared at `:root` as
  aliases of `--mk-color-surface` and `--mk-space-3`. A custom property whose
  value is `var(--other)` resolves on the element it is declared on, so those
  aliases froze to the `:root` values and ignored any override further down
  the tree: setting `--mk-color-surface` on a wrapper left the panel white.
  `<Panel>` now writes the fallback at the point of use instead.

- `<Overlay mode="webgpu">` now sizes the canvas before configuring the
  context rather than after. WebGPU takes the swap-chain size from the canvas
  at `getCurrentTexture()`, not at `configure()`, so this was not producing
  wrong output; it just means `configure` sees the real size.

### Documentation

- `docs/overlay.md` covers the adapter retry, canvas usage and readback, and
  the fact that the preferred canvas format is `rgba8unorm` on Linux and
  `bgra8unorm` on many other platforms.
- README notes that `<Pins>` is DOM-based with no clustering, and that large
  sets belong in a `<Layer>` with a GeoJSON source.
- `docs/coastline.md` explains the winding, how it was measured, and why the
  side is now guaranteed rather than inherited from the tileset.

## 0.1.0

First release. `<Map>` with globe projection over OpenFreeMap, `<Pins>`,
`<Panel>`, `<Layer>`, `<Overlay>` in 2d or WebGPU, `flyTo`, `enuFrame`,
`coastlineNear`, and the `--mk-` theme tokens.
