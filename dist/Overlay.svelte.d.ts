import { type Snippet } from 'svelte';
import './tokens.css';
import type { OverlayFrame, OverlayMode } from './overlay.js';
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
    /**
     * `usage` for the WebGPU canvas configuration. Defaults to
     * `RENDER_ATTACHMENT` (`0x10`). Add `COPY_SRC` (`0x01`) to read the
     * rendered canvas back with `copyTextureToBuffer`.
     */
    gpuUsage?: number;
    /** Adapter power preference. Pass `'high-performance'` to prefer a discrete GPU. */
    gpuPowerPreference?: 'low-power' | 'high-performance';
    /**
     * How many extra times to ask for an adapter when the first request
     * returns null. A freshly started browser often has not brought its GPU
     * process up yet and answers null once before succeeding. Default 5.
     */
    gpuAdapterRetries?: number;
    /** Delay between adapter attempts, milliseconds. Default 300. */
    gpuAdapterRetryDelayMs?: number;
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
declare const Overlay: import("svelte").Component<Props, {}, "">;
type Overlay = ReturnType<typeof Overlay>;
export default Overlay;
