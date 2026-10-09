<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { useMap } from './context.js';
	import { starFieldDataUri } from './starfield.js';

	/*
	 * Stars behind the planet.
	 *
	 * Set as a CSS background on the element MapLibre draws into, which sits
	 * above `--mk-map-background` and below the map canvas. That is the one
	 * place something can be *behind* the globe: anything rendered as a child
	 * of `<Map>` is above the canvas and would cover the planet.
	 *
	 * It costs nothing per frame. The field does not move with the camera,
	 * which is the honest trade for a static background image, and reads fine
	 * because the globe is what the eye tracks.
	 */

	type Props = {
		/** Stars per tile. Default 90. */
		count?: number;
		/** Tile size in CSS pixels. Default 420. */
		tile?: number;
		/** Star colour. Default white. */
		color?: string;
		/** Largest star radius in pixels. Default 1.1. */
		maxRadius?: number;
		/** Brightest star opacity, 0 to 1. Default 0.85. */
		maxOpacity?: number;
		/** Same seed, same sky. Default 1. */
		seed?: number;
	};

	let {
		count = 90,
		tile = 420,
		color = '#ffffff',
		maxRadius = 1.1,
		maxOpacity = 0.85,
		seed = 1
	}: Props = $props();

	const mapContext = useMap();
	let container: HTMLElement | null = null;
	let previousImage = '';

	const image = $derived(starFieldDataUri({ count, tile, color, maxRadius, maxOpacity, seed }));

	onMount(() => {
		let cancelled = false;

		void mapContext.ready().then((m: MapLibreMap) => {
			if (cancelled) return;
			container = m.getContainer();
			previousImage = container.style.backgroundImage;
		});

		return () => {
			cancelled = true;
			if (container) container.style.backgroundImage = previousImage;
			container = null;
		};
	});

	$effect(() => {
		const next = image;
		if (container) container.style.backgroundImage = next;
	});
</script>
