function line(coordinates, properties) {
    return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } };
}
/**
 * Meridians and parallels as GeoJSON, for `<Graticule>`.
 *
 * Pure and deterministic, so it can be built once and handed to a `<Layer>`.
 * Each feature carries `kind` (`'meridian'` or `'parallel'`) and `degrees`, so
 * a style can pick out the equator or the prime meridian with a filter.
 */
export function graticuleGeoJSON(options = {}) {
    const { step = 10, latLimit = 85, densifyDegrees = 5 } = options;
    if (!(step > 0))
        throw new Error('[map-kit] graticule step must be positive');
    if (!(densifyDegrees > 0))
        throw new Error('[map-kit] graticule densifyDegrees must be positive');
    const features = [];
    for (let lon = -180; lon < 180; lon += step) {
        const coordinates = [];
        for (let lat = -latLimit; lat < latLimit; lat += densifyDegrees)
            coordinates.push([lon, lat]);
        coordinates.push([lon, latLimit]);
        features.push(line(coordinates, { kind: 'meridian', degrees: lon }));
    }
    // Parallels stop at the last whole step inside the latitude limit, so a
    // step of 10 with a limit of 85 runs -80 to 80 and includes the equator.
    const lastParallel = Math.floor(latLimit / step) * step;
    for (let lat = -lastParallel; lat <= lastParallel; lat += step) {
        const coordinates = [];
        for (let lon = -180; lon < 180; lon += densifyDegrees)
            coordinates.push([lon, lat]);
        coordinates.push([180, lat]);
        features.push(line(coordinates, { kind: 'parallel', degrees: lat }));
    }
    return { type: 'FeatureCollection', features };
}
