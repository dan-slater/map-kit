/**
 * Render every basemap theme at three views and write them to docs/img/themes.
 *
 * Uses Playwright's own Chromium with the software rasteriser, which is slower
 * than the GPU path but is the one that actually composites into a screenshot
 * on this box. See scripts/verify-webgpu.ts for why the GPU path cannot be
 * screenshotted here.
 *
 *   bunx vite dev --host 127.0.0.1 --port 5180   # in another shell
 *   bun scripts/shots.mjs
 *
 * Options: --url, --out <dir>, --themes ink,paper, --width, --height
 */
import { chromium } from 'playwright';
import { mkdir, readdir, stat } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const baseUrl = option('url', 'http://127.0.0.1:5180/');
const outDir = option('out', 'docs/img/themes');
const width = Number(option('width', '1280'));
const height = Number(option('height', '860'));
const only = option('themes', '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

const THEMES = only.length > 0 ? only : ['ink', 'paper', 'chart', 'mono'];

/** The three views Daniel asked for. */
const VIEWS = [
	{
		id: 'globe',
		label: 'globe from space over the Atlantic',
		async go(page) {
			await page.evaluate(() =>
				window.mapkit.flyTo(window.mapkit.map, {
					lon: -28,
					lat: 20,
					zoom: 1.9,
					duration: 0,
					essential: true
				})
			);
			await settle(page, 4000);
		}
	},
	{
		id: 'region',
		label: 'J-Bay at zoom 11',
		async go(page) {
			await page.evaluate(() =>
				window.mapkit.flyTo(window.mapkit.map, {
					lon: 24.9338,
					lat: -34.0308,
					zoom: 11,
					duration: 0,
					essential: true
				})
			);
			await settle(page, 4000);
		}
	},
	{
		id: 'coastline',
		label: 'J-Bay at zoom 14 with the coastline drawn',
		async go(page) {
			// Select the pin through the UI so the panel and overlay are live,
			// then run the real query.
			await page.getByRole('button', { name: 'Jeffreys Bay' }).click();
			await page.waitForTimeout(2200);
			await page.getByRole('button', { name: /^Coastline within/ }).click();
			await page.waitForFunction(() => document.querySelector('.stats') !== null, null, {
				timeout: 60_000
			});
			await settle(page, 1500);
		}
	}
];

/** Wait for tiles, then a beat for label placement to finish. */
async function settle(page, extra) {
	await page
		.waitForFunction(() => window.mapkit?.map?.loaded(), null, { timeout: 30_000 })
		.catch(() => {});
	await page.waitForTimeout(extra);
}

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

await mkdir(outDir, { recursive: true });
const written = [];

for (const theme of THEMES) {
	for (const view of VIEWS) {
		const page = await browser.newPage({
			viewport: { width, height },
			deviceScaleFactor: 1
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto(`${new URL(`/?theme=${theme}`, baseUrl).href}`, { waitUntil: 'load' });
		await page.waitForFunction(() => Boolean(window.mapkit?.map), null, { timeout: 60_000 });
		await settle(page, 2500);

		await view.go(page);

		const path = `${outDir}/${theme}-${view.id}.png`;
		await page.screenshot({ path });
		const size = (await stat(path)).size;
		written.push({ path, size });
		console.log(
			`${theme.padEnd(6)} ${view.id.padEnd(10)} ${(size / 1024).toFixed(0).padStart(4)} KB  ${view.label}`
		);
		if (errors.length > 0) console.log(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
		await page.close();
	}
}

await browser.close();

const oversized = written.filter((f) => f.size > 400 * 1024);
console.log(`\n${written.length} images in ${outDir}/`);
if (oversized.length > 0) {
	console.log('over the 400 KB budget:');
	for (const file of oversized) console.log(`  ${file.path} ${(file.size / 1024).toFixed(0)} KB`);
	console.log('Re-run with a smaller --width/--height, or compress before committing.');
	process.exit(1);
}
console.log('all within the 400 KB budget');

const listing = await readdir(outDir);
console.log(listing.sort().join('\n'));
