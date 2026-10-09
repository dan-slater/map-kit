import type { FeatureCollection } from 'geojson';
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
export declare function circle(lon: number, lat: number, radiusMeters: number, steps?: number, properties?: Record<string, unknown>): FeatureCollection;
/** Points as a GeoJSON FeatureCollection, for heat layers and clusters. */
export declare function points(items: {
    lon: number;
    lat: number;
    props?: Record<string, unknown>;
}[]): FeatureCollection;
/**
 * Turn polylines expressed in tangent-plane metres, such as the output of
 * {@link coastlineNear}, back into a GeoJSON FeatureCollection you can hand to
 * a `<Layer>`.
 */
export declare function linesFromMeters(polylines: {
    points: readonly Meters[];
}[], frame: {
    toLonLat(x: number, y: number): [number, number];
}, properties?: Record<string, unknown>): FeatureCollection;
/**
 * Read a `--mk-` theme token off the map container so MapLibre paint
 * properties can follow the same palette as the DOM components.
 *
 * MapLibre paint values are parsed by its own colour parser and cannot contain
 * `var(...)`, so the value has to be resolved in JS like this.
 */
export declare function cssToken(element: HTMLElement, name: string, fallback: string): string;
