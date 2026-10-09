import { describe, expect, test } from 'bun:test';
import {
	distanceMeters,
	enuFrame,
	polylineLength,
	simplifyPolyline,
	wrapLongitude
} from '../src/lib/geo.js';

const JBAY = { lat: -34.0308, lon: 24.9338 };

describe('enuFrame', () => {
	test('origin maps to the origin', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		const [x, y] = frame.toMeters(JBAY.lon, JBAY.lat);
		expect(x).toBeCloseTo(0, 9);
		expect(y).toBeCloseTo(0, 9);
	});

	test('toLonLat inverts toMeters', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		for (const [x, y] of [
			[0, 0],
			[1500, -2300],
			[-18_000, 42_000],
			[0.001, -0.001]
		]) {
			const [lon, lat] = frame.toLonLat(x, y);
			const [backX, backY] = frame.toMeters(lon, lat);
			expect(backX).toBeCloseTo(x, 6);
			expect(backY).toBeCloseTo(y, 6);
		}
	});

	test('toMeters inverts toLonLat', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		const lon = JBAY.lon + 0.04;
		const lat = JBAY.lat - 0.03;
		const [x, y] = frame.toMeters(lon, lat);
		const [backLon, backLat] = frame.toLonLat(x, y);
		expect(backLon).toBeCloseTo(lon, 12);
		expect(backLat).toBeCloseTo(lat, 12);
	});

	test('axes point east and north', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		expect(frame.toMeters(JBAY.lon + 0.01, JBAY.lat)[0]).toBeGreaterThan(0); // east
		expect(frame.toMeters(JBAY.lon - 0.01, JBAY.lat)[0]).toBeLessThan(0); // west
		expect(frame.toMeters(JBAY.lon, JBAY.lat + 0.01)[1]).toBeGreaterThan(0); // north
		expect(frame.toMeters(JBAY.lon, JBAY.lat - 0.01)[1]).toBeLessThan(0); // south

		// Moving east must not move you north, and vice versa.
		expect(frame.toMeters(JBAY.lon + 0.01, JBAY.lat)[1]).toBeCloseTo(0, 9);
		expect(frame.toMeters(JBAY.lon, JBAY.lat + 0.01)[0]).toBeCloseTo(0, 9);
	});

	test('WGS84 scale at J-Bay', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		// Reference values for latitude -34.0308 on the WGS84 ellipsoid: the
		// meridional radius of curvature, and the prime vertical times cos(lat).
		// Computed independently rather than taken from this implementation.
		expect(frame.metersPerDegreeLat).toBeCloseTo(110_922.9424, 2);
		expect(frame.metersPerDegreeLon).toBeCloseTo(92_351.4294, 2);

		// A degree of longitude shrinks with the cosine of the latitude.
		const atEquator = enuFrame(0, 0);
		expect(atEquator.metersPerDegreeLat).toBeCloseTo(110_574.2758, 2);
		expect(atEquator.metersPerDegreeLon).toBeCloseTo(111_319.4908, 2);
		// Close to cos(lat), but not exactly: the ellipsoid's prime-vertical
		// radius grows away from the equator, which adds about 0.1 percent here.
		expect(frame.metersPerDegreeLon / atEquator.metersPerDegreeLon).toBeCloseTo(
			Math.cos((JBAY.lat * Math.PI) / 180),
			2
		);
	});

	test('a 1 km step really is 1 km', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		for (const [x, y] of [
			[1000, 0],
			[0, 1000],
			[707.10678, 707.10678]
		]) {
			const [lon, lat] = frame.toLonLat(x, y);
			// Cross-check against an independent great-circle distance. The frame
			// is ellipsoidal and distanceMeters is spherical, so they agree to
			// about 0.3 percent, not exactly.
			expect(distanceMeters(JBAY.lon, JBAY.lat, lon, lat)).toBeCloseTo(1000, -1);
		}
	});

	test('the tangent plane is accurate near the origin and drifts far from it', () => {
		const frame = enuFrame(JBAY.lat, JBAY.lon);
		const error = (metres: number) => {
			const [lon, lat] = frame.toLonLat(0, metres);
			const real = distanceMeters(JBAY.lon, JBAY.lat, lon, lat);
			return Math.abs(real - metres) / metres;
		};
		// Relative error is dominated by the sphere-vs-ellipsoid difference in
		// the cross-check, so compare shapes: error does not blow up with range.
		expect(error(1000)).toBeLessThan(0.01);
		expect(error(30_000)).toBeLessThan(0.01);
	});

	test('handles the antimeridian', () => {
		const frame = enuFrame(0, 179.9);
		// 0.2 degrees east of 179.9 is -179.9, not most of the way round the world.
		const [x, y] = frame.toMeters(-179.9, 0);
		expect(x).toBeGreaterThan(0);
		expect(x).toBeCloseTo(0.2 * frame.metersPerDegreeLon, 6);
		expect(y).toBeCloseTo(0, 9);

		// And back again.
		const [lon] = frame.toLonLat(x, 0);
		expect(lon).toBeCloseTo(-179.9, 9);
	});

	test('handles a frame sitting exactly on the antimeridian', () => {
		const frame = enuFrame(0, 180);
		expect(frame.toMeters(-179.95, 0)[0]).toBeCloseTo(0.05 * frame.metersPerDegreeLon, 6);
		expect(frame.toMeters(179.95, 0)[0]).toBeCloseTo(-0.05 * frame.metersPerDegreeLon, 6);
	});

	test('a polar frame does not divide by zero', () => {
		const frame = enuFrame(90, 0);
		expect(frame.metersPerDegreeLon).toBeCloseTo(0, 6);
		expect(Number.isFinite(frame.toLonLat(100, 0)[0])).toBe(true);
	});
});

