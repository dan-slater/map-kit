import { describe, expect, test } from 'bun:test';
import { destination, distanceMeters, wrapLongitude } from '../src/lib/geo.js';
import { graticuleGeoJSON } from '../src/lib/graticule.js';
import { starFieldDataUri } from '../src/lib/starfield.js';

type AnyFeature = {
	properties: Record<string, unknown>;
	geometry: { type: string; coordinates: number[][] };
};

describe('destination', () => {
	test('zero distance stays put', () => {
		const [lon, lat] = destination(12, 34, 0, 90);
		expect(lon).toBeCloseTo(12, 9);
		expect(lat).toBeCloseTo(34, 9);
	});

	test('due north from the equator walks up the meridian', () => {
		const [lon, lat] = destination(0, 0, 10, 0);
		expect(lon).toBeCloseTo(0, 9);
		expect(lat).toBeCloseTo(10, 9);
	});

	test('due south', () => {
		const [, lat] = destination(0, 0, 10, 180);
		expect(lat).toBeCloseTo(-10, 9);
	});

	test('due east along the equator is a straight run of longitude', () => {
		const [lon, lat] = destination(0, 0, 25, 90);
		expect(lon).toBeCloseTo(25, 9);
		expect(lat).toBeCloseTo(0, 9);
	});

	test('a quarter turn north from the equator lands on the pole', () => {
		const [, lat] = destination(0, 0, 90, 0);
		expect(lat).toBeCloseTo(90, 6);
	});

	test('the angular distance really is the angle travelled', () => {
		// 1 degree of great circle is one 360th of the circumference.
		const [lon, lat] = destination(24.9338, -34.0308, 1, 57);
		const metres = distanceMeters(24.9338, -34.0308, lon, lat);
		expect(metres).toBeCloseTo((2 * Math.PI * 6371008.8) / 360, -2);
	});

	test('wraps across the antimeridian rather than running off the end', () => {
		const [lon] = destination(179, 0, 5, 90);
		expect(lon).toBeCloseTo(-176, 6);
		expect(Math.abs(lon)).toBeLessThanOrEqual(180);
	});

	test('results are always inside the normal lon/lat range', () => {
		for (let bearing = 0; bearing < 360; bearing += 23) {
			for (const angle of [1, 45, 89.5, 120]) {
				const [lon, lat] = destination(150, 60, angle, bearing);
				expect(lon).toBe(wrapLongitude(lon));
				expect(lat).toBeGreaterThanOrEqual(-90);
				expect(lat).toBeLessThanOrEqual(90);
			}
		}
	});
});

describe('graticuleGeoJSON', () => {
	test('default spacing gives 36 meridians and 17 parallels', () => {
		const grid = graticuleGeoJSON();
		const features = grid.features as unknown as AnyFeature[];
		const meridians = features.filter((f) => f.properties.kind === 'meridian');
		const parallels = features.filter((f) => f.properties.kind === 'parallel');

		// -180 up to but not including 180, every 10 degrees.
		expect(meridians).toHaveLength(36);
		// -80 to 80 every 10 degrees, the equator included.
		expect(parallels).toHaveLength(17);
		expect(grid.type).toBe('FeatureCollection');
	});

	test('carries the equator and the prime meridian, labelled', () => {
		const features = graticuleGeoJSON().features as unknown as AnyFeature[];
		expect(features.some((f) => f.properties.kind === 'parallel' && f.properties.degrees === 0)).toBe(
			true
		);
		expect(features.some((f) => f.properties.kind === 'meridian' && f.properties.degrees === 0)).toBe(
			true
		);
	});

	test('lines are densified so they curve on a globe', () => {
		const features = graticuleGeoJSON().features as unknown as AnyFeature[];
		for (const feature of features) {
			expect(feature.geometry.type).toBe('LineString');
			// Two points would cut straight through the planet.
			expect(feature.geometry.coordinates.length).toBeGreaterThan(10);
		}
	});

	test('meridians span the latitude limit exactly and hold their longitude', () => {
		const features = graticuleGeoJSON({ step: 30, latLimit: 85 }).features as unknown as AnyFeature[];
		const meridian = features.find((f) => f.properties.degrees === 30 && f.properties.kind === 'meridian')!;
		const lats = meridian.geometry.coordinates.map((c) => c[1]);
		expect(Math.min(...lats)).toBeCloseTo(-85, 9);
		expect(Math.max(...lats)).toBeCloseTo(85, 9);
		expect(meridian.geometry.coordinates.every((c) => c[0] === 30)).toBe(true);
	});

	test('parallels run the full way round and hold their latitude', () => {
		const features = graticuleGeoJSON({ step: 30 }).features as unknown as AnyFeature[];
		const parallel = features.find((f) => f.properties.degrees === 30 && f.properties.kind === 'parallel')!;
		const lons = parallel.geometry.coordinates.map((c) => c[0]);
		expect(Math.min(...lons)).toBeCloseTo(-180, 9);
		expect(Math.max(...lons)).toBeCloseTo(180, 9);
		expect(parallel.geometry.coordinates.every((c) => c[1] === 30)).toBe(true);
	});

	test('step changes the count', () => {
		const coarse = graticuleGeoJSON({ step: 45 }).features as unknown as AnyFeature[];
		expect(coarse.filter((f) => f.properties.kind === 'meridian')).toHaveLength(8);
		// -45, 0, 45 inside a limit of 85.
		expect(coarse.filter((f) => f.properties.kind === 'parallel')).toHaveLength(3);
	});

	test('every coordinate is a valid lon/lat', () => {
		const features = graticuleGeoJSON({ step: 15 }).features as unknown as AnyFeature[];
		for (const feature of features) {
			for (const [lon, lat] of feature.geometry.coordinates) {
				expect(lon).toBeGreaterThanOrEqual(-180);
				expect(lon).toBeLessThanOrEqual(180);
				expect(lat).toBeGreaterThanOrEqual(-90);
				expect(lat).toBeLessThanOrEqual(90);
			}
		}
	});

	test('rejects nonsense spacing rather than looping forever', () => {
		expect(() => graticuleGeoJSON({ step: 0 })).toThrow('step must be positive');
		expect(() => graticuleGeoJSON({ step: -5 })).toThrow('step must be positive');
		expect(() => graticuleGeoJSON({ densifyDegrees: 0 })).toThrow('densifyDegrees must be positive');
	});
});

