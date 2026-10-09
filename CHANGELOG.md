# Changelog

Consumed by git tag, so every release here is also a tag on `main`.

## Unreleased

## 0.1.1

Additive only. Nothing from 0.1.0 changed shape, so an existing consumer can
move up without touching their code.

### Added

- **Basemap theming.** `themeStyle(style, theme)` recolours an OpenMapTiles
  style from a small token set, and `<Map theme={...}>` applies it. Colours are
  rewritten inside whatever expression the style already uses, so a
  zoom-interpolated colour keeps its stops and its interpolation, and alpha is
  carried over. The theme also sets the globe's atmosphere, and can add a
  coastline hairline, which the stock styles do not have.
- Four presets in `themes`: `ink`, `paper`, `chart` and `mono`. Each carries
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

### Fixed

- `--mk-panel-background` and `--mk-panel-inset` were declared at `:root` as
  aliases of `--mk-color-surface` and `--mk-space-3`. A custom property whose
  value is `var(--other)` resolves on the element it is declared on, so those
  aliases froze to the `:root` values and ignored any override further down
  the tree: setting `--mk-color-surface` on a wrapper left the panel white.
  `<Panel>` now writes the fallback at the point of use instead.

### Changed

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

## 0.1.0

First release. `<Map>` with globe projection over OpenFreeMap, `<Pins>`,
`<Panel>`, `<Layer>`, `<Overlay>` in 2d or WebGPU, `flyTo`, `enuFrame`,
`coastlineNear`, and the `--mk-` theme tokens.
