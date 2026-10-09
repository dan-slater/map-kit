/**
 * Which side of a coastlineNear polyline is the water actually on?
 *
 * Settles it by measurement, not by reading the vector-tile spec: steps 50 m
 * off each side of many segments and asks whether that point falls inside an
 * ocean polygon, using the same tile geometry the query read.
 *
 *   bun scripts/probe-winding.mjs
 */
import { chromium } from 'playwright';

const url = process.argv.includes('--url')
	? process.argv[process.argv.indexOf('--url') + 1]
	: 'http://127.0.0.1:5180/';

const PLACES = [
	{ name: 'J-Bay (ocean to the east)', lon: 24.9338, lat: -34.0308 },
	{ name: 'Nazare (ocean to the west)', lon: -9.084, lat: 39.601 },
	{ name: 'Bells Beach (ocean to the south)', lon: 144.28, lat: -38.37 },
	{ name: 'Mundaka (river mouth, narrow channels)', lon: -2.698, lat: 43.407 }
];

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
await page.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 60_000 });

for (const place of PLACES) {
	const out = await page.evaluate(async ({ lon, lat }) => {
		const { map, coastlineNear, flyTo } = window.mapkit;
		await flyTo(map, { lon, lat, zoom: 14, duration: 0, essential: true });
		const coast = await coastlineNear(map, {
			lon,
			lat,
			radiusMeters: 2000,
			classes: ['ocean']
		});
		const frame = coast.frame;

		// Every ocean polygon the tiles hold, as lists of rings in lon/lat.
		const polygons = [];
		for (const id of Object.keys(map.getStyle().sources)) {
			let features = [];
			try {
				features = map.querySourceFeatures(id, { sourceLayer: 'water' });
			} catch {
				continue;
			}
			for (const feature of features) {
				if (String(feature.properties?.class ?? '') !== 'ocean') continue;
				const g = feature.geometry;
				if (g.type === 'Polygon') polygons.push(g.coordinates);
				else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polygons.push(p);
			}
		}

		const inRing = (ring, x, y) => {
			let inside = false;
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const xi = ring[i][0];
				const yi = ring[i][1];
				const xj = ring[j][0];
				const yj = ring[j][1];
				if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
			}
			return inside;
		};
		// Even-odd within one polygon handles its holes; OR across polygons
		// handles the overlapping copies tile buffers leave behind.
		const inWater = (plon, plat) =>
			polygons.some((rings) => rings.reduce((n, r) => n + (inRing(r, plon, plat) ? 1 : 0), 0) % 2 === 1);

		const line = coast.polylines[0];
		let leftOnly = 0;
		let rightOnly = 0;
		let both = 0;
		let neither = 0;
		let sampled = 0;

		for (let k = 1; k < line.points.length && sampled < 60; k++) {
			const a = line.points[k - 1];
			const b = line.points[k];
			const dx = b[0] - a[0];
			const dy = b[1] - a[1];
			const length = Math.hypot(dx, dy);
			if (length < 10) continue;

			const mx = (a[0] + b[0]) / 2;
			const my = (a[1] + b[1]) / 2;
			// Left of the heading is the heading rotated 90 degrees
			// anticlockwise: (x, y) -> (-y, x), with x east and y north.
			const lx = -dy / length;
			const ly = dx / length;
			const d = 50;

			const [llon, llat] = frame.toLonLat(mx + lx * d, my + ly * d);
			const [rlon, rlat] = frame.toLonLat(mx - lx * d, my - ly * d);
			const left = inWater(llon, llat);
			const right = inWater(rlon, rlat);
			sampled++;
			if (left && !right) leftOnly++;
			else if (right && !left) rightOnly++;
			else if (left && right) both++;
			else neither++;
		}

		// Orientation of the biggest source ring, which is all but certainly an
		// exterior ring of the ocean polygon.
		let largest = 0;
		for (const rings of polygons) {
			for (const r of rings) {
				let twiceArea = 0;
				for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
					const [x1, y1] = frame.toMeters(r[j][0], r[j][1]);
					const [x2, y2] = frame.toMeters(r[i][0], r[i][1]);
					twiceArea += x1 * y2 - x2 * y1;
				}
				if (Math.abs(twiceArea) > Math.abs(largest)) largest = twiceArea;
			}
		}

		return {
			reported: coast.waterSide,
			polylines: coast.polylines.length,
			vertices: line.points.length,
			sampled,
			leftOnly,
			rightOnly,
			both,
			neither,
			largestRingSignedAreaKm2: largest / 2 / 1e6,
			firstPoint: line.points[0].map(Math.round),
			lastPoint: line.points[line.points.length - 1].map(Math.round)
		};
	}, place);

	console.log(`\n=== ${place.name} ===`);
	console.log(`  coastlineNear reports waterSide=${out.reported}`);
	console.log(`  longest polyline: ${out.vertices} vertices, ${out.firstPoint} -> ${out.lastPoint}`);
	console.log(`  sampled ${out.sampled} segments, 50 m off each side:`);
	console.log(`    water only on the LEFT  : ${out.leftOnly}`);
	console.log(`    water only on the RIGHT : ${out.rightOnly}`);
	console.log(`    water on both sides     : ${out.both}`);
	console.log(`    water on neither side   : ${out.neither}`);
	console.log(
		`  largest source ring signed area: ${out.largestRingSignedAreaKm2.toFixed(3)} km2 ` +
			`(${out.largestRingSignedAreaKm2 > 0 ? 'CCW, interior on the left' : 'CW, interior on the right'})`
	);
	const verdict = out.leftOnly > out.rightOnly ? 'LEFT' : out.rightOnly > out.leftOnly ? 'RIGHT' : 'inconclusive';
	console.log(`  VERDICT: water is on the ${verdict}`);
}

await browser.close();
