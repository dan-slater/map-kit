import type { Feature, FeatureCollection, Position } from 'geojson';
import { enuFrame } from './geo.js';
import type { Meters } from './geo.js';

export type { FeatureCollection } from 'geojson';

/**
 * A geodesic circle as a GeoJSON polygon, for radius rings.
 *
 * The ring is built in the local tangent plane and converted back, so it is a
 * true constant-distance ring rather than a circle in screen space.
 *
 * ```svelte
 * <Layer id="ring" data={circle(lon, lat, 2000)} layer={{ type: 'line' }} bind:visible />
 * ```
 */
export function circle(
	lon: number,
	lat: number,
	radiusMeters: number,
	steps = 128,
	properties: Record<string, unknown> = {}
): FeatureCollection {
	const frame = enuFrame(lat, lon);
	const ring: Position[] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		ring.push(frame.toLonLat(Math.cos(angle) * radiusMeters, Math.sin(angle) * radiusMeters));
	}
	return {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				properties: { radiusMeters, ...properties },
				geometry: { type: 'Polygon', coordinates: [ring] }
			}
		]
	};
}

/** A single GeoJSON LineString feature from tangent-plane metres. */
function lineFeature(coordinates: Position[], properties: Record<string, unknown>): Feature {
	return {
		type: 'Feature',
		properties,
		geometry: { type: 'LineString', coordinates }
	};
}

/** Points as a GeoJSON FeatureCollection, for heat layers and clusters. */
export function points(
	items: { lon: number; lat: number; props?: Record<string, unknown> }[]
): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: items.map((item) => ({
			type: 'Feature',
			properties: { ...item.props },
			geometry: { type: 'Point', coordinates: [item.lon, item.lat] }
		}))
	};
}

/**
 * Turn polylines expressed in tangent-plane metres, such as the output of
 * {@link coastlineNear}, back into a GeoJSON FeatureCollection you can hand to
 * a `<Layer>`.
 */
export function linesFromMeters(
	polylines: { points: readonly Meters[] }[],
	frame: { toLonLat(x: number, y: number): [number, number] },
	properties: Record<string, unknown> = {}
): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: polylines
			.filter((line) => line.points.length >= 2)
			.map((line, index) =>
				lineFeature(
					line.points.map(([x, y]) => frame.toLonLat(x, y) as Position),
					{ index, ...properties }
				)
			)
	};
}

/**
 * Read a `--mk-` theme token off the map container so MapLibre paint
 * properties can follow the same palette as the DOM components.
 *
 * MapLibre paint values are parsed by its own colour parser and cannot contain
 * `var(...)`, so the value has to be resolved in JS like this.
 */
export function cssToken(element: HTMLElement, name: string, fallback: string): string {
	if (typeof window === 'undefined') return fallback;
	const value = getComputedStyle(element).getPropertyValue(name).trim();
	return value || fallback;
}
