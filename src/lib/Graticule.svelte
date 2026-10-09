<script lang="ts">
	import type { ExpressionSpecification } from 'maplibre-gl';
	import Layer from './Layer.svelte';
	import { graticuleGeoJSON } from './graticule.js';
	import type { LayerDef } from './layerDef.js';

	/*
	 * Meridians and parallels as a hairline grid.
	 *
	 * It is a plain `<Layer>` underneath, so it sits in the MapLibre style
	 * rather than on a canvas, and the globe curves it correctly. The lines
	 * fade out as you zoom in: a graticule is orientation at a glance, and
	 * once you are looking at a town it is clutter.
	 */

	type Props = {
		/** Source and layer id. Change it only if it clashes with your style. */
		id?: string;
		/** Spacing between lines, degrees. Default 10. */
		step?: number;
		/** Line colour. Default a dim slate. */
		color?: string;
		/** Line width in pixels. Default 0.5. */
		width?: number;
		/** Opacity at full strength, 0 to 1. Default 0.35. */
		opacity?: number;
		/** Fully visible at or below this zoom. Default 3. */
		fadeFromZoom?: number;
		/** Gone at or above this zoom. Default 6. */
		fadeToZoom?: number;
		/** Two-way visibility toggle. */
		visible?: boolean;
		/** Insert below this existing layer id, when it exists. */
		before?: string;
	};

	let {
		id = 'mk-graticule',
		step = 10,
		color = '#4a6070',
		width = 0.5,
		opacity = 0.35,
		fadeFromZoom = 3,
		fadeToZoom = 6,
		visible = $bindable(true),
		before
	}: Props = $props();

	const data = $derived(graticuleGeoJSON({ step }));

	// TypeScript widens the literal array to string[] | number[], which is not
	// assignable to MapLibre's expression union, so name the type.
	const lineOpacity = $derived([
		'interpolate',
		['linear'],
		['zoom'],
		fadeFromZoom,
		opacity,
		fadeToZoom,
		0
	] as ExpressionSpecification);

	const layer = $derived({
		type: 'line',
		paint: {
			'line-color': color,
			'line-width': width,
			'line-opacity': lineOpacity
		}
	} as LayerDef);
</script>

<Layer {id} {data} {before} bind:visible {layer} />
