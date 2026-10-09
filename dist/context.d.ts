import type { Map as MapLibreMap } from 'maplibre-gl';
export type MapContext = {
    /** The live MapLibre map, or `null` before `<Map>` has created it. */
    readonly map: MapLibreMap | null;
    /** `true` once the map has fired `load`. */
    readonly loaded: boolean;
    /** Resolves with the map once it has fired `load`. Rejects if `<Map>` is destroyed first. */
    ready(): Promise<MapLibreMap>;
};
/** Internal. Called by `<Map>`. */
export declare function setMapContext(context: MapContext): void;
/**
 * Reach the `<Map>` that encloses this component. Throws when there is none,
 * because every caller here needs a map to do anything at all.
 *
 * Must be called during component initialisation, like any Svelte context read.
 */
export declare function useMap(): MapContext;
/** Reach the enclosing `<Map>`, or `null` when there is none. */
export declare function useMapOptional(): MapContext | null;
