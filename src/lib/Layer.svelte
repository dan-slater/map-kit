<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type {
		GeoJSONSource,
		GeoJSONSourceSpecification,
		LayerSpecification,
		Map as MapLibreMap
	} from 'maplibre-gl';
	import { useMap } from './context.js';
	import { cssToken } from './shapes.js';
	import type { LayerDef } from './layerDef.js';

	type Props = {
		/** Id for the source, and the basis for the layer ids. Must be unique in the style. */
		id: string;
		/** GeoJSON object, or a URL to one. */
		data: GeoJSONSourceSpecification['data'];
		/** A single layer drawn from the source. */
		layer?: LayerDef;
		/** Several layers drawn from the same source, for example a fill plus an outline. */
		layers?: LayerDef[];
		/** Two-way visibility toggle. */
		visible?: boolean;
		/** Insert below this existing layer id, when it exists. */
		before?: string;
		/** Extra GeoJSON source options, for example `cluster: true`. */
		source?: Partial<Omit<GeoJSONSourceSpecification, 'type' | 'data'>>;
		/** Called with the layer ids once they are on the map. */
		onadd?: (layerIds: string[], map: MapLibreMap) => void;
	};

	let {
		id,
		data,
		layer,
		layers,
		visible = $bindable(true),
		before,
		source,
		onadd
	}: Props = $props();

	const mapContext = useMap();
	let map: MapLibreMap | null = $state(null);

	const specs = $derived.by<(LayerDef & { id: string })[]>(() => {
		const defs = layers ?? (layer ? [layer] : [{ type: 'line' } as LayerDef]);
		return defs.map((def, index) => ({
			...def,
			id: def.id ?? (defs.length === 1 ? id : `${id}-${index}`)
		}));
	});

	// Structural changes need a remove-and-re-add. Inline object literals get a
	// fresh identity on every render, so compare by value rather than reference.
	const specsKey = $derived(JSON.stringify(specs));

	/**
	 * Paint defaults for a `<Layer>` given no paint of its own, pulled from the
	 * theme tokens so an unstyled layer still matches the rest of the kit.
	 */
	function withDefaultPaint(
		spec: LayerDef & { id: string },
		container: HTMLElement
	): LayerSpecification {
		const accent = cssToken(container, '--mk-color-accent', '#1f6feb');
		const base = { ...spec, source: id } as Record<string, unknown>;
		if (!base.paint) {
			if (spec.type === 'line') base.paint = { 'line-color': accent, 'line-width': 2 };
			else if (spec.type === 'fill') base.paint = { 'fill-color': accent, 'fill-opacity': 0.15 };
			else if (spec.type === 'circle') base.paint = { 'circle-color': accent, 'circle-radius': 5 };
		}
		base.layout = { ...(spec.layout as object), visibility: visible ? 'visible' : 'none' };
		return base as unknown as LayerSpecification;
	}

	function add(m: MapLibreMap): void {
		if (!m.getSource(id)) {
			m.addSource(id, { type: 'geojson', data, ...source } as GeoJSONSourceSpecification);
		}
		const container = m.getContainer();
		const anchor = before && m.getLayer(before) ? before : undefined;
		for (const spec of specs) {
			if (m.getLayer(spec.id)) continue;
			m.addLayer(withDefaultPaint(spec, container), anchor);
		}
		onadd?.(
			specs.map((s) => s.id),
			m
		);
	}

	function remove(m: MapLibreMap): void {
		try {
			for (const spec of specs) {
				if (m.getLayer(spec.id)) m.removeLayer(spec.id);
			}
			if (m.getSource(id)) m.removeSource(id);
		} catch {
			// The style was torn down under us, for example by <Map> unmounting.
		}
	}

	onMount(() => {
		let cancelled = false;
		let detach: (() => void) | undefined;

		void mapContext.ready().then((m) => {
			if (cancelled) return;
			// A `setStyle` wipes every source and layer, so put ours back.
			const restore = () => {
				if (m.isStyleLoaded() && !m.getSource(id)) add(m);
			};
			m.on('styledata', restore);
			detach = () => m.off('styledata', restore);
			map = m;
		});

		return () => {
			cancelled = true;
			detach?.();
		};
	});

	$effect(() => {
		const m = map;
		void specsKey;
		if (!m) return;
		untrack(() => add(m));
		return () => remove(m);
	});

	$effect(() => {
		const next = data;
		const m = map;
		if (!m) return;
		untrack(() => {
			const src = m.getSource(id) as GeoJSONSource | undefined;
			src?.setData(next);
		});
	});

	$effect(() => {
		const on = visible;
		const m = map;
		if (!m) return;
		untrack(() => {
			for (const spec of specs) {
				if (m.getLayer(spec.id)) {
					m.setLayoutProperty(spec.id, 'visibility', on ? 'visible' : 'none');
				}
			}
		});
	});
</script>
