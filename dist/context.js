import { getContext, setContext } from 'svelte';
const MAP_CONTEXT = Symbol.for('map-kit.map');
/** Internal. Called by `<Map>`. */
export function setMapContext(context) {
    setContext(MAP_CONTEXT, context);
}
/**
 * Reach the `<Map>` that encloses this component. Throws when there is none,
 * because every caller here needs a map to do anything at all.
 *
 * Must be called during component initialisation, like any Svelte context read.
 */
export function useMap() {
    const context = getContext(MAP_CONTEXT);
    if (!context) {
        throw new Error('[map-kit] this component must be rendered inside <Map>');
    }
    return context;
}
/** Reach the enclosing `<Map>`, or `null` when there is none. */
export function useMapOptional() {
    return getContext(MAP_CONTEXT) ?? null;
}
