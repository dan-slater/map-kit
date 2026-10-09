<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import maplibregl, {
		type Map as MapLibreMap,
		type ProjectionSpecification,
		type StyleSpecification
	} from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import './tokens.css';
	import { setMapContext, type MapContext } from './context.js';
	import { resolveStyle, type MapStyleInput } from './styles.js';
	import { themeStyle, type BasemapTheme } from './theme.js';
	import { flyTo as flyToMap, type FlyToOptions } from './flyTo.js';
	import type { MapCamera, MapPointerEvent } from './types.js';

	/** The projections MapLibre ships. */
	type ProjectionName = 'globe' | 'mercator';

	type MapApi = {
		map: MapLibreMap;
		flyTo: (options: FlyToOptions) => Promise<void>;
	};

	type Props = {
		/** `[lon, lat]`. Two-way: pan the map and it writes back. */
		center?: [lon: number, lat: number];
		/** Two-way: zoom the map and it writes back. */
		zoom?: number;
		/** Two-way. */
		bearing?: number;
		/** Two-way. */
		pitch?: number;
		/** `'liberty' | 'positron' | 'bright'`, a style URL, or a style object. */
		style?: MapStyleInput;
		/**
		 * Recolour the basemap from a small token set, and set the globe's
		 * atmosphere. Pass one of the presets from `themes`, or your own.
		 * `null` leaves the style exactly as published. Two-way, so a settings
		 * UI can drive it.
		 */
		theme?: BasemapTheme | null;
		/** Whether the user can pan, zoom and rotate. Reactive. */
		interactive?: boolean;
		/** `'globe'` (the default), `'mercator'`, or a full projection spec. Two-way. */
		projection?: ProjectionName | ProjectionSpecification;
		/** The live MapLibre map. Bind to it to call MapLibre directly. */
		map?: MapLibreMap | null;
		/** `true` once the map has fired `load`. */
		loaded?: boolean;
		/** Extra MapLibre `MapOptions`, merged last. Escape hatch for anything not surfaced here. */
		options?: Record<string, unknown>;
		/** Extra classes on the wrapper element. */
		class?: string;
		onclick?: (event: MapPointerEvent) => void;
		onmove?: (camera: MapCamera) => void;
		onmoveend?: (camera: MapCamera) => void;
		onready?: (map: MapLibreMap) => void;
		onerror?: (error: unknown) => void;
		/** Rendered over the map once it has loaded. Absolutely positioned, click-through by default. */
		children?: Snippet<[MapApi]>;
		/** Rendered over the map until it has loaded. */
		loading?: Snippet;
	};

	let {
		center = $bindable([0, 20]),
		zoom = $bindable(1.6),
		bearing = $bindable(0),
		pitch = $bindable(0),
		style = 'liberty',
		theme = $bindable(null),
		interactive = true,
		projection = $bindable('globe'),
		map = $bindable(null),
		loaded = $bindable(false),
		options,
		class: className = '',
		onclick,
		onmove,
		onmoveend,
		onready,
		onerror,
		children,
		loading
	}: Props = $props();

	let container: HTMLDivElement;
	let instance: MapLibreMap | null = null;
	let destroyed = false;

	let resolveReady: (map: MapLibreMap) => void;
	let rejectReady: (reason: unknown) => void;
	const readyPromise = new Promise<MapLibreMap>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	// Nothing may await this before `<Map>` mounts, so an unhandled rejection
	// here is a false alarm. Attach a no-op catch to keep the console clean.
	readyPromise.catch(() => {});

	const context: MapContext = {
		get map() {
			return map;
		},
		get loaded() {
			return loaded;
		},
		ready: () => readyPromise
	};
	setMapContext(context);

	/**
	 * Fly the camera to a point. Resolves when the camera settles, which is the
	 * moment it is safe to run a tile query such as `coastlineNear`.
	 *
	 * ```svelte
	 * <Map bind:this={mapComponent} />
	 * <button onclick={() => mapComponent.flyTo({ lon, lat, zoom: 14 })}>go</button>
	 * ```
	 */
	export function flyTo(flyOptions: FlyToOptions): Promise<void> {
		if (!instance) return readyPromise.then((m) => flyToMap(m, flyOptions));
		return flyToMap(instance, flyOptions);
	}

	/** The live MapLibre map, or `null` before it has been created. */
	export function getMap(): MapLibreMap | null {
		return instance;
	}

	/** Resolves with the map once it has loaded. */
	export function ready(): Promise<MapLibreMap> {
		return readyPromise;
	}

	function cameraOf(m: MapLibreMap): MapCamera {
		const c = m.getCenter();
		return {
			center: [c.lng, c.lat],
			zoom: m.getZoom(),
			bearing: m.getBearing(),
			pitch: m.getPitch()
		};
	}

	function writeBackCamera(m: MapLibreMap): MapCamera {
		const camera = cameraOf(m);
		center = camera.center;
		zoom = camera.zoom;
		bearing = camera.bearing;
		pitch = camera.pitch;
		return camera;
	}

	const INTERACTION_HANDLERS = [
		'scrollZoom',
		'boxZoom',
		'dragRotate',
		'dragPan',
		'keyboard',
		'doubleClickZoom',
		'touchZoomRotate',
		'touchPitch'
	] as const;

	function setInteractive(m: MapLibreMap, on: boolean): void {
		for (const name of INTERACTION_HANDLERS) {
			const handler = (m as unknown as Record<string, { enable(): void; disable(): void } | undefined>)[
				name
			];
			if (!handler) continue;
			if (on) handler.enable();
			else handler.disable();
		}
	}

	function projectionSpec(): ProjectionSpecification {
		return (
			typeof projection === 'string' ? { type: projection } : projection
		) as ProjectionSpecification;
	}

	function applyProjection(m: MapLibreMap): void {
		const spec = projectionSpec();
		try {
			if (m.getProjection()?.type === spec.type) return;
			m.setProjection(spec);
		} catch (error) {
			onerror?.(error);
		}
	}

	onMount(() => {
		let cancelled = false;
		let created: MapLibreMap | null = null;

		// The themed style is fetched before the map is built. MapLibre would
		// fetch the same URL anyway, so this costs nothing and avoids a flash
		// of the stock cartography before the theme lands. Later changes go
		// through setStyle's transformStyle, which needs no extra fetch.
		void (async () => {
			// Remember exactly what the map gets built from. The restyle effect
			// below compares against this, so a theme change that lands while
			// the style is still downloading is still applied afterwards.
			const builtStyle = style;
			const builtTheme = theme ?? null;
			const initialStyle = await buildInitialStyle(builtStyle, builtTheme);
			if (cancelled) return;
			appliedStyle = builtStyle;
			appliedTheme = builtTheme;
			built = true;
			created = start(initialStyle);
		})().catch((error) => onerror?.(error));

		return () => {
			cancelled = true;
			destroyed = true;
			loaded = false;
			instance = null;
			map = null;
			rejectReady(new Error('[map-kit] <Map> was destroyed before it loaded'));
			created?.remove();
		};
	});

	async function buildInitialStyle(
		from: MapStyleInput,
		withTheme: BasemapTheme | null
	): Promise<string | StyleSpecification> {
		const resolved = resolveStyle(from);
		if (!withTheme) return resolved;
		if (typeof resolved !== 'string') return themeStyle(resolved, withTheme);

		const response = await fetch(resolved);
		if (!response.ok) {
			onerror?.(new Error(`[map-kit] could not fetch style ${resolved}: ${response.status}`));
			return resolved;
		}
		return themeStyle((await response.json()) as StyleSpecification, withTheme);
	}

	function start(initialStyle: string | StyleSpecification): MapLibreMap {
		const m = new maplibregl.Map({
			container,
			style: initialStyle,
			center: [center[0], center[1]],
			zoom,
			bearing,
			pitch,
			interactive,
			attributionControl: { compact: true },
			...options
		});

		instance = m;
		map = m;

		// MapLibre v5 takes the projection from the style, and OpenFreeMap's
		// styles do not declare one, so apply it whenever a style settles.
		// This also covers `setStyle` later on.
		const onStyleData = () => {
			if (m.isStyleLoaded()) applyProjection(m);
		};
		m.on('styledata', onStyleData);

		const onLoad = () => {
			applyProjection(m);
			loaded = true;
			resolveReady(m);
			onready?.(m);
		};
		m.on('load', onLoad);

		const onMapClick = (event: maplibregl.MapMouseEvent) => {
			onclick?.({
				lon: event.lngLat.lng,
				lat: event.lngLat.lat,
				point: { x: event.point.x, y: event.point.y },
				originalEvent: event.originalEvent
			});
		};
		m.on('click', onMapClick);

		const onMapMove = () => onmove?.(writeBackCamera(m));
		const onMapMoveEnd = () => onmoveend?.(writeBackCamera(m));
		m.on('move', onMapMove);
		m.on('moveend', onMapMoveEnd);

		const onMapError = (event: unknown) => onerror?.(event);
		m.on('error', onMapError);

		return m;
	}

	// Props drive the camera, but only when they genuinely differ from where the
	// map already is. The move handler writes the map's own values back into the
	// same props, so this effect is a no-op during user interaction and flights.
	$effect(() => {
		const [lon, lat] = center;
		const nextZoom = zoom;
		const nextBearing = bearing;
		const nextPitch = pitch;
		const m = instance;
		if (!m || destroyed) return;
		untrack(() => {
			const c = m.getCenter();
			if (Math.abs(c.lng - lon) > 1e-9 || Math.abs(c.lat - lat) > 1e-9) m.setCenter([lon, lat]);
			if (Math.abs(m.getZoom() - nextZoom) > 1e-9) m.setZoom(nextZoom);
			if (Math.abs(m.getBearing() - nextBearing) > 1e-9) m.setBearing(nextBearing);
			if (Math.abs(m.getPitch() - nextPitch) > 1e-9) m.setPitch(nextPitch);
		});
	});

	// A change of style or theme is one setStyle. `transformStyle` runs after
	// MapLibre has fetched the new style and before it diffs it against the
	// current one, so the theme is applied without a second request and
	// without tearing the sources down.
	let appliedStyle: MapStyleInput | null = null;
	let appliedTheme: BasemapTheme | null = null;
	let built = $state(false);

	$effect(() => {
		const nextStyle = style;
		const nextTheme = theme ?? null;
		// `map` rather than `instance`: this one is reactive, so the effect
		// re-runs once the map exists. Reading a plain variable here meant the
		// effect never saw the map appear, and the first theme change after
		// load was swallowed by the guard that followed.
		const m = built ? map : null;
		if (!m || destroyed) return;

		untrack(() => {
			if (appliedStyle === nextStyle && appliedTheme === nextTheme) return;
			appliedStyle = nextStyle;
			appliedTheme = nextTheme;

			m.setStyle(resolveStyle(nextStyle), {
				// Carry the projection into the incoming style rather than
				// re-applying it afterwards. A style swap drops the projection,
				// and putting it back from the `styledata` handler depends on
				// timing that does not always come out right: switching theme
				// once would silently leave the map on mercator.
				transformStyle: (_previous, next) => ({
					...(nextTheme ? themeStyle(next, nextTheme) : next),
					projection: projectionSpec()
				})
			});
		});
	});

	$effect(() => {
		const on = interactive;
		const m = instance;
		if (!m || destroyed) return;
		untrack(() => setInteractive(m, on));
	});

	$effect(() => {
		// Track the projection prop so a change re-applies it.
		void projection;
		const m = instance;
		if (!m || destroyed) return;
		untrack(() => applyProjection(m));
	});

	const api = $derived<MapApi | null>(map ? { map, flyTo } : null);
</script>

<div class="mk-map {className}">
	<div class="mk-map__canvas" bind:this={container}></div>
	<div class="mk-map__layer">
		{#if loaded && api}
			{@render children?.(api)}
		{:else}
			{@render loading?.()}
		{/if}
	</div>
</div>

<style>
	.mk-map {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--mk-map-background);
		font-family: var(--mk-font-family);
		font-size: var(--mk-font-size-md);
		line-height: var(--mk-line-height);
		color: var(--mk-color-text);
	}

	.mk-map__canvas {
		position: absolute;
		inset: 0;
	}

	/*
	 * Everything a consumer puts inside <Map> lands here, stacked over the
	 * MapLibre canvas. It is click-through so the map keeps its own gestures;
	 * child components re-enable pointer events on the bits that need them.
	 */
	.mk-map__layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* MapLibre's attribution has to stay clickable: OSM asks for a live link. */
	.mk-map :global(.maplibregl-ctrl-attrib),
	.mk-map :global(.maplibregl-ctrl) {
		pointer-events: auto;
	}
</style>
