<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import './tokens.css';
	import { useMap } from './context.js';
	import { isLocationOccluded, metersPerPixel as measureMetersPerPixel } from './mapUtils.js';
	import type { OverlayDrawReason, OverlayFrame, OverlayGpu, OverlayMode } from './overlay.js';

	type Props = {
		/** `'2d'` (default) or `'webgpu'`. */
		mode?: OverlayMode;
		/** Device pixels per CSS pixel. Defaults to `window.devicePixelRatio`. */
		pixelRatio?: number;
		/** Redraw every animation frame instead of only when the map moves. */
		continuous?: boolean;
		/** Let the canvas receive pointer events. Off by default so the map keeps its gestures. */
		pointerEvents?: boolean;
		/** Clear the canvas before each `ondraw`. 2d only. Default `true`. */
		autoClear?: boolean;
		/** Context attributes for `getContext`. */
		contextAttributes?: CanvasRenderingContext2DSettings;
		/** `alphaMode` for the WebGPU canvas configuration. Default `'premultiplied'`. */
		gpuAlphaMode?: 'opaque' | 'premultiplied';
		/** Extra classes on the canvas. */
		class?: string;
		/** Called once the canvas, and under WebGPU the device, are ready. */
		onready?: (frame: OverlayFrame) => void;
		/** Called on every redraw. This is where you paint. */
		ondraw?: (frame: OverlayFrame) => void;
		onerror?: (error: unknown) => void;
		/** Rendered as DOM next to the canvas, and handed the same frame object. */
		children?: Snippet<[OverlayFrame]>;
	};

	let {
		mode = '2d',
		pixelRatio,
		continuous = false,
		pointerEvents = false,
		autoClear = true,
		contextAttributes,
		gpuAlphaMode = 'premultiplied',
		class: className = '',
		onready,
		ondraw,
		onerror,
		children
	}: Props = $props();

	const mapContext = useMap();

	let canvas: HTMLCanvasElement;
	let ctx2d: CanvasRenderingContext2D | null = $state(null);
	let gpu: OverlayGpu | null = $state(null);
	let cssWidth = $state(0);
	let cssHeight = $state(0);
	let currentPixelRatio = $state(1);
	let frameCount = $state(0);
	let reason: OverlayDrawReason = $state('init');
	let started = $state(false);

	let map: MapLibreMap | null = null;
	let scheduled = 0;
	let pendingReason: OverlayDrawReason = 'init';
	let disposed = false;

	const frame: OverlayFrame = {
		get canvas() {
			return canvas;
		},
		get map() {
			return map as MapLibreMap;
		},
		get ctx() {
			return ctx2d;
		},
		get gpu() {
			return gpu;
		},
		get width() {
			return cssWidth;
		},
		get height() {
			return cssHeight;
		},
		get pixelRatio() {
			return currentPixelRatio;
		},
		get frame() {
			return frameCount;
		},
		get reason() {
			return reason;
		},
		project(lon: number, lat: number) {
			const point = map!.project([lon, lat]);
			return { x: point.x, y: point.y };
		},
		unproject(x: number, y: number) {
			const lngLat = map!.unproject([x, y]);
			return { lon: lngLat.lng, lat: lngLat.lat };
		},
		metersPerPixel(lat: number, lon?: number) {
			return measureMetersPerPixel(map!, lat, lon);
		},
		isOccluded(lon: number, lat: number) {
			return isLocationOccluded(map!, lon, lat);
		},
		clear() {
			if (ctx2d) ctx2d.clearRect(0, 0, cssWidth, cssHeight);
		},
		requestRedraw(nextReason: OverlayDrawReason = 'manual') {
			requestRedraw(nextReason);
		}
	};

	function requestRedraw(nextReason: OverlayDrawReason = 'manual'): void {
		pendingReason = nextReason;
		if (scheduled || disposed) return;
		scheduled = requestAnimationFrame(draw);
	}

	/** Match the backing store to the map container. Returns true if it changed. */
	function sync(): boolean {
		if (!map || !canvas) return false;
		const rect = map.getContainer().getBoundingClientRect();
		const ratio = pixelRatio ?? window.devicePixelRatio ?? 1;
		const width = Math.max(1, Math.round(rect.width * ratio));
		const height = Math.max(1, Math.round(rect.height * ratio));

		cssWidth = rect.width;
		cssHeight = rect.height;
		currentPixelRatio = ratio;

		if (canvas.width === width && canvas.height === height) return false;
		canvas.width = width;
		canvas.height = height;
		// Resizing the backing store resets the 2d transform, so re-apply the
		// pixel-ratio scale: child code always draws in CSS pixels.
		if (ctx2d) ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
		return true;
	}

	function draw(): void {
		scheduled = 0;
		if (disposed || !map || !canvas) return;

		sync();
		reason = pendingReason;
		pendingReason = 'manual';
		frameCount += 1;

		if (autoClear && ctx2d) ctx2d.clearRect(0, 0, cssWidth, cssHeight);

		try {
			ondraw?.(frame);
		} catch (error) {
			onerror?.(error);
		}

		if (continuous && !disposed) scheduled = requestAnimationFrame(draw);
	}

	async function initWebGPU(): Promise<void> {
		const gpuApi = (navigator as Navigator & { gpu?: unknown }).gpu as
			| {
					requestAdapter(): Promise<unknown>;
					getPreferredCanvasFormat(): string;
			  }
			| undefined;

		if (!gpuApi) {
			onerror?.(new Error('[map-kit] <Overlay mode="webgpu"> needs navigator.gpu, which this browser does not expose'));
			return;
		}

		const adapter = (await gpuApi.requestAdapter()) as {
			requestDevice(): Promise<unknown>;
		} | null;
		if (!adapter) {
			onerror?.(new Error('[map-kit] no WebGPU adapter available'));
			return;
		}

		const device = await adapter.requestDevice();
		if (disposed) return;

		const context = canvas.getContext('webgpu') as unknown as {
			configure(options: Record<string, unknown>): void;
		} | null;
		if (!context) {
			onerror?.(new Error('[map-kit] canvas.getContext("webgpu") returned null'));
			return;
		}

		const format = gpuApi.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode: gpuAlphaMode });
		gpu = { adapter, device, context, format };
	}

	onMount(() => {
		let resizeObserver: ResizeObserver | undefined;
		let cleanupMapListeners: (() => void) | undefined;
		let cancelled = false;

		const start = async () => {
			const m = await mapContext.ready();
			if (cancelled) return;
			map = m;

			if (mode === '2d') {
				ctx2d = canvas.getContext('2d', contextAttributes);
				if (!ctx2d) {
					onerror?.(new Error('[map-kit] canvas.getContext("2d") returned null'));
					return;
				}
			} else {
				await initWebGPU();
				if (cancelled) return;
			}

			sync();

			const onMove = () => requestRedraw('move');
			const onMoveEnd = () => requestRedraw('moveend');
			const onResize = () => requestRedraw('resize');
			const onStyle = () => requestRedraw('style');
			m.on('move', onMove);
			m.on('moveend', onMoveEnd);
			m.on('resize', onResize);
			m.on('styledata', onStyle);

			// The map container can change size without MapLibre firing `resize`,
			// for example when a side panel opens beside it.
			resizeObserver = new ResizeObserver(() => requestRedraw('resize'));
			resizeObserver.observe(m.getContainer());

			cleanupMapListeners = () => {
				m.off('move', onMove);
				m.off('moveend', onMoveEnd);
				m.off('resize', onResize);
				m.off('styledata', onStyle);
			};

			started = true;
			onready?.(frame);
			requestRedraw('init');
		};

		void start().catch((error) => onerror?.(error));

		return () => {
			cancelled = true;
			disposed = true;
			if (scheduled) cancelAnimationFrame(scheduled);
			scheduled = 0;
			resizeObserver?.disconnect();
			cleanupMapListeners?.();
		};
	});

	// A change of pixelRatio or continuous mode needs a fresh frame.
	$effect(() => {
		void pixelRatio;
		void continuous;
		if (map) requestRedraw('resize');
	});
</script>

<canvas
	bind:this={canvas}
	class="mk-overlay {className}"
	class:mk-overlay--interactive={pointerEvents}
></canvas>
{#if children && started}
	{@render children(frame)}
{/if}

<style>
	.mk-overlay {
		position: absolute;
		inset: 0;
		z-index: var(--mk-z-overlay);
		pointer-events: none;
	}

	.mk-overlay--interactive {
		pointer-events: auto;
	}
</style>
