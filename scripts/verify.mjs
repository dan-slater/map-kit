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

		return {
			stats: coast.stats,
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
