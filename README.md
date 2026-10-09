# map-kit

Svelte 5 components over [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
and [OpenFreeMap](https://openfreemap.org) vector tiles: a globe you pan and
zoom, pins from `[{id, lat, lon, props}]`, a side panel for the selected pin,
named toggle layers, fly-to, and an overlay slot that mounts a canvas or WebGPU
surface registered to map coordinates. Themed by CSS tokens.

Domain-agnostic on purpose. The first consumer is
[surf-lab](https://github.com/dan-slater/surf-lab), which clicks a coast and
simulates it; client data maps with competitor pins, prices, radius rings and
heat layers reuse the same components with different data.

No API key. OpenFreeMap is free and keyless. Please respect its usage note and
do not bulk-download tiles.

## Install

Consumed by semver git tag, never by branch, and never published to npm.

```json
{
	"dependencies": {
		"@dan-slater/map-kit": "github:dan-slater/map-kit#semver:^0.1.0"
	}
}
```

`maplibre-gl ^5` and `svelte ^5` are peer dependencies, so install them too:

```sh
bun add maplibre-gl
```

The package imports MapLibre's own stylesheet, so there is nothing to add to
your app CSS.

## Quick start

```svelte
<script lang="ts">
	import { Map, Pins, Panel, type Pin } from '@dan-slater/map-kit';

	const pins: Pin<{ name: string; price: number }>[] = [
		{ id: 'a', lat: -34.0308, lon: 24.9338, props: { name: 'Jeffreys Bay', price: 120 } },
		{ id: 'b', lat: 39.601, lon: -9.084, props: { name: 'Nazaré', price: 95 } }
	];

	let selectedPin = $state<Pin<{ name: string; price: number }> | null>(null);
</script>

<div style="height: 100vh">
	<Map center={[0, 20]} zoom={1.8}>
		{#snippet children()}
			<Pins {pins} bind:selectedPin />
			<Panel item={selectedPin} open={selectedPin !== null} title={selectedPin?.props?.name}>
				{#snippet children(pin)}
					<p>{pin.props?.price} per night</p>
				{/snippet}
			</Panel>
		{/snippet}
	</Map>
</div>
```

`<Map>` fills its parent, so give the parent a height.

Everything inside `<Map>`'s `children` snippet renders in a click-through layer
over the MapLibre canvas, and can reach the map through context. That is why
`<Pins>`, `<Layer>` and `<Overlay>` go inside it.

## Components

### `<Map>`

A MapLibre map on **globe projection** by default (MapLibre GL JS v5), with an
OpenFreeMap style.

```svelte
<Map
	bind:map
	bind:center
	bind:zoom
	style="liberty"
	projection="globe"
	interactive
	onclick={(e) => console.log(e.lon, e.lat, e.point)}
	onready={(map) => console.log('loaded', map)}
>
	{#snippet children()}...{/snippet}
	{#snippet loading()}Loading{/snippet}
</Map>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `center` | `[0, 20]` | `[lon, lat]`. Two-way: pan and it writes back. |
| `zoom` | `1.6` | Two-way. |
| `bearing`, `pitch` | `0` | Two-way. |
| `style` | `'liberty'` | `'liberty'`, `'positron'`, `'bright'`, a style URL, or a style object. |
| `interactive` | `true` | Reactive: flipping it enables or disables the gesture handlers. |
| `projection` | `'globe'` | `'globe'`, `'mercator'`, or a full projection spec. |
| `map` | `null` | Bindable. The live MapLibre map. |
| `loaded` | `false` | Bindable. `true` after the map's `load`. |
| `options` | none | Extra MapLibre `MapOptions`, merged last. |

Events: `onclick` gives `{ lon, lat, point, originalEvent }`; `onmove` and
`onmoveend` give `{ center, zoom, bearing, pitch }`; `onready` gives the map;
`onerror` gives whatever went wrong.

Component methods, via `bind:this`:

```svelte
<Map bind:this={mapComponent} />
<button onclick={() => mapComponent.flyTo({ lon, lat, zoom: 14 })}>Go</button>
```

`flyTo(options)` returns a promise that resolves when the camera settles.
`getMap()` returns the map or `null`. `ready()` resolves with the map once it
has loaded.

The projection is applied after the style loads, and re-applied after a
`setStyle`, because OpenFreeMap's styles do not declare one.

### `<Pins>`

```svelte
<Pins
	{pins}
	bind:selected
	bind:selectedPin
	bind:hovered
	anchor="bottom"
	onselect={(pin) => console.log(pin)}
/>
```

`pins` is `[{ id, lat, lon, props }]`. `props` is yours; the component never
reads it except to look for `props.name` when it needs an accessible label.

`selected` holds the selected **id** or `null` and is two-way. `selectedPin`
is the matching pin object, kept in sync for you, so a `<Panel>` can bind
straight to it. `toggle` (default `true`) makes clicking the selected pin clear
the selection.

The default marker is plain SVG styled entirely by `--mk-` tokens. Replace it
with a snippet when you need something else, for example a price label:

```svelte
<Pins {pins} bind:selected>
	{#snippet pin(p, state)}
		<span class="price" class:selected={state.selected}>
			{p.props.price}
		</span>
	{/snippet}
</Pins>
```

The snippet gets `(pin, { selected, hovered, index })`.

Pins are positioned by writing a transform on every map move, so they stay glued
to their coordinates. Under globe projection, pins behind the planet fade out
via `--mk-pin-occluded-opacity`; set `hideOccluded={false}` to keep them.

**`<Pins>` is DOM-based and has no clustering.** Each pin is a real element
that gets a transform on every frame, which is what makes custom snippets,
focus and keyboard access work. That suits tens or low hundreds of pins. For
large sets, put the data through `<Layer>` with a GeoJSON source and a symbol
or circle layer, which MapLibre renders on the GPU and can cluster for you:

```svelte
<Layer
	id="sites"
	data={points(items)}
	source={{ cluster: true, clusterRadius: 50 }}
	layers={[
		{ type: 'circle', filter: ['has', 'point_count'] },
		{ type: 'circle', filter: ['!', ['has', 'point_count']] }
	]}
/>
```

The two approaches mix: a `<Layer>` for the crowd, `<Pins>` for the handful you
want rich markup on.

### `<Panel>`

A side panel bound to whatever is selected. Becomes a bottom sheet below 640px.

```svelte
<Panel item={selectedPin} bind:open position="right" title={selectedPin?.props?.name}>
	{#snippet children(pin)}
		<p>{pin.props.note}</p>
	{/snippet}
	{#snippet empty()}
		<p>Select a pin.</p>
	{/snippet}
	{#snippet footer()}
		<small>Prices exclude tax</small>
	{/snippet}
</Panel>
```

`children` is only rendered when `item` is not null, so you can use `pin.props`
without a guard. `position` is `'left'` or `'right'`. `header` replaces the
title bar wholesale. `closable` (default `true`) shows the close button, which
sets `open` to `false` and calls `onclose`.

`<Panel>` does not need a map, so it works outside `<Map>` too.

### `<Layer>`

A named toggle layer wrapping a GeoJSON source plus one or more MapLibre
layers.

```svelte
<script lang="ts">
	import { Layer, circle } from '@dan-slater/map-kit';
	let showRing = $state(true);
</script>

<Layer
	id="radius-ring"
	data={circle(lon, lat, 2000)}
	bind:visible={showRing}
	layers={[
		{ type: 'fill', paint: { 'fill-color': '#1f6feb', 'fill-opacity': 0.08 } },
		{ type: 'line', paint: { 'line-color': '#1f6feb', 'line-width': 1.5 } }
	]}
/>
```

`id` names the source; layers get `id` when there is one, or `id-0`, `id-1`
when there are several. Changing `data` calls `setData` rather than rebuilding.
`visible` toggles the layout `visibility` property. `before` inserts below an
existing layer id. `source` passes extra GeoJSON source options such as
`cluster: true`. The layers are re-added automatically after a `setStyle`.

With no `paint` of its own, a layer reads `--mk-color-accent` off the map
container, so an unstyled layer still matches your theme. MapLibre cannot parse
`var(...)` itself; use the `cssToken` helper to resolve a token in JS.

A heat layer is the same shape:

```svelte
<Layer id="heat" data={points(items)} layer={{ type: 'heatmap' }} bind:visible />
```

### `<Overlay>`

A canvas sized to the map container at device pixel ratio and kept registered
to map coordinates. This is the surface a simulation draws into.

```svelte
<Overlay ondraw={draw} />

<script lang="ts">
	import type { OverlayFrame } from '@dan-slater/map-kit';

	function draw(frame: OverlayFrame) {
		const ctx = frame.ctx!;
		const { x, y } = frame.project(24.9338, -34.0308);
		ctx.strokeStyle = '#e3663e';
		ctx.beginPath();
		ctx.arc(x, y, 11, 0, Math.PI * 2);
		ctx.stroke();
	}
</script>
```

The frame object handed to `ondraw`, to `onready`, and to the child snippet:

```ts
{
	canvas, map, ctx, gpu,
	width, height, pixelRatio,
	frame, reason,
	project(lon, lat),        // -> { x, y } in CSS pixels on this canvas
	unproject(x, y),          // -> { lon, lat }
	metersPerPixel(lat, lon?),// measured from the live camera
	isOccluded(lon, lat),     // behind the planet under globe projection
	clear(),
	requestRedraw(reason?)
}
```

`ondraw` fires once per animation frame in which the map moved, resized, or
changed style, coalescing multiple triggers into one call. `continuous` makes
it fire every frame. `mode="webgpu"` configures a WebGPU context instead of a
2d one.

The full contract, including coordinate conventions, the redraw lifecycle and
the WebGPU details, is in **[docs/overlay.md](docs/overlay.md)**.

## Helpers

### `flyTo(map, options)`

```ts
await flyTo(map, { lon, lat, zoom: 14, pitch: 0, bearing: 0, duration: 1500 });
```

Resolves when the camera settles, which is the moment it is safe to run a tile
query. `duration: 0` jumps.

### `enuFrame(lat0, lon0)`

A local east-north tangent plane. Metres, `+x` east, `+y` north, origin at the
given point.

```ts
const frame = enuFrame(-34.0308, 24.9338);
frame.toMeters(lon, lat); // -> [xEast, yNorth]
frame.toLonLat(x, y); // -> [lon, lat]
```

It linearises WGS84 once at the origin, so error is well under 0.1 m at 5 km
and around 2 m at 30 km. Right for a simulation box, wrong for continents.

### `coastlineNear(map, options)`

Reads the water polygons already loaded in the browser and returns the polygon
boundary within a radius as ordered polylines in tangent-plane metres.

```ts
await flyTo(map, { lon, lat, zoom: 14, duration: 0 });
const coast = await coastlineNear(map, { lon, lat, radiusMeters: 2000, classes: ['ocean'] });

coast.polylines[0].points; // [[xEast, yNorth], ...]
coast.polylines[0].lengthMeters;
coast.frame.toLonLat(x, y); // back to geography
```

Walking a polyline from index 0, **water is on the left**. Zoom 13 to 15 gives
useful detail; zoom 14 is the deepest OpenFreeMap serves for this layer. At
J-Bay, zoom 14, 2 km radius, it returns one 4332 m polyline of 133 vertices.

It handles the two things that make this harder than it looks: vector tiles
invent straight clip edges that are not coastline, and removing them leaves
neighbouring tiles' pieces overlapping by about 60 m with vertices that do not
match. Both are explained, with the measured numbers and every option, in
**[docs/coastline.md](docs/coastline.md)**.

### Other exports

| Export | What it does |
| --- | --- |
| `metersPerPixel(map, lat, lon?)` | Ground metres per CSS pixel, measured from the camera. |
| `isLocationOccluded(map, lon, lat)` | Behind the planet under globe projection. |
| `waitForIdle(map, timeoutMs?)` | Resolve once tiles have settled. |
| `circle(lon, lat, radiusMeters)` | A geodesic circle as GeoJSON, for radius rings. |
| `points(items)` | Points as a GeoJSON FeatureCollection, for heat layers. |
| `linesFromMeters(polylines, frame)` | Tangent-plane polylines back to GeoJSON. |
| `cssToken(element, name, fallback)` | Resolve a `--mk-` token for MapLibre paint. |
| `distanceMeters`, `wrapLongitude`, `polylineLength`, `simplifyPolyline` | Plain geometry. |
| `useMap()`, `useMapOptional()` | Reach the enclosing `<Map>` from your own component. |
| `OPENFREEMAP_STYLES`, `resolveStyle` | The three style URLs. |

## Theming the basemap

The stock OpenFreeMap styles are general-purpose cartography: many hues, tuned
for finding a street. A product map usually wants the opposite, a quiet ground
for its own data to sit on. Pass a theme and the basemap is recoloured from a
small token set, and the globe gets a matching atmosphere.

```svelte
<script lang="ts">
  import { Map, themes, tokensFor } from '@dan-slater/map-kit';
</script>

<div style={tokensFor(themes.ink)}>
  <Map theme={themes.ink}>...</Map>
</div>
```

`theme` recolours the map. `tokensFor(theme)` returns the matching `--mk-`
declarations so the pins and panel come along with it; it is a declaration
list, so it drops straight into a `style` attribute.

### The four presets

| | |
| --- | --- |
| `ink` | Deep navy ocean, near-black land, a teal coastline glow and coral pins. Sparse cool-grey labels. For a dark product UI. |
| `paper` | Warm off-white land, pale blue-grey water, hairline ink coasts, italic labels, faint shaded relief. Editorial. |
| `chart` | Nautical chart: cream land, pale cyan water tinted lighter inland, navy coast and dashed boundaries, spaced capitals. |
| `mono` | One dark, one light, nothing else. No roads, no labels, no atmosphere. Reads as a graphic. |

```svelte
<Map theme={themes.ink} />     <!-- dark, teal coast, coral pins -->
<Map theme={themes.paper} />   <!-- warm off-white, editorial -->
<Map theme={themes.chart} />   <!-- nautical chart -->
<Map theme={themes.mono} />    <!-- duotone graphic -->
```

See them at `docs/img/themes/`, three views each.

### The theme tokens

| Token | Meaning |
| --- | --- |
| `water` | Oceans, lakes and rivers. |
| `waterShallow` | Tints water whose `class` is not `ocean`. OpenMapTiles carries no depth, so this is a class split, not bathymetry. |
| `waterway` | Rivers drawn as lines. Defaults to `water`. |
| `land` | The ground, and the colour behind everything. |
| `landLow` | Natural cover: wood, grass, sand, ice. |
| `landHigh` | Human land use: residential, school, cemetery. |
| `parks` | Parks. `null` hides them. |
| `roads` | The road network, flattened to one colour. `null` hides it. |
| `roadCasing` | Road casings, if you want them distinct. Defaults to `roads`. |
| `roadMinZoom` | Hide roads below this zoom. |
| `buildings` | Footprints and extrusions. `null` hides them. |
| `boundaries` | Admin boundaries. `null` hides them. |
| `boundaryDash` | Dash pattern for boundaries. |
| `coastline` | A hairline along the water edge, which the stock styles do not have. `null` for none. |
| `coastlineWidth`, `coastlineBlur` | Width at zoom 10, and blur for a glow. |
| `labelText`, `labelHalo` | Label colour and halo. |
| `labelWater` | Water label colour. Defaults to `labelText`. |
| `labelDensity` | `'full'`, `'sparse'` (countries, states, cities, towns and water only) or `'none'`. |
| `labelUppercase`, `labelLetterSpacing` | Case and tracking. |
| `fontStack` | See the note below. |
| `hillshadeOpacity` | Natural Earth shaded relief, 0 to 1. 0 removes it. |
| `sky` | `{ space, halo, blend }` for the globe's atmosphere. |
| `tokens` | The `--mk-` overrides `tokensFor` emits. |

Colours are rewritten inside whatever expression the style already uses, so a
zoom-interpolated colour keeps its stops and its interpolation and only the
colour at each stop changes. Alpha is carried over, so layers the style
deliberately made faint stay faint.

**On fonts.** OpenFreeMap serves only `Noto Sans Regular`, `Noto Sans Italic`
and `Noto Sans Bold`. Naming anything else gives you blank labels, so `chart`
reaches for spaced capitals and `paper` for italic rather than a real
monospace or serif. Real ones would mean hosting your own glyph PBFs.

### Your own theme

Copy a preset and change what you need:

```ts
import { themes, type BasemapTheme } from '@dan-slater/map-kit';

const brand: BasemapTheme = {
	...themes.paper,
	water: '#e3edf2',
	coastline: '#0f766e',
	tokens: { ...themes.paper.tokens, '--mk-color-pin': '#0f766e' }
};
```

`themeStyle(style, theme)` is exported if you want to apply a theme to a style
object yourself. `<Map>` fetches the style and themes it before the map is
built, so the stock cartography never flashes; later changes to `style` or
`theme` go through one `setStyle` with `transformStyle`.

## Theming the components

Every colour, radius, size and font comes from a CSS custom property with an
`--mk-` prefix. Override the ones you care about:

```css
:root {
	--mk-color-accent: #0f766e;
	--mk-color-pin: #0f766e;
	--mk-color-pin-selected: #f59e0b;
	--mk-radius-lg: 4px;
	--mk-font-family: 'Inter', system-ui, sans-serif;
}
```

Defaults are declared through `:where(:root)`, which carries zero specificity,
so a plain `:root` block of your own always wins regardless of import order.
Tokens inherit, so scoping a theme to a subtree gives you two differently
branded maps on one page.

The complete list, with defaults and what uses each one, is in
**[docs/theming.md](docs/theming.md)**.

## Development

No Node needed; this repo is built with [Bun](https://bun.sh).

```sh
bun install
bun run check        # svelte-kit sync && svelte-check
bun test             # unit tests for the geometry and the tile query
bun run build        # svelte-package from src/lib to dist
bunx vite dev --host 127.0.0.1 --port 5180   # the demo app
```

`tests/` covers `geo.ts` against independently computed WGS84 values, and the
coastline stitcher against synthetic vector tiles that reproduce real clipping:
each tile buffered by 64/4096 and simplifying its own copy of a shared shore.

`src/lib` is the package. `src/routes` is a demo that exercises every
component: a globe with six pins, a panel bound to the selection, a toggle
layer drawing a 2 km radius ring, a 2d overlay with a crosshair glued to the
selected pin, and a button that runs `coastlineNear` and draws the result.

`scripts/verify.mjs` drives the demo through headless Chromium and prints what
`coastlineNear` returns at three coastlines, so the numbers in the docs can be
reproduced:

```sh
bun node_modules/playwright/cli.js install chromium   # once
bun scripts/verify.mjs
```

Consumers install from a git tag and run `prepare`, which is why `dist` is not
committed.

## Licence

MIT. Map data © OpenStreetMap contributors, tiles by
[OpenFreeMap](https://openfreemap.org) and
[OpenMapTiles](https://openmaptiles.org).