describe('starFieldDataUri', () => {
	test('is a CSS url() holding an SVG', () => {
		const value = starFieldDataUri();
		expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
		expect(value.endsWith('")')).toBe(true);
		expect(value).toContain('%3Csvg');
	});

	test('the same seed always draws the same sky', () => {
		expect(starFieldDataUri({ seed: 7 })).toBe(starFieldDataUri({ seed: 7 }));
	});

	test('a different seed draws a different sky', () => {
		expect(starFieldDataUri({ seed: 7 })).not.toBe(starFieldDataUri({ seed: 8 }));
	});

	test('count controls how many stars are drawn', () => {
		const stars = (value: string) => value.split('%3Ccircle').length - 1;
		expect(stars(starFieldDataUri({ count: 10 }))).toBe(10);
		expect(stars(starFieldDataUri({ count: 200 }))).toBe(200);
		expect(stars(starFieldDataUri({ count: 0 }))).toBe(0);
	});

	test('tile size reaches the svg', () => {
		// Double quotes are rewritten to single ones so the value survives
		// inside a CSS url("...").
		const value = starFieldDataUri({ tile: 256 });
		expect(value).toContain("width='256'");
		expect(value).toContain("viewBox='0 0 256 256'");
	});

	test('contains nothing that would break a CSS url()', () => {
		// Double quotes and angle brackets must be gone; the wrapper uses
		// double quotes and the value sits inside a style attribute.
		const inner = starFieldDataUri({ color: '#ff0000' }).slice('url("'.length, -2);
		expect(inner).not.toContain('"');
		expect(inner).not.toContain('<');
		expect(inner).not.toContain('>');
		// A hex colour has to survive as an escaped hash, not a fragment.
		expect(inner).toContain('%23ff0000');
	});

	test('stars stay inside the tile and within the size and opacity limits', () => {
		const tile = 300;
		const value = starFieldDataUri({ tile, count: 150, maxRadius: 2, maxOpacity: 0.5, seed: 3 });
		const matches = [...value.matchAll(/circle cx='([\d.]+)' cy='([\d.]+)' r='([\d.]+)' opacity='([\d.]+)'/g)];
		expect(matches.length).toBe(150);
		for (const [, cx, cy, r, opacity] of matches) {
			expect(Number(cx)).toBeGreaterThanOrEqual(0);
			expect(Number(cx)).toBeLessThanOrEqual(tile);
			expect(Number(cy)).toBeGreaterThanOrEqual(0);
			expect(Number(cy)).toBeLessThanOrEqual(tile);
			expect(Number(r)).toBeGreaterThan(0);
			expect(Number(r)).toBeLessThanOrEqual(2);
			expect(Number(opacity)).toBeGreaterThan(0);
			expect(Number(opacity)).toBeLessThanOrEqual(0.5);
		}
	});

	test('most stars are faint, so the field reads as depth rather than noise', () => {
		const value = starFieldDataUri({ count: 400, seed: 11 });
		const opacities = [...value.matchAll(/opacity='([\d.]+)'/g)].map((m) => Number(m[1]));
		const bright = opacities.filter((o) => o > 0.5).length;
		expect(bright / opacities.length).toBeLessThan(0.35);
	});
});
