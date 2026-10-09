/**
 * Local tangent-plane ("ENU", east-north-up) helpers.
 *
 * Everything here is plain maths. Nothing imports MapLibre, so these functions
 * run in a worker, in Node, or in a test with no DOM.
 */
/** WGS84 semi-major axis, metres. */
const WGS84_A = 6378137.0;
/** WGS84 flattening. */
const WGS84_F = 1 / 298.257223563;
/** WGS84 first eccentricity squared. */
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const DEG = Math.PI / 180;
/**
 * Build a local east-north tangent plane centred on `(lat0, lon0)`.
 *
 * `toMeters` returns `[xEast, yNorth]` in metres, with `+x` pointing east and
 * `+y` pointing north. `toLonLat` is its exact inverse.
 *
 * This is the usual equirectangular linearisation of the WGS84 ellipsoid: the
 * scale factors are the meridional and prime-vertical radii evaluated once, at
 * the origin. Error grows with the square of the distance from the origin and
 * is well under 0.1 m at 5 km, under about 2 m at 30 km. It is the right tool
 * for a simulation box around a clicked point and the wrong tool for
 * continental distances.
 *
 * Longitude differences are wrapped to `[-180, 180)` so a frame that straddles
 * the antimeridian still behaves.
 *
 * ```ts
 * const frame = enuFrame(-34.0308, 24.9338); // J-Bay
 * frame.toMeters(24.9338, -34.0208); // [0, ~1110]  (100 m of latitude north)
 * ```
 */
export function enuFrame(lat0, lon0) {
    const phi = lat0 * DEG;
    const sinPhi = Math.sin(phi);
    const w2 = 1 - WGS84_E2 * sinPhi * sinPhi;
    const w = Math.sqrt(w2);
    // Meridional radius of curvature (north-south) and prime-vertical radius
    // scaled by cos(lat) (east-west), both converted to metres per degree.
    const metersPerDegreeLat = (DEG * (WGS84_A * (1 - WGS84_E2))) / (w2 * w);
    const metersPerDegreeLon = (DEG * WGS84_A * Math.cos(phi)) / w;
    return {
        lat0,
        lon0,
        metersPerDegreeLat,
        metersPerDegreeLon,
        toMeters(lon, lat) {
            return [wrapLongitude(lon - lon0) * metersPerDegreeLon, (lat - lat0) * metersPerDegreeLat];
        },
        toLonLat(x, y) {
            return [
                wrapLongitude(lon0 + (metersPerDegreeLon === 0 ? 0 : x / metersPerDegreeLon)),
                lat0 + y / metersPerDegreeLat
            ];
        }
    };
}
/** Wrap a longitude (or a longitude difference) into `[-180, 180)`. */
export function wrapLongitude(lon) {
    const wrapped = ((lon + 180) % 360 + 360) % 360;
    return wrapped - 180;
}
/**
 * The point an angular distance away along a great circle, on a sphere.
 *
 * `angularDegrees` is an angle at the centre of the earth, not a distance:
 * 90 is a quarter of the way round, which is the silhouette of a globe seen
 * from infinitely far away. `bearingDegrees` is clockwise from north.
 */
export function destination(lon, lat, angularDegrees, bearingDegrees) {
    const angular = angularDegrees * DEG;
    const bearing = bearingDegrees * DEG;
    const lat1 = lat * DEG;
    const lon1 = lon * DEG;
    const sinLat2 = Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing);
    const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
    const y = Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1);
    const x = Math.cos(angular) - Math.sin(lat1) * sinLat2;
    return [wrapLongitude((lon1 + Math.atan2(y, x)) / DEG), lat2 / DEG];
}
/** Great-circle distance in metres between two points, spherical earth. */
export function distanceMeters(aLon, aLat, bLon, bLat) {
    const R = 6371008.8; // mean earth radius
    const dLat = (bLat - aLat) * DEG;
    const dLon = wrapLongitude(bLon - aLon) * DEG;
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** Total length in metres of a polyline given in tangent-plane metres. */
export function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    return total;
}
/**
 * Ramer-Douglas-Peucker simplification of a polyline in tangent-plane metres.
 * `tolerance` is the maximum distance, in metres, a dropped vertex may sit from
 * the retained line. A tolerance of 0 or less returns the input unchanged.
 */
export function simplifyPolyline(points, tolerance) {
    if (tolerance <= 0 || points.length < 3)
        return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length > 0) {
        const [first, last] = stack.pop();
        if (last - first < 2)
            continue;
        let farthest = -1;
        let farthestDistance = tolerance;
        for (let i = first + 1; i < last; i++) {
            const d = pointToSegmentDistance(points[i], points[first], points[last]);
            if (d > farthestDistance) {
                farthest = i;
                farthestDistance = d;
            }
        }
        if (farthest !== -1) {
            keep[farthest] = 1;
            stack.push([first, farthest], [farthest, last]);
        }
    }
    const out = [];
    for (let i = 0; i < points.length; i++)
        if (keep[i])
            out.push(points[i]);
    return out;
}
function pointToSegmentDistance(p, a, b) {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lengthSquared = abx * abx + aby * aby;
    if (lengthSquared === 0)
        return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}
