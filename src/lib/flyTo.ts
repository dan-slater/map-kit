import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl';

export type FlyToOptions = {
	/** Target longitude, degrees. */
	lon: number;
	/** Target latitude, degrees. */
	lat: number;
	/** Target zoom. Omit to keep the current zoom. */
	zoom?: number;
	/** Target pitch in degrees. Omit to keep the current pitch. */
	pitch?: number;
	/** Target bearing in degrees. Omit to keep the current bearing. */
	bearing?: number;
	/** Animation length in milliseconds. Default 2000. Use 0 to jump. */
	duration?: number;
	/** Viewport padding to honour while framing the target. */
	padding?: number | PaddingOptions;
	/**
	 * Run the animation even when the user has asked for reduced motion.
	 * Default `false`, which is the polite choice.
	 */
	essential?: boolean;
	/** Zoom curve. MapLibre's default is 1.42. */
	curve?: number;
	/** Animation speed multiplier. MapLibre's default is 1.2. */
	speed?: number;
};

/**
 * Fly the map to a point and resolve when the camera has settled.
 *
 * Awaiting the result is the point of this helper over `map.flyTo`: tile
 * queries such as {@link coastlineNear} need the destination tiles loaded, and
 * the usual sequence is `await flyTo(map, {...}); await coastlineNear(map, {...})`.
 *
 * With `duration: 0` the camera jumps and the promise still resolves on the
 * next `moveend`. If something else moves the camera mid-flight the promise
 * resolves at that interruption rather than at the requested target.
 */
export function flyTo(map: MapLibreMap, options: FlyToOptions): Promise<void> {
	const {
		lon,
		lat,
		zoom,
		pitch,
		bearing,
		duration = 2000,
		padding,
		essential = false,
		curve,
		speed
	} = options;

	map.flyTo({
		center: [lon, lat],
		...(zoom === undefined ? {} : { zoom }),
		...(pitch === undefined ? {} : { pitch }),
		...(bearing === undefined ? {} : { bearing }),
		...(padding === undefined ? {} : { padding }),
		...(curve === undefined ? {} : { curve }),
		...(speed === undefined ? {} : { speed }),
		duration,
		essential
	});

	return new Promise<void>((resolve) => {
		if (!map.isMoving() && duration === 0) {
			resolve();
			return;
		}
		map.once('moveend', () => resolve());
	});
}
