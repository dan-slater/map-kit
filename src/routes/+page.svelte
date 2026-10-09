<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import {
		Layer,
		Map,
		Overlay,
		Panel,
		Pins,
		THEME_NAMES,
		circle,
		coastlineNear,
		enuFrame,
		flyTo,
		themeByName,
		themes,
		tokensFor,
		type ThemeName,
		type CoastlineResult,
		type MapStyleName,
		type OverlayFrame,
		type Pin
	} from '#lib/index.js';

	type SpotProps = {
		name: string;
		country: string;
		type: string;
		direction: string;
		note: string;
	};

	// Sample data for the demo only. The package itself knows nothing about this.
	const spots: Pin<SpotProps>[] = [
		{
			id: 'jbay',
			lat: -34.0308,
			lon: 24.9338,
			props: {
				name: 'Jeffreys Bay',
				country: 'South Africa',
				type: 'Point break',
				direction: 'Right',
				note: 'Long right-hand point over reef and cobble.'
			}
		},
		{
			id: 'pipeline',
			lat: 21.665,
			lon: -158.053,
			props: {
				name: 'Pipeline',
				country: 'Hawaii, USA',
				type: 'Reef break',
				direction: 'Left',
				note: 'Shallow reef close to a straight stretch of beach.'
			}
		},
		{
			id: 'teahupoo',
			lat: -17.847,
			lon: -149.267,
			props: {
				name: "Teahupo'o",
				country: 'French Polynesia',
				type: 'Reef pass',
				direction: 'Left',
				note: 'Reef pass on the edge of a deep channel.'
			}
		},
		{
			id: 'mundaka',
			lat: 43.407,
			lon: -2.698,
			props: {
				name: 'Mundaka',
				country: 'Spain',
				type: 'River mouth',
				direction: 'Left',
				note: 'Sandbar at an estuary mouth. Good test of a messy coastline.'
			}
		},
		{
			id: 'bells',
			lat: -38.37,
			lon: 144.28,
			props: {
				name: 'Bells Beach',
				country: 'Australia',
				type: 'Reef and point',
				direction: 'Right',
				note: 'Open bay under cliffs.'
			}
		},
		{
			id: 'nazare',
			lat: 39.601,
			lon: -9.084,
			props: {
				name: 'Nazaré',
				country: 'Portugal',
				type: 'Beach break',
				direction: 'Both',
				note: 'Beach beside a submarine canyon. Nearly straight shoreline.'
			}
		}
	];

	let map = $state<MapLibreMap | null>(null);
	let selected = $state<string | number | null>(null);
	let selectedPin = $state<Pin<SpotProps> | null>(null);
	let panelOpen = $state(false);

	let style = $state<MapStyleName>('liberty');
	let projection = $state<'globe' | 'mercator'>('globe');
	let labelledPins = $state(false);

	// ink is the chosen default. ?theme=<name> overrides it, so a link can
	// carry a look; ?theme=none shows the stock OpenFreeMap cartography.
	const DEFAULT_THEME: ThemeName = 'ink';

	const initialTheme = (() => {
		if (typeof window === 'undefined') return DEFAULT_THEME;
		const requested = new URLSearchParams(window.location.search).get('theme');
		if (requested === 'none') return 'none';
		return themeByName(requested) ? (requested as ThemeName) : DEFAULT_THEME;
	})();

	let themeName = $state<ThemeName | 'none'>(initialTheme);
	const theme = $derived(themeName === 'none' ? null : themes[themeName]);
	const themeTokens = $derived(theme ? tokensFor(theme) : '');

	// The overlay and the radius ring are drawn by us, not by CSS, so they read
	// the theme's tokens directly to stay in step with the basemap.
	const accentColour = $derived(theme?.tokens?.['--mk-color-accent'] ?? '#1f6feb');
	const coastColour = $derived(theme?.tokens?.['--mk-color-pin-selected'] ?? '#e3663e');

	// Keep the URL in step so the current look is always shareable.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('theme', themeName);
		history.replaceState(null, '', url);
	});

	let showRing = $state(true);
	let ringRadius = $state(2000);

	let coast = $state<CoastlineResult | null>(null);
	let coastLonLat = $state<[number, number][][]>([]);
	let oceanOnly = $state(true);
	let busy = $state(false);
	let message = $state('Pick a pin, then run the coastline query.');

	let overlayFrame = $state<OverlayFrame | null>(null);

	const EMPTY = { type: 'FeatureCollection' as const, features: [] };

	const ring = $derived(
		selectedPin ? circle(selectedPin.lon, selectedPin.lat, ringRadius) : EMPTY
	);

	function onSelect(pin: Pin<SpotProps> | null) {
		panelOpen = pin !== null;
		coast = null;
		coastLonLat = [];
		message = pin
			? `${pin.props?.name}. Run the coastline query to read the shoreline here.`
			: 'Pick a pin, then run the coastline query.';
		if (pin && map) void flyTo(map, { lon: pin.lon, lat: pin.lat, zoom: 9, duration: 1800 });
	}

	async function runCoastline() {
		const pin = selectedPin;
		if (!map || !pin || busy) return;
		busy = true;
		message = 'Flying to zoom 14 and loading tiles.';
		try {
			await flyTo(map, { lon: pin.lon, lat: pin.lat, zoom: 14, duration: 1400 });
			message = 'Reading water polygons.';
			const result = await coastlineNear(map, {
				lon: pin.lon,
				lat: pin.lat,
				radiusMeters: ringRadius,
				...(oceanOnly ? { classes: ['ocean'] } : {})
			});
			coast = result;
			coastLonLat = result.polylines.map((line) =>
				line.points.map(([x, y]) => result.frame.toLonLat(x, y))
			);
			const longest = result.polylines[0];
			message = longest
				? `${result.polylines.length} polyline${result.polylines.length === 1 ? '' : 's'}, ` +
					`${result.stats.vertexCount} vertices. Longest ${Math.round(longest.lengthMeters)} m ` +
					`with ${longest.points.length} vertices.`
				: `No water boundary found. Classes seen: ${result.stats.classes.join(', ') || 'none'}.`;
		} catch (error) {
			message = `Coastline query failed: ${String(error)}`;
		} finally {
			busy = false;
		}
	}

	/**
	 * Everything the overlay draws. Called by `<Overlay ondraw>` on every map
	 * move and resize, and whenever this page asks for a redraw.
	 */
	function draw(frame: OverlayFrame) {
		const ctx = frame.ctx;
		if (!ctx) return;

		if (coastLonLat.length > 0) {
			ctx.lineWidth = 2;
			ctx.strokeStyle = coastColour;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			for (const line of coastLonLat) {
				ctx.beginPath();
				for (let i = 0; i < line.length; i++) {
					const { x, y } = frame.project(line[i][0], line[i][1]);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}
		}

		const pin = selectedPin;
		if (!pin || frame.isOccluded(pin.lon, pin.lat)) return;

		const { x, y } = frame.project(pin.lon, pin.lat);
		const arm = 18;
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = accentColour;
		ctx.beginPath();
		ctx.moveTo(x - arm, y);
		ctx.lineTo(x - 5, y);
		ctx.moveTo(x + 5, y);
		ctx.lineTo(x + arm, y);
		ctx.moveTo(x, y - arm);
		ctx.lineTo(x, y - 5);
		ctx.moveTo(x, y + 5);
		ctx.lineTo(x, y + arm);
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(x, y, 11, 0, Math.PI * 2);
		ctx.stroke();

		// A scale read-out, proving metersPerPixel tracks the live camera.
		const mpp = frame.metersPerPixel(pin.lat, pin.lon);
		if (Number.isFinite(mpp)) {
			ctx.font = '11px ui-monospace, monospace';
			ctx.fillStyle = accentColour;
			ctx.fillText(`${mpp.toFixed(mpp < 10 ? 2 : 0)} m/px`, x + arm + 4, y - 4);
		}
	}

	// The overlay repaints itself on map events. These are the page's own
	// reasons to repaint.
	$effect(() => {
		void coastLonLat;
		void selectedPin;
		overlayFrame?.requestRedraw('manual');
	});

	// A handle for the headless browser harness in scripts/verify.mjs. Dev only.
	$effect(() => {
		if (!import.meta.env.DEV || !map) return;
		Object.assign(window, { mapkit: { map, coastlineNear, flyTo, enuFrame, spots } });
	});
</script>

<svelte:head>
	<title>map-kit demo</title>
</svelte:head>

<main class="page" style={themeTokens}>
	<Map
		bind:map
		{style}
		{theme}
		{projection}
		center={[12, 10]}
		zoom={1.9}
		onclick={(event) => {
			message = `Clicked ${event.lat.toFixed(4)}, ${event.lon.toFixed(4)}`;
		}}
	>
		{#snippet loading()}
			<p class="loading">Loading tiles from OpenFreeMap</p>
		{/snippet}

		{#snippet children()}
			<Layer
				id="radius-ring"
				data={ring}
				bind:visible={showRing}
				layers={[
					{ type: 'fill', paint: { 'fill-color': accentColour, 'fill-opacity': 0.08 } },
					{
						type: 'line',
						paint: { 'line-color': accentColour, 'line-width': 1.5, 'line-dasharray': [2, 2] }
					}
				]}
			/>

			<Overlay ondraw={draw} onready={(frame) => (overlayFrame = frame)} />

			<Pins
				pins={spots}
				bind:selected
				bind:selectedPin
				onselect={onSelect}
				pin={labelledPins ? labelPin : undefined}
			/>

			<Panel item={selectedPin} bind:open={panelOpen} title={selectedPin?.props?.name}>
				{#snippet children(pin)}
					<dl class="facts">
						<dt>Country</dt>
						<dd>{pin.props?.country}</dd>
						<dt>Type</dt>
						<dd>{pin.props?.type}</dd>
						<dt>Direction</dt>
						<dd>{pin.props?.direction}</dd>
						<dt>Coordinates</dt>
						<dd class="mono">{pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}</dd>
					</dl>
					<p class="note">{pin.props?.note}</p>

					<button class="primary" onclick={runCoastline} disabled={busy}>
						{busy ? 'Working' : `Coastline within ${ringRadius} m`}
					</button>

					{#if coast}
						<table class="stats">
							<tbody>
								<tr><th>Polylines</th><td>{coast.polylines.length}</td></tr>
								<tr><th>Vertices</th><td>{coast.stats.vertexCount}</td></tr>
								<tr><th>Segments</th><td>{coast.stats.segmentCount}</td></tr>
								<tr><th>Tile zoom</th><td>{coast.stats.tileZoom}</td></tr>
								<tr><th>Edge drops</th><td>{coast.stats.droppedTileEdgeSegments}</td></tr>
								<tr><th>Duplicates</th><td>{coast.stats.duplicateSegments}</td></tr>
								<tr><th>Classes</th><td>{coast.stats.classes.join(', ') || 'none'}</td></tr>
							</tbody>
						</table>
					{/if}
				{/snippet}

				{#snippet empty()}
					<p class="note">Select a pin on the globe.</p>
				{/snippet}
			</Panel>
		{/snippet}
	</Map>

	<aside class="controls">
		<h1>map-kit</h1>
		<p class="status">{message}</p>

		<label>
			Theme
			<select bind:value={themeName}>
				{#each THEME_NAMES as name (name)}
					<option value={name}>{name}</option>
				{/each}
				<option value="none">none (stock)</option>
			</select>
		</label>

		<label>
			Style
			<select bind:value={style}>
				<option value="liberty">liberty</option>
				<option value="positron">positron</option>
				<option value="bright">bright</option>
			</select>
		</label>

		<label>
			Projection
			<select bind:value={projection}>
				<option value="globe">globe</option>
				<option value="mercator">mercator</option>
			</select>
		</label>

		<label>
			Radius
			<select bind:value={ringRadius}>
				<option value={1000}>1 km</option>
				<option value={2000}>2 km</option>
				<option value={5000}>5 km</option>
			</select>
		</label>

		<label class="check"><input type="checkbox" bind:checked={showRing} /> Radius ring layer</label>
		<label class="check"><input type="checkbox" bind:checked={labelledPins} /> Label pins</label>
		<label class="check"><input type="checkbox" bind:checked={oceanOnly} /> Ocean class only</label>
	</aside>
</main>

{#snippet labelPin(pin: Pin<SpotProps>, state: { selected: boolean; hovered: boolean })}
	<span class="label-pin" class:is-selected={state.selected} class:is-hovered={state.hovered}>
		{pin.props?.name}
	</span>
{/snippet}

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #0d1117;
	}

	:global(body) {
		font-family: var(--mk-font-family);
	}

	.page {
		position: fixed;
		inset: 0;
		/* Matches the theme's sky, so nothing of the host page shows past the globe. */
		background: var(--mk-map-background, #0d1117);
	}

	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: #8b949e;
	}

	.controls {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 10;
		width: 230px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		background: var(--mk-color-surface);
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-lg);
		box-shadow: var(--mk-shadow-2);
		font-size: var(--mk-font-size-sm);
		color: var(--mk-color-text);
	}

	h1 {
		margin: 0;
		font-size: var(--mk-font-size-lg);
		font-weight: var(--mk-font-weight-medium);
	}

	.status {
		margin: 0;
		color: var(--mk-color-text-muted);
		min-height: 2.6em;
	}

	label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	label.check {
		justify-content: flex-start;
	}

	select {
		font: inherit;
		padding: 2px 4px;
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-sm);
		background: var(--mk-color-surface);
		color: inherit;
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0 0 var(--mk-space-3);
	}

	.facts dt {
		color: var(--mk-color-text-muted);
		font-size: var(--mk-font-size-sm);
	}

	.facts dd {
		margin: 0;
	}

	.mono {
		font-family: var(--mk-font-family-mono);
		font-size: var(--mk-font-size-sm);
	}

	.note {
		margin: 0 0 var(--mk-space-3);
		color: var(--mk-color-text-muted);
	}

	.primary {
		width: 100%;
		padding: 8px 12px;
		font: inherit;
		border: 0;
		border-radius: var(--mk-radius-md);
		background: var(--mk-color-accent);
		color: var(--mk-color-accent-contrast);
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.stats {
		width: 100%;
		margin-top: var(--mk-space-3);
		border-collapse: collapse;
		font-size: var(--mk-font-size-sm);
	}

	.stats th {
		text-align: left;
		font-weight: var(--mk-font-weight-normal);
		color: var(--mk-color-text-muted);
		padding: 2px 0;
	}

	.stats td {
		text-align: right;
		font-family: var(--mk-font-family-mono);
	}

	.label-pin {
		display: inline-block;
		padding: 3px 9px;
		white-space: nowrap;
		border-radius: var(--mk-radius-pill);
		background: var(--mk-color-pin);
		color: #fff;
		font-size: var(--mk-font-size-sm);
		font-weight: var(--mk-font-weight-medium);
		box-shadow: var(--mk-shadow-1);
	}

	.label-pin.is-hovered {
		background: var(--mk-color-pin-hover);
	}

	.label-pin.is-selected {
		background: var(--mk-color-pin-selected);
	}
</style>
