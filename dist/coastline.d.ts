import type { FilterSpecification, GeoJSONFeature, Map as MapLibreMap } from 'maplibre-gl';
import { type EnuFrame, type Meters } from './geo.js';
export type CoastlinePolyline = {
    /**
     * Vertices in tangent-plane metres about the query point: `[xEast, yNorth]`.
     * Walking the polyline from index 0, water lies to the side named by
     * {@link CoastlineResult.waterSide}, which defaults to the right.
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
    /** Ground width of one tile at the query latitude, metres. */
    tileWidthMeters: number;
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
    /** The clip-line offsets detected, in `1 / tileExtent` units. OpenMapTiles gives `[-64, 64]`. */
    clipOffsets: number[];
    /** Distance used when joining pieces across a tile boundary, metres. */
    bridgeMeters: number;
    /** How many tile-boundary gaps were bridged. */
    bridgedGaps: number;
    /** Segments discarded as duplicates from overlapping tile buffers. */
    duplicateSegments: number;
    /** Total vertices across all returned polylines. */
    vertexCount: number;
    /** `false` when the map had not finished loading tiles before the query ran. */
    settled: boolean;
    /**
     * The side the water fell on in the source tiles, before any reversal.
     * `null` when there was no closed ring to measure, which happens if the
     * source layer holds lines rather than polygons.
     *
     * OpenFreeMap gives `'right'`. If this ever reads `'left'` for
     * OpenFreeMap, the tileset's winding has changed and the output was
     * reversed to compensate, which is exactly what it is here for.
     */
    detectedWaterSide: WaterSide | null;
    /** `true` when the polylines were reversed to satisfy the requested side. */
    reversed: boolean;
};
export type CoastlineResult = {
    /** The query point. */
    origin: {
        lon: number;
        lat: number;
    };
    /** The tangent plane the points are expressed in. Use it to go back to lon/lat. */
    frame: EnuFrame;
    /** The radius the result was clipped to, metres. */
    radiusMeters: number;
    /** Polylines, longest first. */
    polylines: CoastlinePolyline[];
    /**
     * Which side of the direction of travel the water is on. This is a
     * guarantee, not an observation: polylines are reversed when they need to
     * be so the answer always matches the `waterSide` option, which defaults
     * to `'right'`.
     */
    waterSide: WaterSide;
    stats: CoastlineStats;
};
/** Which side of a polyline's direction of travel the water sits on. */
export type WaterSide = 'left' | 'right';
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
    /**
     * Which side of each polyline's direction of travel the water must end up
     * on. Default `'right'`, which is the side OpenFreeMap's own winding
     * produces, so the default costs nothing. Ask for `'left'` and every
     * polyline is reversed to suit.
     */
    waterSide?: WaterSide;
    /** Drop segments lying along a vector-tile clip edge. Default `true`. */
    dropTileEdges?: boolean;
    /** How far from a tile boundary a clip edge may sit, in tile units. Default 0.1. */
    tileEdgeBand?: number;
    /** How many segments must share an offset before it counts as a clip line. Default 3. */
    tileEdgeMinCount?: number;
    /**
     * Skip the detection and use these clip offsets, in units of `1 / tileExtent`
     * from the nearest tile boundary. OpenMapTiles buffers by 64, so `[-64, 64]`.
     */
    tileEdgeOffsets?: number[];
    /**
     * How far apart two pieces may be and still be joined across a tile
     * boundary. `'auto'` (the default) derives it from the detected buffer
     * width, which is the size of the gap the buffer creates. `0` disables
     * bridging. See "Tile seams" in the notes below.
     */
    bridgeMeters?: number | 'auto';
    /** Vector-tile coordinate extent, used to size the axis-alignment test. Default 4096. */
    tileExtent?: number;
    /** Override the tile zoom used by the clip-edge test. Default: inferred from the camera. */
    tileZoom?: number;
    /** Wait for the map to go idle before querying. Default `true`. Leave it on. */
    wait?: boolean;
    /** How long to wait for idle before querying anyway. Default 10000 ms. */
    timeoutMs?: number;
};
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
export declare function coastlineNear(map: MapLibreMap, options: CoastlineNearOptions): Promise<CoastlineResult>;
/** Every vector source id in the current style, in style order. */
export declare function vectorSourceIds(map: MapLibreMap): string[];
