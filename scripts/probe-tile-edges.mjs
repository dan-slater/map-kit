/**
 * Diagnostic for the tile clip-edge filter in coastlineNear.
 *
 * It re-derives the raw segments in the browser and reports, for each
 * axis-aligned candidate, how long it is and how far it sits from a tile
 * boundary. The question it answers: can a length threshold separate a real
 * north-south coastline from a vector-tile clip edge?
 *
 *   bun scripts/probe-tile-edges.mjs
 */
import { chromium } from 'playwright';

const url = process.argv.includes('--url')
	? process.argv[process.argv.indexOf('--url') + 1]
	: 'http://127.0.0.1:5180/';

const PLACES = [
	{ name: 'J-Bay', lon: 24.9338, lat: -34.0308 },
	{ name: 'Nazare', lon: -9.084, lat: 39.601 },
	{ name: 'Mundaka', lon: -2.698, lat: 43.407 }
];

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
await page.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 60_000 });

for (const place of PLACES) {
	const report = await page.evaluate(async ({ lon, lat }) => {
		const { map, flyTo, enuFrame, coastlineNear } = window.mapkit;
		await flyTo(map, { lon, lat, zoom: 14, duration: 0, essential: true });
		await new Promise((resolve) => (map.loaded() ? resolve() : map.once('idle', resolve)));

		const frame = enuFrame(lat, lon);
		const z = 14;
		const scale = 2 ** z;
		const R = 2000;
		const lonToTile = (l) => ((l + 180) / 360) * scale;
		const latToTile = (a) => {
			const s = Math.sin(a * (Math.PI / 180));
			return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
		};

		const rings = [];
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
				if (g.type === 'Polygon') rings.push(...g.coordinates);
				else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(...p);
			}
		}

		const candidates = [];
		for (const ring of rings) {
			for (let i = 1; i < ring.length; i++) {
				const p0 = ring[i - 1];
				const p1 = ring[i];
				const [ax, ay] = frame.toMeters(p0[0], p0[1]);
				const [bx, by] = frame.toMeters(p1[0], p1[1]);
				// Only look at segments with an endpoint anywhere near the query.
				if (Math.hypot(ax, ay) > R * 2 && Math.hypot(bx, by) > R * 2) continue;

				const u0 = lonToTile(p0[0]);
				const u1 = lonToTile(p1[0]);
				const v0 = latToTile(p0[1]);
				const v1 = latToTile(p1[1]);
				const length = Math.hypot(bx - ax, by - ay);
				const axisU = Math.abs(u1 - u0) <= 1 / 4096;
				const axisV = Math.abs(v1 - v0) <= 1 / 4096;
				if (!axisU && !axisV) continue;

				const coord = axisU ? (u0 + u1) / 2 : (v0 + v1) / 2;
				const offset = coord - Math.round(coord);
				candidates.push({
					axis: axisU ? 'u' : 'v',
					lengthMeters: Math.round(length),
					offsetTiles: Number(offset.toFixed(5)),
					offsetUnits4096: Math.round(offset * 4096)
				});
			}
		}
		candidates.sort((a, b) => b.lengthMeters - a.lengthMeters);

		const withDrop = await coastlineNear(map, { lon, lat, radiusMeters: R, classes: ['ocean'] });
		const noDrop = await coastlineNear(map, {
			lon,
			lat,
			radiusMeters: R,
			classes: ['ocean'],
			dropTileEdges: false
		});

		return {
			candidates: candidates.slice(0, 24),
			total: candidates.length,
			withDrop: {
				n: withDrop.polylines.length,
				v: withDrop.stats.vertexCount,
				longest: Math.round(withDrop.polylines[0]?.lengthMeters ?? 0)
			},
			noDrop: {
				n: noDrop.polylines.length,
				v: noDrop.stats.vertexCount,
				longest: Math.round(noDrop.polylines[0]?.lengthMeters ?? 0)
			}
		};
	}, place);

	console.log(`\n=== ${place.name} ===`);
	console.log(
		`  dropTileEdges on : ${report.withDrop.n} polylines, ${report.withDrop.v} vertices, longest ${report.withDrop.longest} m`
	);
	console.log(
		`  dropTileEdges off: ${report.noDrop.n} polylines, ${report.noDrop.v} vertices, longest ${report.noDrop.longest} m`
	);
	console.log(`  axis-aligned candidates: ${report.total}`);
	console.log('   axis  length(m)  offset(tiles)  offset(/4096)');
	for (const c of report.candidates) {
		console.log(
			`     ${c.axis}  ${String(c.lengthMeters).padStart(8)}  ${String(c.offsetTiles).padStart(13)}  ${String(c.offsetUnits4096).padStart(13)}`
		);
	}
}

await browser.close();
