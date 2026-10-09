import { describe, expect, test } from 'bun:test';
import type { GeoJSONFeature, Map as MapLibreMap } from 'maplibre-gl';
import { coastlineNear } from '../src/lib/coastline.js';
import { enuFrame } from '../src/lib/geo.js';

/*
 * Synthetic vector tiles.
 *
 * Everything here is built in tile space at zoom 14 and converted to lon/lat,
 * so a fixture can reproduce exactly what a real tileset does: clip each
 * polygon to the tile plus a 64/4096 buffer, and simplify each tile's copy of
 * a shared shore independently.
 */

const Z = 14;
const SCALE = 2 ** Z;
const EXTENT = 4096;
/** OpenMapTiles buffers by 64 units of 4096. */
const BUFFER = 64 / EXTENT;

/** The tile column and rows the fixtures live in. */
const TILE_X = 8000;
const TILE_ROWS = [7998, 7999, 8000];

type TilePoint = [u: number, v: number];

function tileToLon(u: number): number {
	return (u / SCALE) * 360 - 180;
}

function tileToLat(v: number): number {
	const n = Math.PI - (2 * Math.PI * v) / SCALE;
	return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function toLonLat([u, v]: TilePoint): [number, number] {
	return [tileToLon(u), tileToLat(v)];
}

function lineFeature(points: TilePoint[], featureClass = 'ocean'): GeoJSONFeature {
	return {
		type: 'Feature',
		properties: { class: featureClass },
		geometry: { type: 'LineString', coordinates: points.map(toLonLat) }
	} as unknown as GeoJSONFeature;
}

function polygonFeature(ring: TilePoint[], featureClass = 'ocean'): GeoJSONFeature {
	return {
		type: 'Feature',
		properties: { class: featureClass },
		geometry: { type: 'Polygon', coordinates: [ring.map(toLonLat)] }
	} as unknown as GeoJSONFeature;
}

/** A map stub exposing only what coastlineNear actually touches. */
function stubMap(features: GeoJSONFeature[], zoom = Z): MapLibreMap {
	return {
		loaded: () => true,
		isMoving: () => false,
		getZoom: () => zoom,
		getStyle: () => ({ sources: { openmaptiles: { type: 'vector' } } }),
		getSource: () => ({ type: 'vector', minzoom: 0, maxzoom: 14 }),
		querySourceFeatures: (_id: string, params?: { sourceLayer?: string }) =>
			params?.sourceLayer === 'water' ? features : [],
		on: () => {},
		off: () => {}
	} as unknown as MapLibreMap;
}

/**
 * The true shoreline, as a straight line in tile space running south and
 * drifting east. Slanted on purpose: a perfectly north-south shore would be
 * axis-aligned and the clip-line detector would have to work harder than this
 * fixture is trying to test.
 */
function shoreU(v: number): number {
	return TILE_X + 0.4 + 0.2 * (v - 7999);
}

/** The midpoint of the modelled shore, used as the query origin. */
const ORIGIN_V = 7999.5;
const ORIGIN: TilePoint = [shoreU(ORIGIN_V), ORIGIN_V];
const ORIGIN_LON_LAT = toLonLat(ORIGIN);

/**
 * One tile's clipped ocean polygon.
 *
 * The shore is the western edge; the ring then runs east along the southern
 * clip line, north up the eastern clip line, and west along the northern clip
 * line to close. Walking the shore southwards leaves the water on the left,
 * which is the OGC winding a real tileset uses.
 *
 * `jitterTiles` shifts this tile's copy of the shore sideways, standing in for
 * the independent simplification each tile really does.
 */
function clippedTile(tileRow: number, jitterTiles: number, stepTiles = 0.02): GeoJSONFeature {
	const vTop = tileRow - BUFFER;
	const vBottom = tileRow + 1 + BUFFER;
	const uEast = TILE_X + 1 + BUFFER;

	const shore: TilePoint[] = [];
	for (let v = vTop; v < vBottom; v += stepTiles) shore.push([shoreU(v) + jitterTiles, v]);
	shore.push([shoreU(vBottom) + jitterTiles, vBottom]);

	return polygonFeature([
		...shore,
		[uEast, vBottom], // clip edge, offset +64 in v
		[uEast, vTop], // clip edge, offset +64 in u
		shore[0] // clip edge, offset -64 in v
	]);
}

/** The three-tile fixture: one shore, cut up and buffered the way tiles do it. */
function seamFixture(): GeoJSONFeature[] {
	const jitter = [-0.0004, 0.0004, -0.0004]; // about a metre either way
	return TILE_ROWS.map((row, i) => clippedTile(row, jitter[i]));
}

/** Axis-aligned lines at the buffer offsets, far from the query, to feed detection. */
function clipLineDecoys(): GeoJSONFeature[] {
	const decoys: GeoJSONFeature[] = [];
	for (let i = 0; i < 3; i++) {
		const row = 7990 + i;
		decoys.push(lineFeature([[TILE_X + 0.2, row - BUFFER], [TILE_X + 0.8, row - BUFFER]]));
		decoys.push(lineFeature([[TILE_X + 0.2, row + BUFFER], [TILE_X + 0.8, row + BUFFER]]));
	}
	return decoys;
}

async function query(features: GeoJSONFeature[], options: Record<string, unknown> = {}) {
	return coastlineNear(stubMap(features), {
		lon: ORIGIN_LON_LAT[0],
		lat: ORIGIN_LON_LAT[1],
		radiusMeters: 3000,
		classes: ['ocean'],
		...options
	});
}

describe('clip-line detection', () => {
	test('finds the buffer offsets from the data', async () => {
		const result = await query(seamFixture());
		expect(result.stats.clipOffsets).toEqual([-64, 64]);
		expect(result.stats.droppedTileEdgeSegments).toBeGreaterThan(0);
		expect(result.stats.tileZoom).toBe(14);
	});

	test('leaves an axis-aligned shore alone when it does not repeat', async () => {
		// A single north-south run at an arbitrary offset is real coastline, not
		// a clip line, and must survive even though it is axis-aligned.
		const u = TILE_X + 0.3177; // offset 1301/4096, nothing like the buffer
		const features = [
			lineFeature([
				[u, ORIGIN_V - 0.1],
				[u, ORIGIN_V + 0.1]
			]),
			...clipLineDecoys()
		];
		const result = await query(features);
		expect(result.stats.clipOffsets).toEqual([-64, 64]);
		expect(result.polylines).toHaveLength(1);
		expect(result.stats.droppedTileEdgeSegments).toBe(0);
	});

	test('tileEdgeOffsets overrides detection', async () => {
		const result = await query(seamFixture(), { tileEdgeOffsets: [] });
		expect(result.stats.clipOffsets).toEqual([]);
		expect(result.stats.droppedTileEdgeSegments).toBe(0);
	});

	test('dropTileEdges false keeps the clip edges', async () => {
		const withEdges = await query(seamFixture(), { dropTileEdges: false });
		expect(withEdges.stats.droppedTileEdgeSegments).toBe(0);
		// The clip edges run far out to the east, well off the real shore.
		const spans = withEdges.polylines.map((line) =>
			Math.max(...line.points.map(([x]) => x)) - Math.min(...line.points.map(([x]) => x))
		);
		expect(Math.max(...spans)).toBeGreaterThan(1000);
	});
});

describe('seam bridging', () => {
	test('three tiles become one shore', async () => {
		const result = await query(seamFixture());

		expect(result.stats.bridgedGaps).toBe(2);
		expect(result.polylines).toHaveLength(1);

		const shore = result.polylines[0];
		// A straight line through the centre of a circle of radius 3000.
		expect(shore.lengthMeters).toBeGreaterThan(5800);
		expect(shore.lengthMeters).toBeLessThan(6100);
		expect(shore.closed).toBe(false);

		// It never wanders east towards the clip edges.
		const maxEast = Math.max(...shore.points.map(([x]) => x));
		expect(maxEast).toBeLessThan(700);
	});

	test('bridgeMeters zero leaves the tile pieces apart', async () => {
		const result = await query(seamFixture(), { bridgeMeters: 0 });
		expect(result.stats.bridgedGaps).toBe(0);
		expect(result.polylines.length).toBeGreaterThanOrEqual(3);
	});

	test('auto bridge distance covers two buffer widths', async () => {
		const result = await query(seamFixture());
		const twoBuffers = 2 * BUFFER * result.stats.tileWidthMeters;
		expect(result.stats.bridgeMeters).toBeGreaterThan(twoBuffers);
		expect(result.stats.bridgeMeters).toBeLessThan(3 * twoBuffers);
	});

	test('the join lands between the two clip lines, not past them', async () => {
		const result = await query(seamFixture());
		const frame = enuFrame(ORIGIN_LON_LAT[1], ORIGIN_LON_LAT[0]);
		// The boundary between tile rows 7999 and 8000.
		const [, seamY] = frame.toMeters(tileToLon(shoreU(8000)), tileToLat(8000));
		const halfBuffer = BUFFER * result.stats.tileWidthMeters;

		// Walking south through the seam, y must decrease monotonically: a bad
		// join would double back into the overlap.
		const points = result.polylines[0].points;
		const nearSeam = points.filter(([, y]) => Math.abs(y - seamY) < 3 * halfBuffer);
		expect(nearSeam.length).toBeGreaterThan(2);
		for (let i = 1; i < nearSeam.length; i++) {
			expect(nearSeam[i][1]).toBeLessThan(nearSeam[i - 1][1]);
		}
	});
});

describe('real gaps are kept', () => {
	test('a river mouth is not bridged', async () => {
		// Two shore pieces whose ends sit mid-tile, nowhere near a clip line,
		// and closer together than the auto bridge distance.
		const gapTop = 7999.42;
		const gapBottom = 7999.45; // about 73 m, inside the ~95 m bridge distance
		const north: TilePoint[] = [];
		for (let v = 7999.2; v < gapTop; v += 0.02) north.push([shoreU(v), v]);
		north.push([shoreU(gapTop), gapTop]);
		const south: TilePoint[] = [[shoreU(gapBottom), gapBottom]];
		for (let v = gapBottom + 0.02; v < 7999.8; v += 0.02) south.push([shoreU(v), v]);

		const result = await query([lineFeature(north), lineFeature(south), ...clipLineDecoys()]);

		expect(result.stats.clipOffsets).toEqual([-64, 64]);
		expect(result.stats.bridgedGaps).toBe(0);
		expect(result.polylines).toHaveLength(2);

		// Confirm the gap really was inside bridging range, so the test is
		// proving the clip-line gate and not merely an out-of-range distance.
		const [aEnd] = result.polylines
			.map((line) => line.points[line.points.length - 1])
			.sort((p, q) => q[1] - p[1]);
		const [, bStart] = result.polylines.map((line) => line.points[0]).sort((p, q) => q[1] - p[1]);
		expect(Math.hypot(bStart[0] - aEnd[0], bStart[1] - aEnd[1])).toBeLessThan(
			result.stats.bridgeMeters
		);
	});

	test('two pieces running opposite ways are not joined', async () => {
		const southbound: TilePoint[] = [];
		for (let v = 7999.2; v < 7999.42; v += 0.02) southbound.push([shoreU(v), v]);
		// Same stretch of coast, but wound the other way, so the water is on the
		// other side. Joining these would be wrong whatever the distance.
		const northbound: TilePoint[] = [];
		for (let v = 7999.8; v > 7999.45; v -= 0.02) northbound.push([shoreU(v), v]);

		const result = await query([
			lineFeature(southbound),
			lineFeature(northbound),
			...clipLineDecoys()
		]);
		expect(result.stats.bridgedGaps).toBe(0);
		expect(result.polylines).toHaveLength(2);
	});
});

describe('winding', () => {
	test('water stays on the left', async () => {
		const result = await query(seamFixture());
		expect(result.waterSide).toBe('left');

		const points = result.polylines[0].points;
		// The fixture winds the shore southward with the ocean to the east, so
		// the output must run north to south.
		expect(points[0][1]).toBeGreaterThan(points[points.length - 1][1]);

		// Left of the direction of travel must point east, into the water.
		// Segments shorter than 5 m are skipped: a splice carries a sideways
		// step of a metre or two where the two tiles disagree about the shore,
		// and that step is mostly east-west by construction.
		let checked = 0;
		for (let i = 1; i < points.length; i++) {
			const dx = points[i][0] - points[i - 1][0];
			const dy = points[i][1] - points[i - 1][1];
			const length = Math.hypot(dx, dy);
			if (length < 5) continue;
			checked++;
			const leftX = -dy / length; // rotate the heading 90 degrees left
			expect(leftX).toBeGreaterThan(0.9); // pointing east
		}
		expect(checked).toBeGreaterThan(50);

		// And the sideways steps really are small.
		for (let i = 1; i < points.length; i++) {
			const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
			if (length >= 5) continue;
			expect(length).toBeLessThan(3);
		}
	});

	test('reversing the source reverses the output', async () => {
		const shore: TilePoint[] = [];
		for (let v = 7999.3; v < 7999.7; v += 0.02) shore.push([shoreU(v), v]);

		const forward = await query([lineFeature(shore)], { bridgeMeters: 0 });
		const backward = await query([lineFeature([...shore].reverse())], { bridgeMeters: 0 });

		expect(forward.polylines).toHaveLength(1);
		expect(backward.polylines).toHaveLength(1);

		const a = forward.polylines[0].points;
		const b = backward.polylines[0].points;
		expect(b).toHaveLength(a.length);
		expect(b[0][1]).toBeCloseTo(a[a.length - 1][1], 6);
		expect(b[b.length - 1][1]).toBeCloseTo(a[0][1], 6);
	});
});

describe('querying', () => {
	test('clips to the radius', async () => {
		const result = await query(seamFixture(), { radiusMeters: 500 });
		for (const line of result.polylines) {
			for (const [x, y] of line.points) {
				expect(Math.hypot(x, y)).toBeLessThanOrEqual(500.001);
			}
		}
		expect(result.polylines[0].lengthMeters).toBeGreaterThan(900);
	});

	test('de-duplicates the geometry two tiles share', async () => {
		// The same tile handed back twice, as overlapping tile buffers do.
		const tile = clippedTile(7999, 0);
		const result = await query([tile, tile, ...clipLineDecoys()]);
		expect(result.stats.duplicateSegments).toBeGreaterThan(0);

		const once = await query([tile, ...clipLineDecoys()]);
		expect(result.stats.segmentCount).toBe(once.stats.segmentCount);
		expect(result.polylines).toHaveLength(once.polylines.length);
	});

	test('the class filter works and reports what it saw', async () => {
		const features = [
			...seamFixture(),
			lineFeature(
				[
					[TILE_X + 0.1, 7999.4],
					[TILE_X + 0.1, 7999.6]
				],
				'lake'
			)
		];

		const oceanOnly = await query(features);
		expect(oceanOnly.stats.classes).toEqual(['lake', 'ocean']);
		expect(oceanOnly.polylines).toHaveLength(1);

		const everything = await query(features, { classes: undefined });
		expect(everything.polylines.length).toBeGreaterThan(1);
	});

	test('reports the tile width at the query latitude', async () => {
		const result = await query(seamFixture());
		const expected = (40075016.686 * Math.cos((ORIGIN_LON_LAT[1] * Math.PI) / 180)) / SCALE;
		expect(result.stats.tileWidthMeters).toBeCloseTo(expected, 3);
	});

	test('rejects a radius that is not positive', async () => {
		expect(query(seamFixture(), { radiusMeters: 0 })).rejects.toThrow('positive radiusMeters');
	});

	test('an empty style gives an empty result rather than throwing', async () => {
		const result = await query([]);
		expect(result.polylines).toEqual([]);
		expect(result.stats.featureCount).toBe(0);
		expect(result.stats.sources).toEqual([]);
	});

	test('simplifyMeters thins the output', async () => {
		const full = await query(seamFixture());
		const thinned = await query(seamFixture(), { simplifyMeters: 50 });
		expect(thinned.stats.vertexCount).toBeLessThan(full.stats.vertexCount);
		expect(thinned.polylines[0].lengthMeters).toBeCloseTo(full.polylines[0].lengthMeters, -2);
	});

	test('minLengthMeters drops the stubs', async () => {
		const features = [
			...seamFixture(),
			lineFeature([
				[TILE_X + 0.1, 7999.5],
				[TILE_X + 0.1005, 7999.5005]
			])
		];
		const all = await query(features);
		const filtered = await query(features, { minLengthMeters: 100 });
		expect(filtered.polylines.length).toBeLessThan(all.polylines.length);
	});
});