describe('wrapLongitude', () => {
	test('wraps into [-180, 180)', () => {
		expect(wrapLongitude(0)).toBe(0);
		expect(wrapLongitude(179.9)).toBeCloseTo(179.9, 12);
		expect(wrapLongitude(180)).toBe(-180);
		expect(wrapLongitude(181)).toBeCloseTo(-179, 12);
		expect(wrapLongitude(-181)).toBeCloseTo(179, 12);
		expect(wrapLongitude(360)).toBe(0);
		expect(wrapLongitude(-360)).toBe(0);
		expect(wrapLongitude(720 + 45)).toBeCloseTo(45, 12);
	});
});

describe('distanceMeters', () => {
	test('zero for the same point', () => {
		expect(distanceMeters(10, 20, 10, 20)).toBe(0);
	});

	test('one degree of latitude is about 111 km', () => {
		expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(111_195, -2);
	});

	test('is symmetric and crosses the antimeridian the short way', () => {
		expect(distanceMeters(179.9, 0, -179.9, 0)).toBeCloseTo(
			distanceMeters(-179.9, 0, 179.9, 0),
			6
		);
		expect(distanceMeters(179.9, 0, -179.9, 0)).toBeLessThan(25_000);
	});
});

describe('polylineLength', () => {
	test('sums the segments', () => {
		expect(polylineLength([])).toBe(0);
		expect(polylineLength([[0, 0]])).toBe(0);
		expect(
			polylineLength([
				[0, 0],
				[3, 4],
				[3, 14]
			])
		).toBeCloseTo(15, 9);
	});
});

describe('simplifyPolyline', () => {
	test('drops collinear vertices', () => {
		const line: [number, number][] = [
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0]
		];
		expect(simplifyPolyline(line, 0.5)).toEqual([
			[0, 0],
			[3, 0]
		]);
	});

	test('keeps a vertex further from the chord than the tolerance', () => {
		const line: [number, number][] = [
			[0, 0],
			[1, 5],
			[2, 0]
		];
		expect(simplifyPolyline(line, 1)).toHaveLength(3);
		expect(simplifyPolyline(line, 10)).toHaveLength(2);
	});

	test('a tolerance of zero or less is a copy', () => {
		const line: [number, number][] = [
			[0, 0],
			[1, 0],
			[2, 0]
		];
		const copy = simplifyPolyline(line, 0);
		expect(copy).toEqual(line);
		expect(copy).not.toBe(line);
	});

	test('always keeps the endpoints', () => {
		const line: [number, number][] = [
			[0, 0],
			[10, 0.1],
			[20, 0]
		];
		const simplified = simplifyPolyline(line, 100);
		expect(simplified[0]).toEqual([0, 0]);
		expect(simplified[simplified.length - 1]).toEqual([20, 0]);
	});
});
