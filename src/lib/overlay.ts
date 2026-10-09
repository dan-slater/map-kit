import type { Map as MapLibreMap } from 'maplibre-gl';

/** Which kind of drawing context `<Overlay>` creates. */
export type OverlayMode = '2d' | 'webgpu';

/** Why a redraw was requested. Useful for skipping expensive work on `move`. */
export type OverlayDrawReason = 'init' | 'move' | 'moveend' | 'resize' | 'style' | 'manual';

/**
 * WebGPU handles, available once the device has been requested.
 *
 * These are typed as `unknown` on purpose: map-kit must not force
 * `@webgpu/types` onto consumers who only ever draw in 2d. Install
 * `@webgpu/types` in the consuming app and cast:
 *
 * ```ts
 * const device = frame.gpu!.device as GPUDevice;
 * const context = frame.gpu!.context as GPUCanvasContext;
 * ```
 */
export type OverlayGpu = {
	adapter: unknown;
	device: unknown;
	context: unknown;
	/** The preferred canvas format, already applied by `configure`. */
	format: string;
	/** The texture usage the canvas was configured with. */
	usage: number;
	/**
	 * How many `requestAdapter` calls it took. More than one means the browser
	 * answered null before its GPU process was up, which is normal on a
	 * freshly started headless Chrome.
	 */
	adapterAttempts: number;
};

/**
 * `GPUTextureUsage.RENDER_ATTACHMENT`, the default canvas usage.
 *
 * Spelled out as a constant so map-kit does not need `@webgpu/types` to name
 * it. Combine with `GPU_COPY_SRC` to read the canvas back.
 */
export const GPU_RENDER_ATTACHMENT = 0x10;

/** `GPUTextureUsage.COPY_SRC`. Add it to `gpuUsage` to allow `copyTextureToBuffer`. */
export const GPU_COPY_SRC = 0x01;

/**
 * The object `<Overlay>` hands to `ondraw` and to its child snippet.
 *
 * The full contract, including coordinate conventions and the redraw
 * lifecycle, is in `docs/overlay.md`.
 */
export type OverlayFrame = {
	/** The canvas element. Sized to the map container at `pixelRatio`. */
	readonly canvas: HTMLCanvasElement;
	/** The map this overlay is registered to. */
	readonly map: MapLibreMap;
	/**
	 * The 2d context when `mode="2d"`, otherwise `null`. Its transform is
	 * pre-scaled by `pixelRatio`, so draw in CSS pixels.
	 */
	readonly ctx: CanvasRenderingContext2D | null;
	/** WebGPU handles when `mode="webgpu"` and the device is ready, otherwise `null`. */
	readonly gpu: OverlayGpu | null;
	/** Canvas width in CSS pixels. */
	readonly width: number;
	/** Canvas height in CSS pixels. */
	readonly height: number;
	/** Device pixels per CSS pixel. `canvas.width === Math.round(width * pixelRatio)`. */
	readonly pixelRatio: number;
	/** Redraw counter, starting at 1 for the first draw. */
	readonly frame: number;
	/** Why this redraw was requested. */
	readonly reason: OverlayDrawReason;
	/** Project geographic coordinates to CSS pixels on this canvas. */
	project(lon: number, lat: number): { x: number; y: number };
	/** Invert `project`. */
	unproject(x: number, y: number): { lon: number; lat: number };
	/** Ground metres per CSS pixel at a latitude, measured from the live camera. */
	metersPerPixel(lat: number, lon?: number): number;
	/** `true` when a location is behind the planet under globe projection. */
	isOccluded(lon: number, lat: number): boolean;
	/** Clear the whole canvas. 2d only; a no-op under WebGPU. */
	clear(): void;
	/** Ask for another draw on the next animation frame. */
	requestRedraw(reason?: OverlayDrawReason): void;
};
