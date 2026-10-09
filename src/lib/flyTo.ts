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

export type SweepToOptions = FlyToOptions & {
	/** Pitch held during the flight, degrees. Default 45. */
	sweepPitch?: number;
	/** Pitch to settle at once the flight lands. Default 0. */
	settlePitch?: number;
	/** How long the settle takes, milliseconds. Default 900. */
	settleDuration?: number;
};

/**
 * Fly somewhere with a bit of drama: lean the camera over for the journey,
 * take a wider arc than the shortest path, then straighten up on arrival.
 *
 * It is two moves, not one. MapLibre interpolates pitch linearly across a
 * `flyTo` and gives no hook to shape it, so a single call cannot rise and fall
 * again. This flies pitched, then eases back to `settlePitch`, which is what
 * produces the sweep.
 *
 * Resolves once the camera has settled, like {@link flyTo}. For a cut rather
 * than a flight, use `flyTo` with `duration: 0`.
 */
export async function sweepTo(map: MapLibreMap, options: SweepToOptions): Promise<void> {
	const {
		sweepPitch = 45,
		settlePitch = 0,
		settleDuration = 900,
		curve = 1.6,
		speed = 0.9,
		duration = 2600,
		...rest
	} = options;

	await flyTo(map, { ...rest, curve, speed, duration, pitch: sweepPitch });

	if (settleDuration <= 0) {
		map.setPitch(settlePitch);
		return;
	}

	map.easeTo({ pitch: settlePitch, duration: settleDuration, essential: options.essential ?? false });
	await new Promise<void>((resolve) => map.once('moveend', () => resolve()));
}
