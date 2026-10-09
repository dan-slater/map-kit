import type { FilterSpecification, GeoJSONFeature, Map as MapLibreMap } from 'maplibre-gl';
import {
	enuFrame,
	polylineLength,
	simplifyPolyline,
	type EnuFrame,
	type Meters
} from './geo.js';
import { waitForIdle } from './mapUtils.js';

type Geometry = GeoJSONFeature['geometry'];
type Ring = number[][];

export type CoastlinePolyline = {
	/**
	 * Vertices in tangent-plane metres about the query point: `[xEast, yNorth]`.
	 * Walking the polyline from index 0, water lies to the left.
	 */
	points: Meters[];
	/** `true` when the first and last vertex coincide within `snapMeters`. */
	closed: boolean;
	/** Length along the polyline, metres. */
	lengthMeters: number;
};

export type CoastlineStats = {
	/** Map zoom at the moment of the query. */
	zoom: number;
	/** Integer tile zoom the geometry was read from. */
	tileZoom: number;
	/** Source ids that actually returned features. */
	sources: string[];
	/** Features inspected after filtering. */
	featureCount: number;
	/** Distinct `properties.class` values seen, for example `['ocean', 'river']`. */
	classes: string[];
	/** Segments kept after clipping, edge-dropping and de-duplication. */
	segmentCount: number;
	/** Segments discarded because they lay along a vector-tile clip edge. */
	droppedTileEdgeSegments: number;
	/** Segments discarded as duplicates from overlapping tile buffers. */
	duplicateSegments: number;
	/** Total vertices across all returned polylines. */
	vertexCount: number;
	/** `false` when the map had not finished loading tiles before the query ran. */
	settled: boolean;
};

export type CoastlineResult = {
	/** The query point. */
	origin: { lon: number; lat: number };
	/** The tangent plane the points are expressed in. Use it to go back to lon/lat. */
	frame: EnuFrame;
	/** The radius the result was clipped to, metres. */
	radiusMeters: number;
	/** Polylines, longest first. */
	polylines: CoastlinePolyline[];
	/** Which side of the direction of travel the water is on. Always `'left'`. */
	waterSide: 'left';
	stats: CoastlineStats;
};

export type CoastlineNearOptions = {
	/** Centre of the query, degrees. */
	lon: number;
	/** Centre of the query, degrees. */
	lat: number;
	/** Keep boundary within this many metres of the centre. */
	radiusMeters: number;
	/** Vector source-layer to read. Default `'water'` (the OpenMapTiles name). */
	sourceLayer?: string;
	/** Source ids to query. Default: every vector source in the current style. */
	sources?: string[];
	/** MapLibre filter handed to `querySourceFeatures`. */
	filter?: FilterSpecification;
	/** Keep only features whose `properties.class` is in this list, for example `['ocean']`. */
	classes?: string[];
	/** Arbitrary extra predicate run over each feature. */
	where?: (feature: GeoJSONFeature) => boolean;
	/** Ramer-Douglas-Peucker tolerance in metres applied to each polyline. Default 0 (off). */
	simplifyMeters?: number;
	/** Vertices closer than this are treated as the same point when stitching. Default 0.5 m. */
	snapMeters?: number;
	/** Drop polylines shorter than this. Default 0. */
	minLengthMeters?: number;
	/** Drop segments lying along a vector-tile clip edge. Default `true`. */
	dropTileEdges?: boolean;
	/** Half-width of the clip-edge band, in tile units. Default 0.025. */
	tileEdgeTolerance?: number;
	/** Vector-tile coordinate extent, used to size the axis-alignment test. Default 4096. */
	tileExtent?: number;
	/** Override the tile zoom used by the clip-edge test. Default: inferred from the camera. */
	tileZoom?: number;
	/** Wait for the map to go idle before querying. Default `true`. Leave it on. */
	wait?: boolean;
	/** How long to wait for idle before querying anyway. Default 10000 ms. */
	timeoutMs?: number;
};

const DEDUPE_METERS = 0.01;

