import { enuFrame, polylineLength, simplifyPolyline } from './geo.js';
import { waitForIdle } from './mapUtils.js';
/** Coordinates are compared at this resolution when removing duplicate segments. */
const DEDUPE_METERS = 0.01;
/** Earth's circumference along the equator, metres. One tile row at zoom 0. */
const EQUATOR_METERS = 40075016.686;
/**
 * Turn the water polygons already loaded in the browser into coastline
 * polylines around a point.
 *
 * It reads the `water` source-layer of the vector tiles the map has in memory,
 * takes the polygon boundaries, clips them to `radiusMeters` about the query
 * point, throws away the straight edges that vector-tile clipping invents,
 * joins the pieces back across tile seams, and returns ordered polylines in
 * tangent-plane metres (see {@link enuFrame}).
 *
 * ## Zoom matters
 *
 * OpenMapTiles generalises water geometry per zoom, and the tiles the map has
 * in memory are the tiles for the current camera. Below about zoom 10 the
 * coastline is heavily simplified and a bay reads as a straight line. Zoom 13
 * to 15 is the useful band: zoom 14 is the deepest zoom OpenFreeMap serves for
 * this layer, so 14 and 15 return the same geometry, with vertices a few
 * metres to a few tens of metres apart. Fly first, then query:
 *
 * ```ts
 * await flyTo(map, { lon, lat, zoom: 14, duration: 0 });
 * const coast = await coastlineNear(map, { lon, lat, radiusMeters: 2000 });
 * ```
 *
 * ## What you get back
 *
 * Polylines carry direction. Walking a polyline from index 0, **water is on
 * the right and land on the left** by default. That is how a caller works out
 * which way the sea faces without a second query:
 *
 * ```ts
 * // Unit normal pointing into the water, at vertex i.
 * const [x0, y0] = line.points[i];
 * const [x1, y1] = line.points[i + 1];
 * const length = Math.hypot(x1 - x0, y1 - y0);
 * const seaward = [(y1 - y0) / length, -(x1 - x0) / length];
 * ```
 *
 * The side is a guarantee rather than an observation. The winding of the
 * source rings is measured per query, from the signed area of the largest
 * ring, and the polylines are reversed if that does not match the `waterSide`
 * option. So the contract holds even if a tileset winds the other way.
 * `stats.detectedWaterSide` reports what the source actually did.
 *
 * OpenFreeMap's water rings run clockwise in longitude and latitude, which
 * puts the interior on the right, so the default of `'right'` reverses
 * nothing. Pass `waterSide: 'left'` for the opposite convention.
 *
 * ## Tile seams
 *
 * Vector tiles clip each polygon to the tile plus a buffer, which invents
 * straight edges that are not coastline. Those are detected and removed. Doing
 * so leaves each tile's piece of coast ending on its own clip line, and
 * adjacent tiles clip on opposite sides of the shared boundary, so consecutive
 * pieces finish about two buffer widths apart (around 60 m at zoom 14). The
 * two tiles also simplify the same shore independently, so their geometry
 * disagrees by a metre or two in the overlap.
 *
 * Pieces whose ends both sit on a detected clip line, point at each other, and
 * fall within `bridgeMeters` are joined back up. The requirement that both
 * ends sit on a clip line is what keeps a real gap, such as a river mouth,
 * from being bridged. Set `bridgeMeters: 0` to see the raw pieces, and read
 * `stats.bridgedGaps` to see how many joins were made.
 *
 * ## Other caveats
 *
 * - Only tiles currently loaded are visible to the query. A radius larger than
 *   the viewport returns only the part that is on screen. Keep the radius
 *   inside the viewport, or zoom out and accept coarser geometry.
 * - Geometry is generalised by the tile pipeline. These are cartographic
 *   coastlines, not survey data.
 * - `class` distinguishes `ocean` from `lake`, `river` and so on. Pass
 *   `classes: ['ocean']` when inland water would be noise.
 */
