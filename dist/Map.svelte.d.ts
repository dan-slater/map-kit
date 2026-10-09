import { type Snippet } from 'svelte';
import { type Map as MapLibreMap, type ProjectionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './tokens.css';
import { type MapStyleInput } from './styles.js';
import { type BasemapTheme } from './theme.js';
import { type FlyToOptions } from './flyTo.js';
import type { MapCamera, MapPointerEvent } from './types.js';
/** The projections MapLibre ships. */
type ProjectionName = 'globe' | 'mercator';
type MapApi = {
    map: MapLibreMap;
    flyTo: (options: FlyToOptions) => Promise<void>;
};
type Props = {
    /** `[lon, lat]`. Two-way: pan the map and it writes back. */
    center?: [lon: number, lat: number];
    /** Two-way: zoom the map and it writes back. */
    zoom?: number;
    /** Two-way. */
    bearing?: number;
    /** Two-way. */
    pitch?: number;
    /** `'liberty' | 'positron' | 'bright'`, a style URL, or a style object. */
    style?: MapStyleInput;
    /**
     * Recolour the basemap from a small token set, and set the globe's
     * atmosphere. Pass one of the presets from `themes`, or your own.
     * `null` leaves the style exactly as published.
     */
    theme?: BasemapTheme | null;
    /** Whether the user can pan, zoom and rotate. Reactive. */
    interactive?: boolean;
    /** `'globe'` (the default), `'mercator'`, or a full projection spec. */
    projection?: ProjectionName | ProjectionSpecification;
    /** The live MapLibre map. Bind to it to call MapLibre directly. */
    map?: MapLibreMap | null;
    /** `true` once the map has fired `load`. */
    loaded?: boolean;
    /** Extra MapLibre `MapOptions`, merged last. Escape hatch for anything not surfaced here. */
    options?: Record<string, unknown>;
    /** Extra classes on the wrapper element. */
    class?: string;
    onclick?: (event: MapPointerEvent) => void;
    onmove?: (camera: MapCamera) => void;
    onmoveend?: (camera: MapCamera) => void;
    onready?: (map: MapLibreMap) => void;
    onerror?: (error: unknown) => void;
    /** Rendered over the map once it has loaded. Absolutely positioned, click-through by default. */
    children?: Snippet<[MapApi]>;
    /** Rendered over the map until it has loaded. */
    loading?: Snippet;
};
declare const Map: import("svelte").Component<Props, {
    flyTo: (flyOptions: FlyToOptions) => Promise<void>;
    getMap: () => MapLibreMap | null;
    ready: () => Promise<MapLibreMap>;
}, "zoom" | "map" | "center" | "pitch" | "bearing" | "loaded">;
type Map = ReturnType<typeof Map>;
export default Map;
