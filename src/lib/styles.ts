import type { StyleSpecification } from 'maplibre-gl';

/**
 * The three styles OpenFreeMap publishes. They are free and keyless.
 *
 * OpenFreeMap asks that you do not bulk-download tiles. Normal interactive map
 * use is fine; scraping the planet is not. See https://openfreemap.org.
 */
export const OPENFREEMAP_STYLES = {
	liberty: 'https://tiles.openfreemap.org/styles/liberty',
	positron: 'https://tiles.openfreemap.org/styles/positron',
	bright: 'https://tiles.openfreemap.org/styles/bright'
} as const;

/** Name of a built-in OpenFreeMap style. */
export type MapStyleName = keyof typeof OPENFREEMAP_STYLES;

/**
 * Anything `<Map style={...}>` accepts: a built-in name, a style URL, or a
 * full MapLibre style object.
 */
export type MapStyleInput = MapStyleName | (string & {}) | StyleSpecification;

/** Resolve a style name to its URL. URLs and style objects pass through. */
export function resolveStyle(style: MapStyleInput): string | StyleSpecification {
	if (typeof style === 'string') {
		return style in OPENFREEMAP_STYLES ? OPENFREEMAP_STYLES[style as MapStyleName] : style;
	}
	return style;
}
