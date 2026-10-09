/**
 * Why does a coastline chain break? Dumps every raw ring edge near a chosen
 * point in tangent-plane metres, with the tile-space offset coastlineNear uses
 * to decide whether it is a clip edge.
 *
 *   bun scripts/probe-gap.mjs
 */
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:5180/';
const PLACE = { name: 'Nazare', lon: -9.084, lat: 39.601 };
const NEAR = { x: -138, y: 491, radius: 180 };

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
await page.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 60_000 });

const out = await page.evaluate(
	async ({ place, near }) => {
		const { map, flyTo, enuFrame } = window.mapkit;
		await flyTo(map, { lon: place.lon, lat: place.lat, zoom: 14, duration: 0, essential: true });
		await new Promise((resolve) => (map.loaded() ? resolve() : map.once('idle', resolve)));

		const frame = enuFrame(place.lat, place.lon);
		const scale = 2 ** 14;
		const extent = 4096;
		const lonToTile = (l) => ((l + 180) / 360) * scale;
		const latToTile = (a) => {
			const s = Math.sin(a * (Math.PI / 180));
			return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
		};
		const boundaryOffset = (c) => Math.round((c - Math.round(c)) * extent);

		const rows = [];
		let ringIndex = 0;
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
				const rings =
					g.type === 'Polygon'
						? g.coordinates
						: g.type === 'MultiPolygon'
							? g.coordinates.flat()
							: [];
				for (const ring of rings) {
					ringIndex++;
					for (let i = 1; i < ring.length; i++) {
						const p0 = ring[i - 1];
						const p1 = ring[i];
						const [ax, ay] = frame.toMeters(p0[0], p0[1]);
						const [bx, by] = frame.toMeters(p1[0], p1[1]);
						const da = Math.hypot(ax - near.x, ay - near.y);
						const db = Math.hypot(bx - near.x, by - near.y);
						if (Math.min(da, db) > near.radius) continue;

						const u0 = lonToTile(p0[0]);
						const u1 = lonToTile(p1[0]);
						const v0 = latToTile(p0[1]);
						const v1 = latToTile(p1[1]);
						let offset = null;
						let axis = '-';
						if (Math.abs(u1 - u0) <= 0.5 / extent) {
							offset = boundaryOffset((u0 + u1) / 2);
							axis = 'u';
						} else if (Math.abs(v1 - v0) <= 0.5 / extent) {
							offset = boundaryOffset((v0 + v1) / 2);
							axis = 'v';
						}
						rows.push({
							ring: ringIndex,
							a: [Math.round(ax), Math.round(ay)],
							b: [Math.round(bx), Math.round(by)],
							len: Math.round(Math.hypot(bx - ax, by - ay)),
							axis,
							offset,
							tile: `${Math.floor(u0)}/${Math.floor(v0)}`
						});
					}
				}
			}
		}
		return rows;
	},
	{ place: PLACE, near: NEAR }
);

console.log(`edges within ${NEAR.radius} m of (${NEAR.x}, ${NEAR.y}) at ${PLACE.name}`);
console.log(' ring  tile          a              b            len axis offset  dropped?');
for (const r of out) {
	const dropped = r.offset === -64 || r.offset === 64 ? 'DROPPED' : '';
	console.log(
		`  ${String(r.ring).padStart(3)}  ${r.tile.padEnd(12)} ` +
			`${String(r.a).padEnd(14)} ${String(r.b).padEnd(14)} ` +
			`${String(r.len).padStart(4)}  ${r.axis}  ${String(r.offset ?? '').padStart(6)}  ${dropped}`
	);
}
console.log(`${out.length} edges`);

await browser.close();
