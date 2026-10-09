import type { StyleSpecification } from 'maplibre-gl';
/**
 * The three styles OpenFreeMap publishes. They are free and keyless.
 *
 * OpenFreeMap asks that you do not bulk-download tiles. Normal interactive map
 * use is fine; scraping the planet is not. See https://openfreemap.org.
 */
export declare const OPENFREEMAP_STYLES: {
    readonly liberty: "https://tiles.openfreemap.org/styles/liberty";
    readonly positron: "https://tiles.openfreemap.org/styles/positron";
    readonly bright: "https://tiles.openfreemap.org/styles/bright";
};
/** Name of a built-in OpenFreeMap style. */
export type MapStyleName = keyof typeof OPENFREEMAP_STYLES;
/**
 * Anything `<Map style={...}>` accepts: a built-in name, a style URL, or a
 * full MapLibre style object.
 */
export type MapStyleInput = MapStyleName | (string & {}) | StyleSpecification;
/** Resolve a style name to its URL. URLs and style objects pass through. */
export declare function resolveStyle(style: MapStyleInput): string | StyleSpecification;
