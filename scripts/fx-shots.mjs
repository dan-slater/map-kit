/**
 * Screenshots of the globe effects on the ink theme.
 *
 * Writes docs/img/themes/ink-fx-<name>.png. The demo reads `?fx=` so each shot
 * is just a URL.
 *
 *   bunx vite dev --host 127.0.0.1 --port 5180   # in another shell
 *   bun scripts/fx-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const baseUrl = option('url', 'http://127.0.0.1:5180/');
const outDir = option('out', 'docs/img/themes');
const width = Number(option('width', '1280'));
const height = Number(option('height', '860'));

const SHOTS = [
	{
		id: 'glow',
		fx: 'glow,stars',
		label: 'atmosphere rim glow over a star field',
		lon: -28,
		lat: 20,
		zoom: 1.9
	},
	{
		id: 'graticule',
		fx: 'glow,stars,graticule',
		label: 'graticule added, fading out as you zoom in',
		lon: 10,
		lat: 15,
		zoom: 2.0
	},
	{
		id: 'rotate',
		fx: 'glow,stars,graticule,rotate',
		label: 'everything on, caught mid auto-rotate',
		lon: 60,
		lat: 10,
		zoom: 1.7,
		settle: 9000
	}
];

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
await mkdir(outDir, { recursive: true });

let failures = 0;

for (const shot of SHOTS) {
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));

	const url = `${new URL(`/?theme=ink&fx=${shot.fx}`, baseUrl).href}`;
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
	await page.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 60_000 });

	await page.evaluate(
		({ lon, lat, zoom }) =>
			window.mapkit.flyTo(window.mapkit.map, { lon, lat, zoom, duration: 0, essential: true }),
		shot
	);
	await page
		.waitForFunction(() => window.mapkit.map.loaded(), null, { timeout: 30_000 })
		.catch(() => {});
	// Long enough for tiles, labels, and for auto-rotate to have started.
	await page.waitForTimeout(shot.settle ?? 4500);

	const path = `${outDir}/ink-fx-${shot.id}.png`;
	await page.screenshot({ path });
	const size = (await stat(path)).size;
	console.log(`ink-fx-${shot.id}  ${(size / 1024).toFixed(0).padStart(4)} KB  ${shot.label}`);
	if (size > 400 * 1024) {
		console.log('  over the 400 KB budget');
		failures++;
	}
	if (errors.length > 0) console.log(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
	await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nall within the 400 KB budget' : `\n${failures} over budget`);
process.exit(failures === 0 ? 0 : 1);
