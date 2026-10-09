import { getContext, setContext } from 'svelte';
import type { Map as MapLibreMap } from 'maplibre-gl';

const MAP_CONTEXT = Symbol.for('map-kit.map');

export type MapContext = {
	/** The live MapLibre map, or `null` before `<Map>` has created it. */
	readonly map: MapLibreMap | null;
	/** `true` once the map has fired `load`. */
	readonly loaded: boolean;
	/** Resolves with the map once it has fired `load`. Rejects if `<Map>` is destroyed first. */
	ready(): Promise<MapLibreMap>;
};

/** Internal. Called by `<Map>`. */
export function setMapContext(context: MapContext): void {
	setContext(MAP_CONTEXT, context);
}

/**
 * Reach the `<Map>` that encloses this component. Throws when there is none,
 * because every caller here needs a map to do anything at all.
 *
 * Must be called during component initialisation, like any Svelte context read.
 */
export function useMap(): MapContext {
	const context = getContext<MapContext | undefined>(MAP_CONTEXT);
	if (!context) {
		throw new Error('[map-kit] this component must be rendered inside <Map>');
	}
	return context;
}

/** Reach the enclosing `<Map>`, or `null` when there is none. */
export function useMapOptional(): MapContext | null {
	return getContext<MapContext | undefined>(MAP_CONTEXT) ?? null;
}