/**
 * Turn the water polygons already loaded in the browser into coastline
 * polylines around a point.
 *
 * It reads the `water` source-layer of the vector tiles the map has in memory,
 * takes the polygon boundaries, clips them to `radiusMeters` about the query
 * point, throws away the straight edges that vector-tile clipping invents, and
 * stitches what is left into ordered polylines expressed in tangent-plane
 * metres (see {@link enuFrame}).
 *
 * ## Zoom matters
 *
 * OpenMapTiles generalises water geometry per zoom, and the tiles the map has
 * in memory are the tiles for the current camera. Below about zoom 10 the
 * coastline is heavily simplified and a bay reads as a straight line. Zoom 13
 * to 15 is the useful band: zoom 14 is the maximum zoom OpenFreeMap serves for
 * this layer, so 14 and 15 give identical geometry at roughly 5 to 10 m vertex
 * spacing. Fly first, then query:
 *
 * ```ts
 * await flyTo(map, { lon, lat, zoom: 14, duration: 0 });
 * const coast = await coastlineNear(map, { lon, lat, radiusMeters: 2000 });
 * ```
 *
 * ## What you get back
 *
 * Polylines carry direction. Walking a polyline from index 0, water is on the
 * left and land on the right, because OpenMapTiles follows the OGC winding
 * convention and this function never reverses a segment. That is how a caller
 * works out which way the sea is without a second query.
 *
 * ## Caveats worth knowing
 *
 * - Only tiles currently loaded are visible to the query. A radius larger than
 *   the viewport returns only the part that is on screen. Keep the radius
 *   inside the viewport, or zoom out and accept coarser geometry.
 * - Geometry is generalised by the tile pipeline. These are cartographic
 *   coastlines, not survey data.
 * - `class` distinguishes `ocean` from `lake`, `river` and so on. Pass
 *   `classes: ['ocean']` when inland water would be noise.
 */
export async function coastlineNear(
	map: MapLibreMap,
	options: CoastlineNearOptions
): Promise<CoastlineResult> {
	const {
		lon,
		lat,
		radiusMeters,
		sourceLayer = 'water',
		sources,
		filter,
		classes,
		where,
		simplifyMeters = 0,
		snapMeters = 0.5,
		minLengthMeters = 0,
		dropTileEdges = true,
		tileEdgeTolerance = 0.025,
		tileExtent = 4096,
		tileZoom,
		wait = true,
		timeoutMs = 10_000
	} = options;

	if (!(radiusMeters > 0)) {
		throw new Error('[map-kit] coastlineNear needs a positive radiusMeters');
	}

	const settled = wait ? await waitForIdle(map, timeoutMs) : map.loaded();

	const frame = enuFrame(lat, lon);
	const zoom = map.getZoom();
	const effectiveTileZoom = tileZoom ?? inferTileZoom(map);
	const classSet = classes ? new Set(classes) : null;

	const sourceIds = sources ?? vectorSourceIds(map);
	const usedSources: string[] = [];
	const features: GeoJSONFeature[] = [];
	const seenClasses = new Set<string>();

	for (const id of sourceIds) {
		let found: GeoJSONFeature[];
		try {
			found = map.querySourceFeatures(id, {
				sourceLayer,
				...(filter ? { filter } : {})
			});
		} catch {
			// A source without this source-layer, or one still loading. Skip it.
			continue;
		}
		if (found.length === 0) continue;
		usedSources.push(id);
		for (const feature of found) {
			const featureClass = String(feature.properties?.class ?? '');
			seenClasses.add(featureClass);
			if (classSet && !classSet.has(featureClass)) continue;
			if (where && !where(feature)) continue;
			features.push(feature);
		}
	}

	// Pull every ring into clipped, de-duplicated, directed segments.
	const segments: number[] = []; // flat ax, ay, bx, by
	const seen = new Set<string>();
	let droppedTileEdgeSegments = 0;
	let duplicateSegments = 0;

	const scale = 2 ** effectiveTileZoom;
	// A vector-tile clip edge is exactly axis-aligned on the tile's integer
	// grid, so "axis-aligned" means "within one grid unit".
	const axisTolerance = 1 / tileExtent;
	const radiusSquared = radiusMeters * radiusMeters;

	for (const feature of features) {
		for (const ring of ringsOf(feature.geometry)) {
			if (ring.length < 2) continue;

			for (let i = 1; i < ring.length; i++) {
				const p0 = ring[i - 1];
				const p1 = ring[i];
				if (!isFinitePair(p0) || !isFinitePair(p1)) continue;

				const [ax, ay] = frame.toMeters(p0[0], p0[1]);
				const [bx, by] = frame.toMeters(p1[0], p1[1]);

				// Cheap reject: both endpoints far outside on the same side.
				if (
					(ax * ax + ay * ay > radiusSquared && bx * bx + by * by > radiusSquared) &&
					!segmentCouldCrossCircle(ax, ay, bx, by, radiusMeters)
				) {
					continue;
				}

				if (dropTileEdges) {
					const u0 = lonToTile(p0[0], scale);
					const u1 = lonToTile(p1[0], scale);
					const v0 = latToTile(p0[1], scale);
					const v1 = latToTile(p1[1], scale);
					if (onTileClipEdge(u0, v0, u1, v1, axisTolerance, tileEdgeTolerance)) {
						droppedTileEdgeSegments++;
						continue;
					}
				}

				const span = clipSegmentToCircle(ax, ay, bx, by, radiusMeters);
				if (!span) continue;

				const dx = bx - ax;
				const dy = by - ay;
				const cax = ax + span[0] * dx;
				const cay = ay + span[0] * dy;
				const cbx = ax + span[1] * dx;
				const cby = ay + span[1] * dy;

				const key =
					`${quantise(cax, DEDUPE_METERS)},${quantise(cay, DEDUPE_METERS)},` +
					`${quantise(cbx, DEDUPE_METERS)},${quantise(cby, DEDUPE_METERS)}`;
				if (seen.has(key)) {
					duplicateSegments++;
					continue;
				}
				seen.add(key);
				segments.push(cax, cay, cbx, cby);
			}
		}
	}

	const chained = stitch(segments, snapMeters);

	const polylines: CoastlinePolyline[] = [];
	for (const points of chained) {
		const simplified = simplifyMeters > 0 ? simplifyPolyline(points, simplifyMeters) : points;
		if (simplified.length < 2) continue;
		const lengthMeters = polylineLength(simplified);
		if (lengthMeters < minLengthMeters) continue;
		const first = simplified[0];
		const last = simplified[simplified.length - 1];
		polylines.push({
			points: simplified,
			closed: Math.hypot(last[0] - first[0], last[1] - first[1]) <= snapMeters,
			lengthMeters
		});
	}
	polylines.sort((a, b) => b.lengthMeters - a.lengthMeters);

	return {
		origin: { lon, lat },
		frame,
		radiusMeters,
		polylines,
		waterSide: 'left',
		stats: {
			zoom,
			tileZoom: effectiveTileZoom,
			sources: usedSources,
			featureCount: features.length,
			classes: [...seenClasses].filter(Boolean).sort(),
			segmentCount: segments.length / 4,
			droppedTileEdgeSegments,
			duplicateSegments,
			vertexCount: polylines.reduce((n, p) => n + p.points.length, 0),
			settled
		}
	};
}

