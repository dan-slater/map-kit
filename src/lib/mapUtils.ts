import type { LngLatLike, Map as MapLibreMap } from 'maplibre-gl';
import { enuFrame } from './geo.js';

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
export function metersPerPixel(map: MapLibreMap, lat: number, lon?: number): number {
	const sampleLon = lon ?? map.getCenter().lng;
	const frame = enuFrame(lat, sampleLon);
	const baseline = 100; // metres
	const [aLon, aLat] = frame.toLonLat(-baseline / 2, 0);
	const [bLon, bLat] = frame.toLonLat(baseline / 2, 0);
	const a = map.project([aLon, aLat]);
	const b = map.project([bLon, bLat]);
	const pixels = Math.hypot(b.x - a.x, b.y - a.y);
	return pixels > 0 ? baseline / pixels : Number.NaN;
}

/**
 * Whether a location is hidden behind the planet under globe projection.
 * Always `false` under mercator, and `false` if the MapLibre build in use does
 * not expose the test.
 */
export function isLocationOccluded(map: MapLibreMap, lon: number, lat: number): boolean {
	const transform = (map as unknown as { transform?: { isLocationOccluded?: (l: LngLatLike) => boolean } })
		.transform;
	if (!transform?.isLocationOccluded) return false;
	try {
		return transform.isLocationOccluded({ lng: lon, lat } as LngLatLike);
	} catch {
		return false;
	}
}

/**
 * Resolve once the map has finished loading every tile and source it needs for
 * the current camera, so a source query sees a settled, single-zoom tile set.
 *
 * Resolves `true` when the map really did settle and `false` when it hit
 * `timeoutMs` first, so a caller can decide whether to trust a partial answer.
 */
export function waitForIdle(map: MapLibreMap, timeoutMs = 10_000): Promise<boolean> {
	if (map.loaded() && !map.isMoving()) return Promise.resolve(true);

	return new Promise<boolean>((resolve) => {
		let done = false;
		const finish = (settled: boolean) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			map.off('idle', onIdle);
			resolve(settled);
		};
		const onIdle = () => finish(true);
		const timer = setTimeout(() => finish(false), timeoutMs);
		map.on('idle', onIdle);
	});
}