export async function coastlineNear(map, options) {
    const { lon, lat, radiusMeters, sourceLayer = 'water', sources, filter, classes, where, simplifyMeters = 0, snapMeters = 0.5, minLengthMeters = 0, waterSide = 'right', dropTileEdges = true, tileEdgeBand = 0.1, tileEdgeMinCount = 3, tileEdgeOffsets, bridgeMeters = 'auto', tileExtent = 4096, tileZoom, wait = true, timeoutMs = 10_000 } = options;
    if (!(radiusMeters > 0)) {
        throw new Error('[map-kit] coastlineNear needs a positive radiusMeters');
    }
    const settled = wait ? await waitForIdle(map, timeoutMs) : map.loaded();
    const frame = enuFrame(lat, lon);
    const zoom = map.getZoom();
    const effectiveTileZoom = tileZoom ?? inferTileZoom(map);
    const classSet = classes ? new Set(classes) : null;
    const sourceIds = sources ?? vectorSourceIds(map);
    const usedSources = [];
    const features = [];
    const seenClasses = new Set();
    for (const id of sourceIds) {
        let found;
        try {
            found = map.querySourceFeatures(id, {
                sourceLayer,
                ...(filter ? { filter } : {})
            });
        }
        catch {
            // A source without this source-layer, or one still loading. Skip it.
            continue;
        }
        if (found.length === 0)
            continue;
        usedSources.push(id);
        for (const feature of found) {
            const featureClass = String(feature.properties?.class ?? '');
            seenClasses.add(featureClass);
            if (classSet && !classSet.has(featureClass))
                continue;
            if (where && !where(feature))
                continue;
            features.push(feature);
        }
    }
    const scale = 2 ** effectiveTileZoom;
    // Tile geometry is quantised to an integer grid of `tileExtent` steps, so
    // "axis-aligned" means "both endpoints in the same grid column or row".
    const axisTolerance = 0.5 / tileExtent;
    const radiusSquared = radiusMeters * radiusMeters;
    const tileWidthMeters = (EQUATOR_METERS * Math.cos((lat * Math.PI) / 180)) / scale;
    const raw = [];
    const offsetCounts = new Map();
    // Twice the signed area of the biggest ring seen, which is all but
    // certainly an exterior ring of the dominant water body. Its sign is what
    // tells us which side of a ring the water is on in this tileset.
    let largestRingTwiceArea = 0;
    for (const feature of features) {
        for (const ring of ringsOf(feature.geometry)) {
            if (ring.length < 2)
                continue;
            // Only a closed ring has an orientation. The shoelace sum of an
            // open line is a number, but it means nothing, so a source layer
            // of lines rather than polygons must not be measured.
            const first = ring[0];
            const last = ring[ring.length - 1];
            const closedRing = ring.length >= 4 &&
                isFinitePair(first) &&
                isFinitePair(last) &&
                first[0] === last[0] &&
                first[1] === last[1];
            let ringTwiceArea = 0;
            for (let i = 1; i < ring.length; i++) {
                const p0 = ring[i - 1];
                const p1 = ring[i];
                if (!isFinitePair(p0) || !isFinitePair(p1))
                    continue;
                const u0 = lonToTile(p0[0], scale);
                const u1 = lonToTile(p1[0], scale);
                const v0 = latToTile(p0[1], scale);
                const v1 = latToTile(p1[1], scale);
                let edgeOffset = null;
                if (dropTileEdges) {
                    if (Math.abs(u1 - u0) <= axisTolerance) {
                        edgeOffset = boundaryOffset((u0 + u1) / 2, tileExtent);
                    }
                    else if (Math.abs(v1 - v0) <= axisTolerance) {
                        edgeOffset = boundaryOffset((v0 + v1) / 2, tileExtent);
                    }
                    if (edgeOffset !== null) {
                        offsetCounts.set(edgeOffset, (offsetCounts.get(edgeOffset) ?? 0) + 1);
                    }
                }
                const [ax, ay] = frame.toMeters(p0[0], p0[1]);
                const [bx, by] = frame.toMeters(p1[0], p1[1]);
                // Shoelace over the whole ring, near the query point or not.
                ringTwiceArea += ax * by - bx * ay;
                // Cheap reject: the whole edge sits outside the circle.
                if (ax * ax + ay * ay > radiusSquared &&
                    bx * bx + by * by > radiusSquared &&
                    !segmentCouldCrossCircle(ax, ay, bx, by, radiusMeters)) {
                    continue;
                }
                raw.push({
                    ax,
                    ay,
                    bx,
                    by,
                    edgeOffset,
                    aOffsets: [boundaryOffset(u0, tileExtent), boundaryOffset(v0, tileExtent)],
                    bOffsets: [boundaryOffset(u1, tileExtent), boundaryOffset(v1, tileExtent)]
                });
            }
            if (closedRing && Math.abs(ringTwiceArea) > Math.abs(largestRingTwiceArea)) {
                largestRingTwiceArea = ringTwiceArea;
            }
        }
    }
    // With x east and y north, a positive signed area is an anticlockwise
    // ring, whose interior lies to the left of the direction of travel.
    const detectedWaterSide = largestRingTwiceArea > 0 ? 'left' : largestRingTwiceArea < 0 ? 'right' : null;
    // Phase 2. Work out where this tileset clips.
    const clipOffsets = dropTileEdges
        ? detectClipOffsets(offsetCounts, tileExtent, tileEdgeBand, tileEdgeMinCount, tileEdgeOffsets)
        : new Set();
    let maxClipOffset = 0;
    for (const offset of clipOffsets)
        maxClipOffset = Math.max(maxClipOffset, Math.abs(offset));
    // A tile's geometry stops at its clip line, and the neighbouring tile's
    // starts at its own clip line on the far side of the boundary, so the two
    // pieces finish two buffer widths apart. Allow a little extra for the two
    // tiles simplifying the same shore differently.
    const effectiveBridgeMeters = bridgeMeters === 'auto'
        ? maxClipOffset === 0
            ? 0
            : 2.5 * (maxClipOffset / tileExtent) * tileWidthMeters
        : bridgeMeters;
    // Phase 3. Drop clip edges, clip what is left to the circle, de-duplicate.
    const segments = []; // flat ax, ay, bx, by
    const startsOnClipLine = [];
    const endsOnClipLine = [];
    const seen = new Set();
    let droppedTileEdgeSegments = 0;
    let duplicateSegments = 0;
    const onClipLine = (offsets) => clipOffsets.has(offsets[0]) || clipOffsets.has(offsets[1]);
    for (const edge of raw) {
        if (edge.edgeOffset !== null && clipOffsets.has(edge.edgeOffset)) {
            droppedTileEdgeSegments++;
            continue;
        }
        const span = clipSegmentToCircle(edge.ax, edge.ay, edge.bx, edge.by, radiusMeters);
        if (!span)
            continue;
        const dx = edge.bx - edge.ax;
        const dy = edge.by - edge.ay;
        const cax = edge.ax + span[0] * dx;
        const cay = edge.ay + span[0] * dy;
        const cbx = edge.ax + span[1] * dx;
        const cby = edge.ay + span[1] * dy;
        const key = `${quantise(cax, DEDUPE_METERS)},${quantise(cay, DEDUPE_METERS)},` +
            `${quantise(cbx, DEDUPE_METERS)},${quantise(cby, DEDUPE_METERS)}`;
        if (seen.has(key)) {
            duplicateSegments++;
            continue;
        }
        seen.add(key);
        segments.push(cax, cay, cbx, cby);
        // An endpoint moved by the radius clip is no longer the tile's own
        // terminator, so it is not a seam we should try to bridge.
        startsOnClipLine.push(span[0] === 0 && onClipLine(edge.aOffsets));
        endsOnClipLine.push(span[1] === 1 && onClipLine(edge.bOffsets));
    }
    const { chains, bridged } = stitch(segments, snapMeters, {
        bridgeMeters: effectiveBridgeMeters,
        startsOnClipLine,
        endsOnClipLine
    });
    // Reversing a polyline swaps which side of it the water is on, so this is
    // all it takes to honour the requested side whatever the tileset did.
    const reversed = detectedWaterSide !== null && detectedWaterSide !== waterSide;
    const polylines = [];
    for (const points of chains) {
        const simplified = simplifyMeters > 0 ? simplifyPolyline(points, simplifyMeters) : points;
        if (simplified.length < 2)
            continue;
        const lengthMeters = polylineLength(simplified);
        if (lengthMeters < minLengthMeters)
            continue;
        const first = simplified[0];
        const last = simplified[simplified.length - 1];
        polylines.push({
            points: reversed ? simplified.slice().reverse() : simplified,
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
        waterSide,
        stats: {
            zoom,
            tileZoom: effectiveTileZoom,
            tileWidthMeters,
            sources: usedSources,
            featureCount: features.length,
            classes: [...seenClasses].filter(Boolean).sort(),
            segmentCount: segments.length / 4,
            droppedTileEdgeSegments,
            clipOffsets: [...clipOffsets].sort((a, b) => a - b),
            bridgeMeters: effectiveBridgeMeters,
            bridgedGaps: bridged,
            duplicateSegments,
            vertexCount: polylines.reduce((n, p) => n + p.points.length, 0),
            settled,
            detectedWaterSide,
            reversed
        }
    };
}
/** Every vector source id in the current style, in style order. */
export function vectorSourceIds(map) {
    let style;
    try {
        style = map.getStyle();
    }
    catch {
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
function inferTileZoom(map) {
    const base = Math.max(0, Math.floor(map.getZoom()));
    let maxzoom = 14;
    let minzoom = 0;
    for (const id of vectorSourceIds(map)) {
        const source = map.getSource(id);
        if (typeof source?.maxzoom === 'number')
            maxzoom = Math.min(maxzoom, source.maxzoom);
        if (typeof source?.minzoom === 'number')
            minzoom = Math.max(minzoom, source.minzoom);
    }
    return Math.min(Math.max(base, minzoom), maxzoom);
}
function* ringsOf(geometry) {
    if (!geometry)
        return;
    switch (geometry.type) {
        case 'Polygon':
            yield* geometry.coordinates;
            break;
        case 'MultiPolygon':
            for (const polygon of geometry.coordinates)
                yield* polygon;
            break;
        case 'LineString':
            yield geometry.coordinates;
            break;
        case 'MultiLineString':
            yield* geometry.coordinates;
            break;
        case 'GeometryCollection':
            for (const child of geometry.geometries)
                yield* ringsOf(child);
            break;
        default:
            break;
    }
}
function isFinitePair(p) {
    return p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}
function lonToTile(lon, scale) {
    return ((lon + 180) / 360) * scale;
}
function latToTile(lat, scale) {
    const clamped = Math.max(-85.0511287798, Math.min(85.0511287798, lat));
    const s = Math.sin(clamped * (Math.PI / 180));
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}
/** Distance from the nearest tile boundary, in `1 / extent` units. */
function boundaryOffset(coordinate, extent) {
    return Math.round((coordinate - Math.round(coordinate)) * extent);
}
/**
 * Work out which tile-space offsets are clip lines rather than coastline.
 *
 * A vector tile carries polygons clipped to its own bounds plus a buffer, so
 * every clipped polygon gains straight edges that are not real coastline.
 * Those edges share two properties: they are exactly axis-aligned on the tile
 * grid, and they all sit at the *same* distance from a tile boundary, because
 * one tileset uses one buffer width. OpenMapTiles clips at 64 units of 4096,
 * so its clip edges land at exactly -64 and +64 every time.
 *
 * Real coastline that happens to run exactly north-south lands at whatever
 * offset the shore happens to be at, so it does not repeat. Requiring an
 * offset to be shared by several segments is what separates the two, and it
 * works without knowing the tileset's buffer in advance.
 */
function detectClipOffsets(counts, extent, bandTiles, minCount, forced) {
    if (forced)
        return new Set(forced);
    const bandUnits = bandTiles * extent;
    const offsets = new Set();
    for (const [offset, count] of counts) {
        if (Math.abs(offset) > bandUnits)
            continue;
        if (count >= minCount)
            offsets.add(offset);
    }
    return offsets;
}
/** Conservative test for a segment that starts and ends outside the circle but cuts through it. */
function segmentCouldCrossCircle(ax, ay, bx, by, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0)
        return false;
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
function clipSegmentToCircle(ax, ay, bx, by, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a === 0)
        return null;
    const b = 2 * (ax * dx + ay * dy);
    const c = ax * ax + ay * ay - r * r;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return null;
    const root = Math.sqrt(discriminant);
    let t0 = (-b - root) / (2 * a);
    let t1 = (-b + root) / (2 * a);
    if (t1 <= 0 || t0 >= 1)
        return null;
    if (t0 < 0)
        t0 = 0;
    if (t1 > 1)
        t1 = 1;
    if (t1 <= t0)
        return null;
    return [t0, t1];
}
function quantise(value, step) {
    return Math.round(value / step);
}
function pointKey(x, y, snap) {
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
function stitch(flat, snap, options) {
    const count = flat.length / 4;
    if (count === 0)
        return { chains: [], bridged: 0 };
    const startIndex = new Map();
    const endIndex = new Map();
    for (let i = 0; i < count; i++) {
        push(startIndex, pointKey(flat[i * 4], flat[i * 4 + 1], snap), i);
        push(endIndex, pointKey(flat[i * 4 + 2], flat[i * 4 + 3], snap), i);
    }
    const used = new Uint8Array(count);
    const chains = [];
    for (let seed = 0; seed < count; seed++) {
        if (used[seed])
            continue;
        used[seed] = 1;
        const chain = [seed];
        // Walk backwards: find a segment whose end meets this chain's start.
        let head = seed;
        for (;;) {
            const key = pointKey(flat[head * 4], flat[head * 4 + 1], snap);
            const next = pickStraightest(endIndex.get(key), used, flat, head, 'backward');
            if (next === -1)
                break;
            used[next] = 1;
            chain.unshift(next);
            head = next;
        }
        // Walk forwards: find a segment whose start meets this chain's end.
        let tail = seed;
        for (;;) {
            const key = pointKey(flat[tail * 4 + 2], flat[tail * 4 + 3], snap);
            const next = pickStraightest(startIndex.get(key), used, flat, tail, 'forward');
            if (next === -1)
                break;
            used[next] = 1;
            chain.push(next);
            tail = next;
        }
        const points = [[flat[chain[0] * 4], flat[chain[0] * 4 + 1]]];
        for (const i of chain)
            points.push([flat[i * 4 + 2], flat[i * 4 + 3]]);
        chains.push({
            points,
            headSeam: options.startsOnClipLine[chain[0]] ?? false,
            tailSeam: options.endsOnClipLine[chain[chain.length - 1]] ?? false
        });
    }
    const bridged = options.bridgeMeters > 0 ? bridgeSeams(chains, options.bridgeMeters) : 0;
    return {
        // Chains absorbed by a bridge are left empty.
        chains: chains.filter((c) => c.points.length >= 2).map((c) => c.points),
        bridged
    };
}
/**
 * Join pieces separated by a tile seam.
 *
 * A seam is not a clean gap. Each tile's polygon is clipped at its own buffer
 * line, which lies *past* the shared boundary, so consecutive pieces usually
 * overlap by about two buffer widths rather than falling short of each other.
 * Worse, the two tiles simplify the same shore independently, so inside the
 * overlap their vertices disagree by a metre or two and never match exactly.
 *
 * So the join searches the tail of one piece and the head of the next for
 * their closest approach and splices there, dropping whichever overlap each
 * side contributed. A genuine gap is the degenerate case of the same search,
 * where the closest approach is the two endpoints themselves; that one also
 * has to pass a direction test, because a real gap could otherwise be joined
 * to something running the wrong way.
 *
 * Both ends must sit on a detected clip line, which is what keeps this safe:
 * a real break in the coast, such as a river mouth, does not end on a clip
 * line, so it is never joined.
 *
 * Mutates `chains` in place, emptying the pieces it absorbs, and returns the
 * number of joins made.
 */
function bridgeSeams(chains, maxDistance) {
    const MAX_TURN = Math.PI / 3; // 60 degrees
    // How far apart the two tiles' versions of the same shore may be at the
    // splice point. Their disagreement is a simplification artefact, so it is
    // a small fraction of the seam width.
    const spliceTolerance = Math.max(5, maxDistance * 0.15);
    let joins = 0;
    for (;;) {
        let best = null;
        for (let a = 0; a < chains.length; a++) {
            const from = chains[a];
            if (from.points.length < 2 || !from.tailSeam)
                continue;
            const tailStart = windowFromEnd(from.points, maxDistance);
            for (let b = 0; b < chains.length; b++) {
                if (a === b)
                    continue;
                const to = chains[b];
                if (to.points.length < 2 || !to.headSeam)
                    continue;
                const headEnd = windowFromStart(to.points, maxDistance);
                // Closest approach between the overlapping stretches. It has to be
                // segment to segment, not vertex to vertex: the two tiles place
                // their vertices in different spots, so two copies of the same
                // shore can run a few centimetres apart with no vertex in common.
                let bestI = -1;
                let bestJ = -1;
                let bestPoint = null;
                let bestDistance = Infinity;
                let bestTouching = false;
                const lastSegmentA = from.points.length - 2;
                const lastSegmentB = to.points.length - 2;
                for (let i = Math.min(tailStart, lastSegmentA); i <= lastSegmentA; i++) {
                    for (let j = 0; j <= Math.min(headEnd, lastSegmentB); j++) {
                        const closest = segmentClosestApproach(from.points[i], from.points[i + 1], to.points[j], to.points[j + 1]);
                        if (closest.distance >= bestDistance)
                            continue;
                        bestDistance = closest.distance;
                        bestI = i;
                        bestJ = j;
                        bestPoint = closest.point;
                        // The two pieces only touch at their own ends: a true gap
                        // rather than an overlap.
                        bestTouching = closest.s === 1 && closest.t === 0 && i === lastSegmentA && j === 0;
                    }
                }
                if (bestI === -1 || !bestPoint)
                    continue;
                if (bestTouching) {
                    if (bestDistance > maxDistance || bestDistance === 0)
                        continue;
                }
                else if (bestDistance > spliceTolerance) {
                    continue;
                }
                // The coast must carry on in the same direction across the join.
                const inDirection = direction(from.points[bestI], from.points[bestI + 1]);
                const outDirection = direction(to.points[bestJ], to.points[bestJ + 1]);
                if (Math.abs(normaliseAngle(outDirection - inDirection)) > MAX_TURN)
                    continue;
                if (bestTouching) {
                    const gapDirection = direction(from.points[bestI + 1], to.points[bestJ]);
                    if (Math.abs(normaliseAngle(gapDirection - inDirection)) > MAX_TURN)
                        continue;
                }
                if (!best || bestDistance < best.distance) {
                    best = { from: a, to: b, i: bestI, j: bestJ, point: bestPoint, distance: bestDistance };
                }
            }
        }
        if (!best)
            return joins;
        const from = chains[best.from];
        const to = chains[best.to];
        const joined = from.points.slice(0, best.i + 1);
        appendUnique(joined, best.point);
        for (const point of to.points.slice(best.j + 1))
            appendUnique(joined, point);
        from.points = joined;
        from.tailSeam = to.tailSeam;
        to.points = [];
        to.headSeam = false;
        to.tailSeam = false;
        joins++;
    }
}
function appendUnique(points, point) {
    const last = points[points.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 1e-6 && Math.abs(last[1] - point[1]) < 1e-6)
        return;
    points.push(point);
}
/**
 * Closest approach between two line segments, returning the parameters along
 * each and the midpoint of the closest pair. Standard clamped solution of the
 * two-parameter least-squares problem, with the degenerate cases handled.
 */
function segmentClosestApproach(p0, p1, q0, q1) {
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const vx = q1[0] - q0[0];
    const vy = q1[1] - q0[1];
    const wx = p0[0] - q0[0];
    const wy = p0[1] - q0[1];
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const denominator = a * c - b * b;
    let s;
    let t;
    if (a <= 1e-12 && c <= 1e-12) {
        s = 0;
        t = 0;
    }
    else if (a <= 1e-12) {
        s = 0;
        t = clamp01(e / c);
    }
    else if (c <= 1e-12) {
        t = 0;
        s = clamp01(-d / a);
    }
    else if (denominator <= 1e-12) {
        // Parallel. Pin one end and solve for the other.
        s = 0;
        t = clamp01(e / c);
    }
    else {
        s = clamp01((b * e - c * d) / denominator);
        t = clamp01((a * e - b * d) / denominator);
        // Re-solve each against the other after clamping, so a clamped corner
        // still lands on the true nearest point of the opposite segment.
        t = clamp01((b * s + e) / c);
        s = clamp01((b * t - d) / a);
    }
    const px = p0[0] + s * ux;
    const py = p0[1] + s * uy;
    const qx = q0[0] + t * vx;
    const qy = q0[1] + t * vy;
    return {
        s,
        t,
        distance: Math.hypot(qx - px, qy - py),
        point: [(px + qx) / 2, (py + qy) / 2]
    };
}
function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}
/** Index of the first vertex within `maxLength` of the polyline's end. */
function windowFromEnd(points, maxLength) {
    let accumulated = 0;
    let i = points.length - 1;
    while (i > 0) {
        accumulated += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        if (accumulated > maxLength)
            break;
        i--;
    }
    return i;
}
/** Index of the last vertex within `maxLength` of the polyline's start. */
function windowFromStart(points, maxLength) {
    let accumulated = 0;
    let j = 0;
    while (j < points.length - 1) {
        accumulated += Math.hypot(points[j + 1][0] - points[j][0], points[j + 1][1] - points[j][1]);
        if (accumulated > maxLength)
            break;
        j++;
    }
    return j;
}
function direction(a, b) {
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function push(index, key, value) {
    const bucket = index.get(key);
    if (bucket)
        bucket.push(value);
    else
        index.set(key, [value]);
}
function pickStraightest(candidates, used, flat, from, heading) {
    if (!candidates)
        return -1;
    const fdx = flat[from * 4 + 2] - flat[from * 4];
    const fdy = flat[from * 4 + 3] - flat[from * 4 + 1];
    const fromAngle = Math.atan2(fdy, fdx);
    let best = -1;
    let bestTurn = Infinity;
    for (const i of candidates) {
        if (used[i])
            continue;
        const dx = flat[i * 4 + 2] - flat[i * 4];
        const dy = flat[i * 4 + 3] - flat[i * 4 + 1];
        if (dx === 0 && dy === 0)
            continue;
        const angle = Math.atan2(dy, dx);
        const turn = Math.abs(normaliseAngle(heading === 'forward' ? angle - fromAngle : fromAngle - angle));
        if (turn < bestTurn) {
            bestTurn = turn;
            best = i;
        }
    }
    return best;
}
function normaliseAngle(a) {
    let angle = a;
    while (angle > Math.PI)
        angle -= 2 * Math.PI;
    while (angle < -Math.PI)
        angle += 2 * Math.PI;
    return angle;
}