/** Every vector source id in the current style, in style order. */
export function vectorSourceIds(map: MapLibreMap): string[] {
	let style;
	try {
		style = map.getStyle();
	} catch {
		return [];
	}
	const sources = style?.sources ?? {};
	return Object.keys(sources).filter((id) => sources[id]?.type === 'vector');
}

/**
 * The integer tile zoom MapLibre is reading vector tiles at, which is what the
 * clip-edge test needs. Vector sources use 512 px tiles, so this is the floor
 * of the camera zoom, clamped to the source's own zoom range.
 */
function inferTileZoom(map: MapLibreMap): number {
	const base = Math.max(0, Math.floor(map.getZoom()));
	let maxzoom = 14;
	let minzoom = 0;
	for (const id of vectorSourceIds(map)) {
		const source = map.getSource(id) as { maxzoom?: number; minzoom?: number } | undefined;
		if (typeof source?.maxzoom === 'number') maxzoom = Math.min(maxzoom, source.maxzoom);
		if (typeof source?.minzoom === 'number') minzoom = Math.max(minzoom, source.minzoom);
	}
	return Math.min(Math.max(base, minzoom), maxzoom);
}

function* ringsOf(geometry: Geometry): Generator<Ring> {
	if (!geometry) return;
	switch (geometry.type) {
		case 'Polygon':
			yield* geometry.coordinates as Ring[];
			break;
		case 'MultiPolygon':
			for (const polygon of geometry.coordinates as Ring[][]) yield* polygon;
			break;
		case 'LineString':
			yield geometry.coordinates as Ring;
			break;
		case 'MultiLineString':
			yield* geometry.coordinates as Ring[];
			break;
		case 'GeometryCollection':
			for (const child of geometry.geometries) yield* ringsOf(child);
			break;
		default:
			break;
	}
}

function isFinitePair(p: number[]): boolean {
	return p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function lonToTile(lon: number, scale: number): number {
	return ((lon + 180) / 360) * scale;
}

function latToTile(lat: number, scale: number): number {
	const clamped = Math.max(-85.0511287798, Math.min(85.0511287798, lat));
	const s = Math.sin(clamped * (Math.PI / 180));
	return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}

/**
 * A vector tile carries polygons clipped to its own bounds plus a small
 * buffer, so every clipped polygon gains straight edges that are not real
 * coastline. Those edges are exactly axis-aligned in tile space and sit within
 * the buffer of a tile boundary. Real coastline is almost never both.
 */
function onTileClipEdge(
	u0: number,
	v0: number,
	u1: number,
	v1: number,
	axisTolerance: number,
	edgeTolerance: number
): boolean {
	if (Math.abs(u1 - u0) <= axisTolerance && nearInteger((u0 + u1) / 2, edgeTolerance)) return true;
	if (Math.abs(v1 - v0) <= axisTolerance && nearInteger((v0 + v1) / 2, edgeTolerance)) return true;
	return false;
}

function nearInteger(x: number, tolerance: number): boolean {
	return Math.abs(x - Math.round(x)) <= tolerance;
}

/** Conservative test for a segment that starts and ends outside the circle but cuts through it. */
function segmentCouldCrossCircle(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	r: number
): boolean {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return false;
	let t = -(ax * dx + ay * dy) / lengthSquared;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return cx * cx + cy * cy <= r * r;
}

/**
 * The portion of segment `a -> b` that lies inside a circle of radius `r`
 * centred on the origin, as a parameter span `[t0, t1]`, or `null`.
 */
function clipSegmentToCircle(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	r: number
): [number, number] | null {
	const dx = bx - ax;
	const dy = by - ay;
	const a = dx * dx + dy * dy;
	if (a === 0) return null;
	const b = 2 * (ax * dx + ay * dy);
	const c = ax * ax + ay * ay - r * r;
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) return null;
	const root = Math.sqrt(discriminant);
	let t0 = (-b - root) / (2 * a);
	let t1 = (-b + root) / (2 * a);
	if (t1 <= 0 || t0 >= 1) return null;
	if (t0 < 0) t0 = 0;
	if (t1 > 1) t1 = 1;
	if (t1 <= t0) return null;
	return [t0, t1];
}

