/**
 * Local tangent-plane ("ENU", east-north-up) helpers.
 *
 * Everything here is plain maths. Nothing imports MapLibre, so these functions
 * run in a worker, in Node, or in a test with no DOM.
 */
/** A pair of metres in the local tangent plane: `[xEast, yNorth]`. */
export type Meters = [x: number, y: number];
/** A pair of degrees: `[lon, lat]`. */
export type LonLat = [lon: number, lat: number];
export type EnuFrame = {
    /** Latitude of the origin, degrees. */
    readonly lat0: number;
    /** Longitude of the origin, degrees. */
    readonly lon0: number;
    /** Metres per degree of latitude at the origin. */
    readonly metersPerDegreeLat: number;
    /** Metres per degree of longitude at the origin. */
    readonly metersPerDegreeLon: number;
    /** Convert geographic coordinates to metres east/north of the origin. */
    toMeters(lon: number, lat: number): Meters;
    /** Convert metres east/north of the origin back to geographic coordinates. */
    toLonLat(x: number, y: number): LonLat;
};
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
export declare function enuFrame(lat0: number, lon0: number): EnuFrame;
/** Wrap a longitude (or a longitude difference) into `[-180, 180)`. */
export declare function wrapLongitude(lon: number): number;
/**
 * The point an angular distance away along a great circle, on a sphere.
 *
 * `angularDegrees` is an angle at the centre of the earth, not a distance:
 * 90 is a quarter of the way round, which is the silhouette of a globe seen
 * from infinitely far away. `bearingDegrees` is clockwise from north.
 */
export declare function destination(lon: number, lat: number, angularDegrees: number, bearingDegrees: number): LonLat;
/** Great-circle distance in metres between two points, spherical earth. */
export declare function distanceMeters(aLon: number, aLat: number, bLon: number, bLat: number): number;
/** Total length in metres of a polyline given in tangent-plane metres. */
export declare function polylineLength(points: readonly Meters[]): number;
/**
 * Ramer-Douglas-Peucker simplification of a polyline in tangent-plane metres.
 * `tolerance` is the maximum distance, in metres, a dropped vertex may sit from
 * the retained line. A tolerance of 0 or less returns the input unchanged.
 */
export declare function simplifyPolyline(points: readonly Meters[], tolerance: number): Meters[];
