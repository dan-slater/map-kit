import type { Map as MapLibreMap } from 'maplibre-gl';
/**
 * Ground metres per screen pixel at a given latitude, measured from the live
 * camera rather than assumed from the Web Mercator formula.
 *
 * It projects two points 100 m apart and divides, so it stays correct under
 * globe projection, under pitch, and under any future projection MapLibre
 * grows. It is a local linearisation: near the horizon of a pitched or globe
 * view the figure changes quickly across the screen, so sample it at the
 * latitude you care about rather than once for the whole frame.
 *
 * @param lon Longitude to sample at. Defaults to the map centre's longitude.
 */
export declare function metersPerPixel(map: MapLibreMap, lat: number, lon?: number): number;
/**
 * Whether a location is hidden behind the planet under globe projection.
 * Always `false` under mercator, and `false` if the MapLibre build in use does
 * not expose the test.
 */
export declare function isLocationOccluded(map: MapLibreMap, lon: number, lat: number): boolean;
/**
 * Resolve once the map has finished loading every tile and source it needs for
 * the current camera, so a source query sees a settled, single-zoom tile set.
 *
 * Resolves `true` when the map really did settle and `false` when it hit
 * `timeoutMs` first, so a caller can decide whether to trust a partial answer.
 */
export declare function waitForIdle(map: MapLibreMap, timeoutMs?: number): Promise<boolean>;
