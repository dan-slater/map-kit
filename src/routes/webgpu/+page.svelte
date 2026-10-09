<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import {
		GPU_COPY_SRC,
		GPU_RENDER_ATTACHMENT,
		Map,
		Overlay,
		type OverlayFrame
	} from '#lib/index.js';

	/*
	 * A real WebGPU overlay. It clears the canvas to a known colour and draws a
	 * ring locked to a geographic point, so both halves of the contract can be
	 * checked: that the device renders at all, and that what it renders stays
	 * registered to the map.
	 *
	 * The canvas is configured with COPY_SRC so scripts/verify-webgpu.ts can
	 * copy a pixel back off the GPU instead of trusting a screenshot.
	 */

	// Deliberately not transparent: the readback asserts this exact colour.
	const CLEAR = { r: 0.04, g: 0.09, b: 0.18, a: 1 };
	const TARGET = { lon: 24.9338, lat: -34.0308 }; // J-Bay

	const SHADER = /* wgsl */ `
		struct Uniforms {
			point: vec2f,
			resolution: vec2f,
		};
		@group(0) @binding(0) var<uniform> u: Uniforms;

		@vertex
		fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
			var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
			return vec4f(corners[index], 0.0, 1.0);
		}

		@fragment
		fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
			let d = distance(position.xy, u.point);
			let ring = smoothstep(64.0, 58.0, d) * smoothstep(40.0, 46.0, d);
			let colour = vec3f(0.11, 0.78, 0.98);
			return vec4f(colour * ring, ring);
		}
	`;

	type Gpu = {
		device: GPUDevice;
		context: GPUCanvasContext;
		format: GPUTextureFormat;
		pipeline: GPURenderPipeline;
		uniform: GPUBuffer;
		bindGroup: GPUBindGroup;
		readback: GPUBuffer;
	};

	let map = $state<MapLibreMap | null>(null);
	let status = $state('starting');
	let adapterInfo = $state('');
	let adapterAttempts = $state(0);
	let frames = $state(0);

	let gpu: Gpu | null = null;
	let overlayFrame: OverlayFrame | null = null;
	let pending: { x: number; y: number; resolve: (bytes: number[]) => void } | null = null;

	async function setup(frame: OverlayFrame) {
		overlayFrame = frame;
		if (!frame.gpu) {
			status = 'no gpu';
			return;
		}

		const device = frame.gpu.device as GPUDevice;
		const context = frame.gpu.context as GPUCanvasContext;
		const format = frame.gpu.format as GPUTextureFormat;
		adapterAttempts = frame.gpu.adapterAttempts;

		const module = device.createShaderModule({ code: SHADER });
		const pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: 'vs' },
			fragment: {
				module,
				entryPoint: 'fs',
				targets: [
					{
						format,
						blend: {
							color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
							alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
						}
					}
				]
			},
			primitive: { topology: 'triangle-list' }
		});

		const uniform = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: uniform } }]
		});
		// 256 bytes is the minimum bytesPerRow copyTextureToBuffer accepts.
		const readback = device.createBuffer({
			size: 256,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});

		gpu = { device, context, format, pipeline, uniform, bindGroup, readback };

		const info = (await (device as unknown as { adapterInfo?: GPUAdapterInfo }).adapterInfo) ?? null;
		adapterInfo = info ? `${info.vendor} ${info.architecture} ${info.description}`.trim() : '';
		status = 'ready';
		frame.requestRedraw('manual');
	}

	function draw(frame: OverlayFrame) {
		if (!gpu) return;
		const { device, context, pipeline, uniform, bindGroup, readback } = gpu;

		const texture = context.getCurrentTexture();
		const ratio = frame.pixelRatio;
		const projected = frame.project(TARGET.lon, TARGET.lat);

		device.queue.writeBuffer(
			uniform,
			0,
			new Float32Array([
				projected.x * ratio,
				projected.y * ratio,
				texture.width,
				texture.height
			])
		);

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: texture.createView(),
					clearValue: CLEAR,
					loadOp: 'clear',
					storeOp: 'store'
				}
			]
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();

		const request = pending;
		if (request) {
			pending = null;
			encoder.copyTextureToBuffer(
				{ texture, origin: { x: request.x, y: request.y, z: 0 } },
				{ buffer: readback, bytesPerRow: 256 },
				{ width: 1, height: 1, depthOrArrayLayers: 1 }
			);
		}

		device.queue.submit([encoder.finish()]);
		frames = frame.frame;

		if (request) {
			void readback.mapAsync(GPUMapMode.READ).then(() => {
				const bytes = Array.from(new Uint8Array(readback.getMappedRange().slice(0, 4)));
				readback.unmap();
				request.resolve(bytes);
			});
		}
	}

	/** Read one pixel straight off the rendered canvas, in device pixels. */
	function readPixel(x: number, y: number): Promise<number[]> {
		return new Promise((resolve, reject) => {
			if (!gpu || !overlayFrame) {
				reject(new Error('gpu not ready'));
				return;
			}
			pending = { x: Math.round(x), y: Math.round(y), resolve };
			overlayFrame.requestRedraw('manual');
		});
	}

	$effect(() => {
		if (!import.meta.env.DEV) return;
		Object.assign(window, {
			mapkitGpu: {
				get frame() {
					return overlayFrame;
				},
				get device() {
					return gpu?.device ?? null;
				},
				get format() {
					return gpu?.format ?? null;
				},
				get status() {
					return status;
				},
				get adapterInfo() {
					return adapterInfo;
				},
				get adapterAttempts() {
					return adapterAttempts;
				},
				clearColour: CLEAR,
				target: TARGET,
				readPixel,
				map
			}
		});
	});
</script>

<svelte:head><title>map-kit WebGPU overlay</title></svelte:head>

<main>
	<Map bind:map center={[TARGET.lon, TARGET.lat]} zoom={11} projection="mercator">
		{#snippet children()}
			<Overlay
				mode="webgpu"
				gpuUsage={GPU_RENDER_ATTACHMENT | GPU_COPY_SRC}
				gpuPowerPreference="high-performance"
				onready={setup}
				ondraw={draw}
				onerror={(error) => (status = `error: ${String(error)}`)}
			/>
		{/snippet}
	</Map>

	<aside>
		<h1>WebGPU overlay</h1>
		<dl>
			<dt>status</dt>
			<dd>{status}</dd>
			<dt>frames</dt>
			<dd>{frames}</dd>
			<dt>adapter</dt>
			<dd>{adapterInfo || 'unknown'}</dd>
			<dt>attempts</dt>
			<dd>{adapterAttempts}</dd>
		</dl>
	</aside>
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
	}

	main {
		position: fixed;
		inset: 0;
	}

	aside {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 10;
		padding: 12px 14px;
		background: var(--mk-color-surface);
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-md);
		box-shadow: var(--mk-shadow-2);
		font-family: var(--mk-font-family);
		font-size: var(--mk-font-size-sm);
	}

	h1 {
		margin: 0 0 8px;
		font-size: var(--mk-font-size-md);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 12px;
		margin: 0;
	}

	dt {
		color: var(--mk-color-text-muted);
	}

	dd {
		margin: 0;
		font-family: var(--mk-font-family-mono);
	}
</style>
