import type { Feature, FeatureCollection, Position } from 'geojson';

export type GraticuleOptions = {
	/** Spacing between lines, degrees. Default 10. */
	step?: number;
	/**
	 * Stop meridians this far from the equator. Default 85, just short of the
	 * Web Mercator limit, so the lines do not shoot off to infinity.
	 */
	latLimit?: number;
	/**
	 * Distance between vertices along each line, degrees. Default 5. A
	 * graticule drawn with two points per line would cut straight across the
	 * globe instead of following its curve, so the lines are densified.
	 */
	densifyDegrees?: number;
};

function line(coordinates: Position[], properties: Record<string, unknown>): Feature {
	return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } };
}

/**
 * Meridians and parallels as GeoJSON, for `<Graticule>`.
 *
 * Pure and deterministic, so it can be built once and handed to a `<Layer>`.
 * Each feature carries `kind` (`'meridian'` or `'parallel'`) and `degrees`, so
 * a style can pick out the equator or the prime meridian with a filter.
 */
export function graticuleGeoJSON(options: GraticuleOptions = {}): FeatureCollection {
	const { step = 10, latLimit = 85, densifyDegrees = 5 } = options;
	if (!(step > 0)) throw new Error('[map-kit] graticule step must be positive');
	if (!(densifyDegrees > 0)) throw new Error('[map-kit] graticule densifyDegrees must be positive');

	const features: Feature[] = [];

	for (let lon = -180; lon < 180; lon += step) {
		const coordinates: Position[] = [];
		for (let lat = -latLimit; lat < latLimit; lat += densifyDegrees) coordinates.push([lon, lat]);
		coordinates.push([lon, latLimit]);
		features.push(line(coordinates, { kind: 'meridian', degrees: lon }));
	}

	// Parallels stop at the last whole step inside the latitude limit, so a
	// step of 10 with a limit of 85 runs -80 to 80 and includes the equator.
	const lastParallel = Math.floor(latLimit / step) * step;
	for (let lat = -lastParallel; lat <= lastParallel; lat += step) {
		const coordinates: Position[] = [];
		for (let lon = -180; lon < 180; lon += densifyDegrees) coordinates.push([lon, lat]);
		coordinates.push([180, lat]);
		features.push(line(coordinates, { kind: 'parallel', degrees: lat }));
	}

	return { type: 'FeatureCollection', features };
}