function quantise(value: number, step: number): number {
	return Math.round(value / step);
}

function pointKey(x: number, y: number, snap: number): string {
	return `${quantise(x, snap)}:${quantise(y, snap)}`;
}

/**
 * Chain directed segments head-to-tail into polylines.
 *
 * Segments are never reversed, so the winding of the source rings survives and
 * callers can rely on water being to the left. Where several segments leave the
 * same point, the one that continues straightest wins, which keeps a coastline
 * running past a river mouth instead of turning up it.
 */
function stitch(flat: number[], snap: number): Meters[][] {
	const count = flat.length / 4;
	if (count === 0) return [];

	const startIndex = new Map<string, number[]>();
	const endIndex = new Map<string, number[]>();
	for (let i = 0; i < count; i++) {
		push(startIndex, pointKey(flat[i * 4], flat[i * 4 + 1], snap), i);
		push(endIndex, pointKey(flat[i * 4 + 2], flat[i * 4 + 3], snap), i);
	}

	const used = new Uint8Array(count);
	const out: Meters[][] = [];

	for (let seed = 0; seed < count; seed++) {
		if (used[seed]) continue;
		used[seed] = 1;
		const chain: number[] = [seed];

		// Walk backwards: find a segment whose end meets this chain's start.
		let head = seed;
		for (;;) {
			const key = pointKey(flat[head * 4], flat[head * 4 + 1], snap);
			const next = pickStraightest(endIndex.get(key), used, flat, head, 'backward');
			if (next === -1) break;
			used[next] = 1;
			chain.unshift(next);
			head = next;
		}

		// Walk forwards: find a segment whose start meets this chain's end.
		let tail = seed;
		for (;;) {
			const key = pointKey(flat[tail * 4 + 2], flat[tail * 4 + 3], snap);
			const next = pickStraightest(startIndex.get(key), used, flat, tail, 'forward');
			if (next === -1) break;
			used[next] = 1;
			chain.push(next);
			tail = next;
		}

		const points: Meters[] = [[flat[chain[0] * 4], flat[chain[0] * 4 + 1]]];
		for (const i of chain) points.push([flat[i * 4 + 2], flat[i * 4 + 3]]);
		out.push(points);
	}

	return out;
}

function push(index: Map<string, number[]>, key: string, value: number): void {
	const bucket = index.get(key);
	if (bucket) bucket.push(value);
	else index.set(key, [value]);
}

function pickStraightest(
	candidates: number[] | undefined,
	used: Uint8Array,
	flat: number[],
	from: number,
	direction: 'forward' | 'backward'
): number {
	if (!candidates) return -1;

	const fdx = flat[from * 4 + 2] - flat[from * 4];
	const fdy = flat[from * 4 + 3] - flat[from * 4 + 1];
	const fromAngle = Math.atan2(fdy, fdx);

	let best = -1;
	let bestTurn = Infinity;
	for (const i of candidates) {
		if (used[i]) continue;
		const dx = flat[i * 4 + 2] - flat[i * 4];
		const dy = flat[i * 4 + 3] - flat[i * 4 + 1];
		if (dx === 0 && dy === 0) continue;
		const angle = Math.atan2(dy, dx);
		const turn = Math.abs(
			normaliseAngle(direction === 'forward' ? angle - fromAngle : fromAngle - angle)
		);
		if (turn < bestTurn) {
			bestTurn = turn;
			best = i;
		}
	}
	return best;
}

function normaliseAngle(a: number): number {
	let angle = a;
	while (angle > Math.PI) angle -= 2 * Math.PI;
	while (angle < -Math.PI) angle += 2 * Math.PI;
	return angle;
}
