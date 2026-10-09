/**
 * Prove the `<Overlay mode="webgpu">` path on real hardware.
 *
 * Playwright's own launcher does not expose a GPU adapter on this kind of box,
 * so Chrome is spawned directly in new headless mode with the Vulkan flags and
 * attached over CDP. The approach is borrowed from surf-lab's
 * scripts/browser.ts, which solved the same problem first.
 *
 *   bunx vite dev --host 127.0.0.1 --port 5180   # in another shell
 *   bun scripts/verify-webgpu.ts
 *
 * Evidence comes from reading pixels back off the GPU with copyTextureToBuffer,
 * not from screenshots. Under these flags headless Chrome composites the GPU
 * layers somewhere the screenshotter cannot see, so the PNGs this writes show
 * the HUD over a blank page even when the canvas is rendering correctly. The
 * readback is the stronger proof anyway: it reads the actual render target.
 *
 * Options:
 *   --url <url>      dev server (default http://127.0.0.1:5180/)
 *   --shots <dir>    screenshot directory
 *   --swiftshader    use the CPU adapter instead, for comparison
 *   --no-warm        skip the warm-up page and land on /webgpu cold, which is
 *                    what exercises <Overlay>'s own adapter retry
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const baseUrl = option('url', 'http://127.0.0.1:5180/');
const shotDir = option('shots', 'shots');
const useSwiftshader = args.includes('--swiftshader');
const skipWarm = args.includes('--no-warm');

// Every one of these is load-bearing. Dropping --disable-vulkan-surface makes
// requestAdapter never resolve an adapter at all on this box.
const GPU_FLAGS = [
	'--enable-unsafe-webgpu',
	'--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
	'--use-angle=vulkan',
	'--use-vulkan=native',
	'--disable-vulkan-surface',
	'--ignore-gpu-blocklist'
];
const SWIFTSHADER_FLAGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];

function chromiumPath(): string {
	if (process.env.CHROMIUM) return process.env.CHROMIUM;
	const root = `${homedir()}/.cache/ms-playwright`;
	const dirs = readdirSync(root)
		.filter((d) => /^chromium-\d+$/.test(d))
		.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
	if (dirs.length === 0) {
		throw new Error('no Playwright Chromium; run: bun node_modules/playwright/cli.js install chromium');
	}
	return `${root}/${dirs[dirs.length - 1]}/chrome-linux64/chrome`;
}

async function launch(): Promise<{ browser: Browser; kill: () => void }> {
	const flags = useSwiftshader ? SWIFTSHADER_FLAGS : GPU_FLAGS;
	const profile = mkdtempSync(`${tmpdir()}/mapkit-chrome-`);
	const proc = spawn(
		chromiumPath(),
		[
			'--headless=new',
			'--no-sandbox',
			'--no-first-run',
			'--remote-debugging-port=0',
			`--user-data-dir=${profile}`,
			...flags,
			'about:blank'
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);

	const endpoint = await new Promise<string>((resolve, reject) => {
		let buffered = '';
		const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${buffered}`)), 20_000);
		proc.stderr!.on('data', (chunk: Buffer) => {
			buffered += chunk.toString();
			const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
			if (match) {
				clearTimeout(timer);
				resolve(match[1]);
			}
		});
		proc.on('exit', (code) => reject(new Error(`Chrome exited (${code}):\n${buffered}`)));
	});

	const browser = await chromium.connectOverCDP(endpoint);
	return { browser, kill: () => proc.kill('SIGKILL') };
}

/** The first requestAdapter in a fresh headless Chrome returns null. Wake it up. */
async function warmGpu(page: Page): Promise<{ attempts: number; ok: boolean }> {
	return page.evaluate(async () => {
		for (let attempt = 1; attempt <= 12; attempt++) {
			const adapter = await navigator.gpu?.requestAdapter();
			if (adapter) return { attempts: attempt, ok: true };
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
		return { attempts: 12, ok: false };
	});
}

let failures = 0;
const check = (name: string, pass: boolean, detail = '') => {
	console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
	if (!pass) failures++;
};

const { browser, kill } = await launch();
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.setViewportSize({ width: 1100, height: 760 });
await mkdir(shotDir, { recursive: true });

const consoleErrors: string[] = [];
page.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
	console.log(`adapter mode: ${useSwiftshader ? 'swiftshader (CPU)' : 'vulkan (GPU)'}`);
	console.log(`chromium: ${chromiumPath()}`);

	if (skipWarm) {
		console.log('\nGPU warm-up: skipped, so <Overlay> has to retry the adapter itself');
	} else {
		await page.goto(new URL('/', baseUrl).href, { waitUntil: 'load' });
		const warm = await warmGpu(page);
		console.log(
			`\nGPU warm-up: adapter on attempt ${warm.attempts}${warm.ok ? '' : ' (never arrived)'}`
		);
	}

	await page.goto(new URL('/webgpu', baseUrl).href, { waitUntil: 'load' });
	await page.waitForFunction(() => Boolean((window as any).mapkitGpu), null, { timeout: 60_000 });
	await page.waitForFunction(() => (window as any).mapkitGpu.status !== 'starting', null, {
		timeout: 60_000
	});

	const status = await page.evaluate(() => (window as any).mapkitGpu.status);
	console.log(`\n=== device ===`);
	check('overlay reached ready', status === 'ready', status);

	const device = await page.evaluate(() => {
		const d = (window as any).mapkitGpu.device;
		if (!d) return null;
		return {
			ctor: Object.prototype.toString.call(d),
			className: d.constructor?.name,
			hasCreateBuffer: typeof d.createBuffer === 'function',
			hasQueue: typeof d.queue?.submit === 'function',
			maxTextureDimension2D: d.limits?.maxTextureDimension2D ?? 0,
			maxBufferSize: d.limits?.maxBufferSize ?? 0,
			features: [...(d.features ?? [])].slice(0, 6),
			lostIsPending: d.lost instanceof Promise
		};
	});

	check('frame.gpu.device exists', device !== null);
	if (device) {
		check('is a GPUDevice', device.className === 'GPUDevice', device.ctor);
		check('has a working queue', device.hasQueue && device.hasCreateBuffer);
		check('reports real limits', device.maxTextureDimension2D >= 8192, `maxTextureDimension2D=${device.maxTextureDimension2D}`);
		console.log(`        maxBufferSize=${device.maxBufferSize}`);
		console.log(`        features=[${device.features.join(', ')}]`);
	}

	const adapterInfo = await page.evaluate(() => (window as any).mapkitGpu.adapterInfo);
	const format = await page.evaluate(() => (window as any).mapkitGpu.format);
	const attempts = await page.evaluate(() => (window as any).mapkitGpu.adapterAttempts);
	console.log(`        adapter: ${adapterInfo || '(not reported)'}`);
	console.log(`        canvas format: ${format}`);
	console.log(`        requestAdapter attempts inside <Overlay>: ${attempts}`);
	check('an adapter was obtained', attempts >= 1 && status === 'ready');
	if (!useSwiftshader) {
		check(
			'not falling back to the CPU adapter',
			!/swiftshader|llvmpipe|lavapipe/i.test(adapterInfo ?? ''),
			adapterInfo
		);
	}

	// A compute dispatch is the strongest proof the device really executes work.
	console.log(`\n=== compute dispatch ===`);
	const compute = await page.evaluate(async () => {
		const device: GPUDevice = (window as any).mapkitGpu.device;
		const module = device.createShaderModule({
			code: `
				@group(0) @binding(0) var<storage, read_write> data: array<u32>;
				@compute @workgroup_size(64)
				fn main(@builtin(global_invocation_id) id: vec3u) {
					if (id.x < 256u) { data[id.x] = id.x * id.x; }
				}
			`
		});
		const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
		const storage = device.createBuffer({
			size: 1024,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
		const staging = device.createBuffer({
			size: 1024,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: storage } }]
		});

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(4);
		pass.end();
		encoder.copyBufferToBuffer(storage, 0, staging, 0, 1024);
		device.queue.submit([encoder.finish()]);

		await staging.mapAsync(GPUMapMode.READ);
		const out = Array.from(new Uint32Array(staging.getMappedRange().slice(0)));
		staging.unmap();
		return [out[7], out[64], out[255]];
	});
	check('compute shader produced the right values', JSON.stringify(compute) === JSON.stringify([49, 4096, 65025]), `got ${JSON.stringify(compute)}`);

	// Read the rendered canvas back off the GPU.
	console.log(`\n=== render ===`);
	const render = await page.evaluate(async () => {
		const api = (window as any).mapkitGpu;
		const frame = api.frame;
		const ratio = frame.pixelRatio;
		const projected = frame.project(api.target.lon, api.target.lat);

		// A corner, far from the ring: should be the clear colour alone.
		const corner = await api.readPixel(4, 4);
		// On the ring: the shader draws a band between 46 and 58 device pixels.
		const onRing = await api.readPixel(projected.x * ratio + 52, projected.y * ratio);
		// Inside the ring: clear colour again.
		const inside = await api.readPixel(projected.x * ratio, projected.y * ratio);

		return {
			corner,
			onRing,
			inside,
			format: api.format,
			pixelRatio: ratio,
			canvas: [frame.canvas.width, frame.canvas.height],
			css: [frame.width, frame.height]
		};
	});

	// The preferred canvas format on Linux is bgra8unorm, so bytes arrive as B,G,R,A.
	const isBgra = String(render.format).startsWith('bgra');
	const toRgb = (bytes: number[]) => (isBgra ? [bytes[2], bytes[1], bytes[0]] : [bytes[0], bytes[1], bytes[2]]);
	// The clear colour is given in linear-ish sRGB values; 0.04/0.09/0.18 of 255.
	const expectedClear = [Math.round(0.04 * 255), Math.round(0.09 * 255), Math.round(0.18 * 255)];
	const near = (a: number[], b: number[], tolerance = 3) =>
		a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

	console.log(`        canvas ${render.canvas[0]}x${render.canvas[1]} device px, ${render.css[0]}x${render.css[1]} css px at ratio ${render.pixelRatio}`);
	console.log(`        corner  rgb=${toRgb(render.corner)} raw=${render.corner}`);
	console.log(`        on ring rgb=${toRgb(render.onRing)} raw=${render.onRing}`);
	console.log(`        inside  rgb=${toRgb(render.inside)} raw=${render.inside}`);

	check('canvas backing store matches css size times pixel ratio',
		render.canvas[0] === Math.round(render.css[0] * render.pixelRatio));
	check('cleared to the requested colour', near(toRgb(render.corner), expectedClear), `expected ${expectedClear}`);
	check('inside the ring is still the clear colour', near(toRgb(render.inside), expectedClear));
	check('the ring was drawn', !near(toRgb(render.onRing), expectedClear, 8));
	check('the ring is the shader colour', toRgb(render.onRing)[2] > toRgb(render.onRing)[0] + 40);

	await page.screenshot({ path: `${shotDir}/06-webgpu.png` });

	// Registration: pan, and the ring must follow the coordinate.
	console.log(`\n=== registration ===`);
	const before = await page.evaluate(() => {
		const api = (window as any).mapkitGpu;
		return api.frame.project(api.target.lon, api.target.lat);
	});
	await page.mouse.move(550, 400);
	await page.mouse.down();
	await page.mouse.move(400, 330, { steps: 10 });
	await page.mouse.up();
	await page.waitForTimeout(900);

	const after = await page.evaluate(async () => {
		const api = (window as any).mapkitGpu;
		const frame = api.frame;
		const ratio = frame.pixelRatio;
		const projected = frame.project(api.target.lon, api.target.lat);
		const onRing = await api.readPixel(projected.x * ratio + 52, projected.y * ratio);
		const wherever = await api.readPixel(4, 4);
		return { projected, onRing, wherever, frames: frame.frame };
	});

	console.log(`        pin moved ${Math.round(after.projected.x - before.x)}, ${Math.round(after.projected.y - before.y)} px`);
	check('the camera actually moved', Math.hypot(after.projected.x - before.x, after.projected.y - before.y) > 50);
	check('the ring followed the coordinate', !near(toRgb(after.onRing), expectedClear, 8), `rgb=${toRgb(after.onRing)}`);
	check('redraws kept firing on move', after.frames > 3, `frame counter ${after.frames}`);

	await page.screenshot({ path: `${shotDir}/07-webgpu-panned.png` });

	// The adapter retry is insurance against a browser that answers null before
	// its GPU process is up. On this box the map has usually finished loading
	// by the time <Overlay> asks, so force the condition rather than hope for
	// it: make the first two requestAdapter calls return null.
	console.log(`\n=== adapter retry ===`);
	const retryPage = await context.newPage();
	await retryPage.setViewportSize({ width: 800, height: 600 });
	await retryPage.addInitScript(() => {
		const gpu = navigator.gpu as unknown as {
			requestAdapter: (options?: unknown) => Promise<unknown>;
		};
		if (!gpu) return;
		const real = gpu.requestAdapter.bind(gpu);
		let calls = 0;
		gpu.requestAdapter = async (options?: unknown) => {
			calls++;
			(window as unknown as { __adapterCalls: number }).__adapterCalls = calls;
			return calls <= 2 ? null : real(options);
		};
	});
	await retryPage.goto(new URL('/webgpu', baseUrl).href, { waitUntil: 'load' });
	await retryPage.waitForFunction(() => (window as any).mapkitGpu?.status === 'ready', null, {
		timeout: 60_000
	});
	const retry = await retryPage.evaluate(() => ({
		attempts: (window as any).mapkitGpu.adapterAttempts,
		calls: (window as any).__adapterCalls,
		status: (window as any).mapkitGpu.status
	}));
	console.log(`        stubbed the first two requestAdapter calls to return null`);
	console.log(`        calls seen: ${retry.calls}, attempts reported: ${retry.attempts}`);
	check('recovered from null adapters', retry.status === 'ready');
	check('retried exactly as many times as needed', retry.attempts === 3, `attempts=${retry.attempts}`);
	await retryPage.close();

	if (consoleErrors.length > 0) {
		console.log('\nconsole errors:');
		for (const error of consoleErrors.slice(0, 10)) console.log(`  ${error}`);
	}

	console.log(`\nscreenshots in ${shotDir}/`);
	console.log(failures === 0 ? 'RESULT: pass' : `RESULT: ${failures} failure(s)`);
} finally {
	await browser.close().catch(() => {});
	kill();
}

process.exit(failures === 0 ? 0 : 1);
