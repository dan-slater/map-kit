/**
 * Headless check of the demo page.
 *
 * Boots Chromium against a running `vite dev`, waits for the globe to load,
 * then runs `coastlineNear` at a set of coordinates and prints what came back.
 * The point is to prove the tile query really does turn a clicked coast into a
 * polyline, with numbers a reader can sanity-check.
 *
 *   bunx vite dev --host 127.0.0.1 --port 5180   # in another shell
 *   bun scripts/verify.mjs
 *
 * Options: --url, --shots <dir>, --keep-open
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const url = option('url', 'http://127.0.0.1:5180/');
const shotDir = option('shots', 'shots');

const PLACES = [
	{ id: 'jbay', name: 'J-Bay (point break, curved coast)', lon: 24.9338, lat: -34.0308 },
	{ id: 'nazare', name: 'Nazare (straight beach)', lon: -9.084, lat: 39.601 },
	{ id: 'mundaka', name: 'Mundaka (river mouth)', lon: -2.698, lat: 43.407 }
];

const browser = await chromium.launch({
	args: [
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--enable-unsafe-swiftshader',
		'--disable-dev-shm-usage'
	]
});

const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const consoleErrors = [];
page.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

await mkdir(shotDir, { recursive: true });

console.log(`opening ${url}`);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
await page.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 60_000 });
console.log('map loaded');
await page.screenshot({ path: `${shotDir}/01-globe.png` });

let failures = 0;

for (const place of PLACES) {
	const result = await page.evaluate(async ({ lon, lat }) => {
		const { map, coastlineNear, flyTo } = window.mapkit;
		await flyTo(map, { lon, lat, zoom: 14, duration: 0, essential: true });
		const coast = await coastlineNear(map, {
			lon,
			lat,
			radiusMeters: 2000,
			classes: ['ocean']
		});

		const summarise = (line) => {
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const [x, y] of line.points) {
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
			return {
				vertices: line.points.length,
				lengthMeters: Math.round(line.lengthMeters),
				spanEastMeters: Math.round(maxX - minX),
				spanNorthMeters: Math.round(maxY - minY),
				first: line.points[0].map((v) => Math.round(v)),
				last: line.points[line.points.length - 1].map((v) => Math.round(v)),
				closed: line.closed
			};
		};

		// Does the water really sit where coast.waterSide says? Step off each
		// segment and ask the water polygons, rather than trusting the label.
		// This is the check that caught the 0.1.0 documentation being the
		// wrong way round.
		//
		// The step is 5 m. It has to be smaller than the narrowest water or
		// land the coastline wraps around, or the probe lands on the far bank
		// and reports the wrong side: at Mundaka's estuary a 50 m step
		// disagrees on 6 of 131 segments and a 5 m step on none.
		const waterSideCheck = (() => {
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
			const inWater = (plon, plat) =>
				polygons.some(
					(rings) => rings.reduce((n, r) => n + (inRing(r, plon, plat) ? 1 : 0), 0) % 2 === 1
				);

			const line = coast.polylines[0];
			let sampled = 0;
			let agree = 0;
			for (let k = 1; k < line.points.length && sampled < 60; k++) {
				const a = line.points[k - 1];
				const b = line.points[k];
				const dx = b[0] - a[0];
				const dy = b[1] - a[1];
				const length = Math.hypot(dx, dy);
				if (length < 10) continue;
				const mx = (a[0] + b[0]) / 2;
				const my = (a[1] + b[1]) / 2;
				// Normal towards the side the result claims the water is on.
				const sign = coast.waterSide === 'right' ? 1 : -1;
				const nx = (sign * dy) / length;
				const ny = (-sign * dx) / length;
				const step = 5;
				const [wlon, wlat] = coast.frame.toLonLat(mx + nx * step, my + ny * step);
				const [olon, olat] = coast.frame.toLonLat(mx - nx * step, my - ny * step);
				sampled++;
				if (inWater(wlon, wlat) && !inWater(olon, olat)) agree++;
			}
			return { sampled, agree };
		})();

		return {
			stats: coast.stats,
			waterSide: coast.waterSide,
			waterSideCheck,
			count: coast.polylines.length,
			lines: coast.polylines.slice(0, 3).map(summarise),
			// Round-trip the first vertex through the frame to prove the inverse.
			roundTrip: coast.polylines[0]
				? (() => {
						const [x, y] = coast.polylines[0].points[0];
						const [backLon, backLat] = coast.frame.toLonLat(x, y);
						const [againX, againY] = coast.frame.toMeters(backLon, backLat);
						return { dx: againX - x, dy: againY - y };
					})()
				: null
		};
	}, place);

	console.log(`\n=== ${place.name} ===`);
	console.log(`  ${place.lat}, ${place.lon} at zoom 14, radius 2000 m`);
	console.log(
		`  tileZoom=${result.stats.tileZoom} settled=${result.stats.settled} ` +
			`features=${result.stats.featureCount} segments=${result.stats.segmentCount}`
	);
	console.log(
		`  edgeDrops=${result.stats.droppedTileEdgeSegments} ` +
			`clipOffsets=[${result.stats.clipOffsets.join(', ')}] ` +
			`duplicates=${result.stats.duplicateSegments} classes=[${result.stats.classes.join(', ')}]`
	);
	console.log(
		`  tileWidth=${Math.round(result.stats.tileWidthMeters)} m ` +
			`bridge=${result.stats.bridgeMeters.toFixed(1)} m ` +
			`bridgedGaps=${result.stats.bridgedGaps}`
	);
	console.log(
		`  waterSide=${result.waterSide} ` +
			`detected=${result.stats.detectedWaterSide} reversed=${result.stats.reversed}`
	);
	console.log(
		`  water verified on the ${result.waterSide} for ` +
			`${result.waterSideCheck.agree}/${result.waterSideCheck.sampled} sampled segments`
	);
	if (
		result.waterSideCheck.sampled < 10 ||
		result.waterSideCheck.agree !== result.waterSideCheck.sampled
	) {
		console.log('  FAIL: the water is not on the side the result claims');
		failures++;
	}
	console.log(`  polylines=${result.count} vertices=${result.stats.vertexCount}`);
	for (const [i, line] of result.lines.entries()) {
		console.log(
			`    [${i}] ${line.vertices} vertices, ${line.lengthMeters} m long, ` +
				`span ${line.spanEastMeters} x ${line.spanNorthMeters} m, ` +
				`${line.first} -> ${line.last}${line.closed ? ' (closed)' : ''}`
		);
	}
	if (result.roundTrip) {
		console.log(
			`  enuFrame round trip error: ${result.roundTrip.dx.toExponential(2)}, ` +
				`${result.roundTrip.dy.toExponential(2)} m`
		);
	}

	if (result.count === 0 || result.stats.vertexCount < 10) {
		console.log('  FAIL: no usable coastline');
		failures++;
	}

	await page.screenshot({ path: `${shotDir}/02-${place.id}.png` });
}

// Drive the UI the way a person would: select a pin and press the button.
console.log('\n=== demo UI ===');
await page.evaluate(() => window.mapkit.flyTo(window.mapkit.map, { lon: 12, lat: 10, zoom: 1.5, duration: 0 }));
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Jeffreys Bay' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shotDir}/03-panel.png` });
const panelTitle = await page.locator('.mk-panel__title').textContent();
console.log(`  panel title: ${panelTitle}`);

await page.getByRole('button', { name: /^Coastline within/ }).click();
await page.waitForFunction(
	() => document.querySelector('.stats') !== null,
	null,
	{ timeout: 60_000 }
);
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/04-coastline.png` });
const status = await page.locator('.status').textContent();
console.log(`  status: ${status?.trim()}`);

// Pan, and confirm the overlay crosshair tracks the pin rather than the screen.
const before = await page.evaluate(() => window.mapkit.map.project(
	[window.mapkit.spots[0].lon, window.mapkit.spots[0].lat]
));
await page.mouse.move(640, 430);
await page.mouse.down();
await page.mouse.move(460, 380, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);
const after = await page.evaluate(() => window.mapkit.map.project(
	[window.mapkit.spots[0].lon, window.mapkit.spots[0].lat]
));
console.log(
	`  pin screen position moved by ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)} px after a drag`
);
await page.screenshot({ path: `${shotDir}/05-panned.png` });

if (consoleErrors.length > 0) {
	console.log('\nconsole errors:');
	for (const error of consoleErrors.slice(0, 12)) console.log(`  ${error}`);
}

console.log(`\nscreenshots in ${shotDir}/`);
console.log(failures === 0 ? 'RESULT: pass' : `RESULT: ${failures} failure(s)`);

if (!args.includes('--keep-open')) await browser.close();
process.exit(failures === 0 ? 0 : 1);
