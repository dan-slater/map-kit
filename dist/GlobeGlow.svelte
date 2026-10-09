<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import Overlay from './Overlay.svelte';
	import { destination } from './geo.js';
	import { parseColour } from './theme.js';
	import type { OverlayFrame } from './overlay.js';

	/*
	 * A rim of light around the planet, fading into space.
	 *
	 * MapLibre's own `sky` paints an atmosphere, but it is a wash across the
	 * whole sky dome rather than a band hugging the limb, and its colour comes
	 * from the style. This draws the band, in whatever colour you hand it, on
	 * a canvas above the map. It only ever paints outside the globe, so the
	 * planet underneath is untouched.
	 *
	 * Globe projection only: under mercator there is no limb to trace, and the
	 * component draws nothing.
	 */

	type Props = {
		/** Rim colour. Pass the theme's accent. Default a cool teal. */
		color?: string;
		/** Peak opacity of the rim, 0 to 1. Default 0.55. */
		intensity?: number;
		/** Band width as a fraction of the globe's radius. Default 0.12. */
		thickness?: number;
		/**
		 * Stop drawing above this zoom. By then the limb is off-screen and the
		 * radius estimate stops being meaningful. Default 5.
		 */
		maxZoom?: number;
		/** Extra classes on the canvas. */
		class?: string;
	};

	let {
		color = '#2f8f8f',
		intensity = 0.55,
		thickness = 0.12,
		maxZoom = 5,
		class: className = ''
	}: Props = $props();

	const rgb = $derived.by(() => {
		const parsed = parseColour(color);
		return parsed ? `${parsed.r}, ${parsed.g}, ${parsed.b}` : '47, 143, 143';
	});

	/**
	 * The globe's apparent radius in screen pixels.
	 *
	 * Measured rather than derived: project a ring of points a quarter turn
	 * from the centre, which is the silhouette, and take the furthest. That
	 * works whatever MapLibre does internally, and keeps working if the globe
	 * projection's perspective changes.
	 */
	function globeRadiusPixels(map: MapLibreMap): number {
		const centre = map.getCenter();
		const origin = map.project([centre.lng, centre.lat]);
		let radius = 0;
		for (let i = 0; i < 12; i++) {
			const [lon, lat] = destination(centre.lng, centre.lat, 89.5, (i / 12) * 360);
			const point = map.project([lon, lat]);
			const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
			if (Number.isFinite(distance)) radius = Math.max(radius, distance);
		}
		return radius;
	}

	function draw(frame: OverlayFrame) {
		const ctx = frame.ctx;
		if (!ctx) return;

		const map = frame.map;
		if (map.getProjection?.()?.type !== 'globe') return;
		if (map.getZoom() > maxZoom) return;

		const radius = globeRadiusPixels(map);
		const diagonal = Math.hypot(frame.width, frame.height);
		// A nonsense radius means the limb is not on screen in any useful way.
		if (!(radius > 1) || radius > diagonal * 2) return;

		const centre = map.getCenter();
		const origin = frame.project(centre.lng, centre.lat);
		const inner = radius * (1 - thickness);
		const outer = radius * (1 + thickness * 2.2);
		if (!(outer > inner)) return;

		const gradient = ctx.createRadialGradient(
			origin.x,
			origin.y,
			inner,
			origin.x,
			origin.y,
			outer
		);
		// Transparent at the inside edge so nothing tints the planet, brightest
		// just outside the limb, then a long tail into space.
		gradient.addColorStop(0, `rgba(${rgb}, 0)`);
		gradient.addColorStop(0.42, `rgba(${rgb}, ${intensity})`);
		gradient.addColorStop(0.55, `rgba(${rgb}, ${intensity * 0.55})`);
		gradient.addColorStop(1, `rgba(${rgb}, 0)`);

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, frame.width, frame.height);
	}
</script>

<Overlay ondraw={draw} class="mk-globe-glow {className}" />
