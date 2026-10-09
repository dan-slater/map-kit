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
export function flyTo(map, options) {
    const { lon, lat, zoom, pitch, bearing, duration = 2000, padding, essential = false, curve, speed } = options;
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
    return new Promise((resolve) => {
        if (!map.isMoving() && duration === 0) {
            resolve();
            return;
        }
        map.once('moveend', () => resolve());
    });
}
