# `coastlineNear`

Turn the water polygons the map already has in memory into coastline polylines
around a point, in metres.

```ts
import { flyTo, coastlineNear } from '@dan-slater/map-kit';

await flyTo(map, { lon: 24.9338, lat: -34.0308, zoom: 14, duration: 0 });
const coast = await coastlineNear(map, {
	lon: 24.9338,
	lat: -34.0308,
	radiusMeters: 2000,
	classes: ['ocean']
});

coast.polylines[0].points; // [[xEast, yNorth], ...] in metres
coast.frame.toLonLat(x, y); // back to geography
```

No network call of its own: it reads the vector tiles the browser has already
fetched for the current camera. That makes it fast and keyless, and it also
means the answer depends entirely on where the camera is.

## Pick the zoom first

OpenMapTiles generalises water geometry per zoom level, and the tiles in memory
are the tiles for the current camera.

| Zoom | What you get |
| --- | --- |
| below 10 | Heavily generalised. A bay reads as a straight line. Not useful. |
| 11 to 12 | Recognisable shape, vertices tens to hundreds of metres apart. |
| 13 to 15 | The useful band. Vertices a few metres to a few tens of metres apart. |

Zoom 14 is the deepest zoom OpenFreeMap serves for this layer, so 14 and 15
return identical geometry. **Zoom 14 is the right default.** Fly there, let the
tiles land, then query:

```ts
await flyTo(map, { lon, lat, zoom: 14, duration: 0 });
const coast = await coastlineNear(map, { lon, lat, radiusMeters: 2000 });
```

`coastlineNear` waits for the map to go idle before reading, so you do not have
to sleep. `stats.settled` is `false` if it gave up waiting, which means the
result may be missing tiles.

Keep the radius inside the viewport. Only loaded tiles are visible to the
query, so a 10 km radius on a viewport showing 3 km returns the middle 3 km and
nothing else.

## Direction carries meaning

Walking a polyline from index 0, **water is on the left and land on the
right.** OpenMapTiles follows the OGC winding convention, and this function
never reverses a segment, so the winding survives into the output. That is how
you work out which way the sea faces without a second query:

```ts
// Outward normal of the shore at vertex i, pointing into the water.
const [x0, y0] = line.points[i];
const [x1, y1] = line.points[i + 1];
const length = Math.hypot(x1 - x0, y1 - y0);
const seaward = [-(y1 - y0) / length, (x1 - x0) / length];
```

`result.waterSide` states this in the return value so the assumption is visible
in code rather than only in a doc.

## Measured output

From the headless check in `scripts/verify.mjs`, all at zoom 14 with a 2000 m
radius and `classes: ['ocean']`:

| Place | Polylines | Longest | Vertices in it | Span |
| --- | --- | --- | --- | --- |
| J-Bay, South Africa (point break) | 3 | 4332 m | 133 | 641 x 3874 m |
| Nazaré, Portugal (straight beach, harbour) | 19 | 2894 m | 58 | 988 x 2081 m |
| Mundaka, Spain (river mouth) | 7 | 4562 m | 145 | 1736 x 1725 m |

J-Bay comes back as one polyline covering the whole shoreline inside the
radius. Nazaré fragments more because a 2 km circle there contains breakwaters,
a harbour mouth and a river, which really are separate pieces of water
boundary. Sort by `lengthMeters` (the result already is) and take what you
need.

## Tile seams

This is the part that makes the implementation non-trivial, and it is worth
understanding because it explains the options.

Vector tiles clip every polygon to the tile bounds plus a buffer. That gives
each clipped polygon straight edges that are not coastline at all, running
along the clip line. Left in, they produce a coastline with long straight walls
through the sea.

They are detectable. A clip edge is exactly axis-aligned on the tile's integer
grid, *and* it sits at exactly the same distance from a tile boundary as every
other clip edge in the tileset, because one tileset uses one buffer width.
Measured against OpenFreeMap, every clip edge lands at exactly ±64 units of
4096, while genuinely north-south coastline lands at arbitrary offsets
(-297, -941, +998, and so on). So `coastlineNear` tallies the offsets of all
axis-aligned edges and treats the ones shared by at least `tileEdgeMinCount`
segments as clip lines. No magic constant, and it adapts to a tileset with a
different buffer. The detected values come back in `stats.clipOffsets`.

Removing the clip edges leaves a second problem. Each tile's piece of coast now
ends on that tile's own clip line, and neighbouring tiles clip on opposite
sides of the shared boundary, so consecutive pieces **overlap** by about two
buffer widths, roughly 60 m at zoom 14. On top of that, the two tiles simplify
the same stretch of shore independently, so inside the overlap their vertices
disagree by a metre or two and never line up exactly.

So the pieces are rejoined by searching the tail of one and the head of the
next for their closest approach, segment to segment rather than vertex to
vertex, and splicing there. Both ends must sit on a detected clip line, which
is what stops a real break such as a river mouth from being joined up.
`stats.bridgedGaps` counts the joins; `bridgeMeters: 0` turns the whole thing
off if you would rather see the raw pieces.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `lon`, `lat` | required | Centre of the query. |
| `radiusMeters` | required | Clip the result to this distance from the centre. |
| `sourceLayer` | `'water'` | The OpenMapTiles layer name. |
| `sources` | every vector source | Which style sources to read. |
| `filter` | none | MapLibre filter passed to `querySourceFeatures`. |
| `classes` | none | Keep only these `properties.class` values, e.g. `['ocean']`. |
| `where` | none | Arbitrary predicate over each feature. |
| `simplifyMeters` | `0` | Ramer-Douglas-Peucker tolerance applied per polyline. |
| `snapMeters` | `0.5` | Vertices this close count as the same point when chaining. |
| `minLengthMeters` | `0` | Drop polylines shorter than this. |
| `dropTileEdges` | `true` | Remove vector-tile clip edges. |
| `tileEdgeBand` | `0.1` | How far from a boundary, in tiles, a clip line may sit. |
| `tileEdgeMinCount` | `3` | Segments that must share an offset for it to count. |
| `tileEdgeOffsets` | detected | Force the clip offsets, e.g. `[-64, 64]`. |
| `bridgeMeters` | `'auto'` | Seam-joining distance. `'auto'` derives it from the buffer. |
| `tileExtent` | `4096` | Vector-tile coordinate extent. |
| `tileZoom` | inferred | Override the tile zoom used by the clip-line test. |
| `wait` | `true` | Wait for the map to go idle before reading. |
| `timeoutMs` | `10000` | How long to wait for idle. |

## Reading the stats

```ts
coast.stats;
// {
//   zoom: 14, tileZoom: 14, tileWidthMeters: 2027,
//   sources: ['openmaptiles'],
//   featureCount: 9,
//   classes: ['lake', 'ocean', 'pond', 'river', 'swimming_pool'],
//   segmentCount: 136,
//   droppedTileEdgeSegments: 14, clipOffsets: [-64, 64],
//   bridgeMeters: 79.2, bridgedGaps: 1,
//   duplicateSegments: 4,
//   vertexCount: 137,
//   settled: true
// }
```

`classes` lists every class seen *before* the `classes` filter was applied, so
it tells you what is there when a query comes back empty.

Signs something is off:

- `settled: false` — the map had not finished loading. Tiles may be missing.
- `clipOffsets: []` with `dropTileEdges: true` — detection found nothing, so
  clip edges are still in the output. Either the tileset is unbuffered or there
  were too few samples. Pass `tileEdgeOffsets: [-64, 64]` to force it.
- `polylines: []` with a non-empty `classes` list — your `classes` filter
  excluded everything. Check the list.
- A polyline with a suspiciously straight multi-kilometre run — a clip edge got
  through. Compare against `dropTileEdges: false` to see the difference.

## Drawing the result

Back to GeoJSON for a `<Layer>`:

```svelte
<script lang="ts">
  import { Layer, linesFromMeters } from '@dan-slater/map-kit';
  let coast = $state(null);
</script>

{#if coast}
  <Layer
    id="coast"
    data={linesFromMeters(coast.polylines, coast.frame)}
    layer={{ type: 'line', paint: { 'line-color': '#e3663e', 'line-width': 2 } }}
  />
{/if}
```

Or straight onto an `<Overlay>` canvas, which is what a simulation wants. See
[docs/overlay.md](./overlay.md).
