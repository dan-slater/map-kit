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
};
/** Resolve a style name to its URL. URLs and style objects pass through. */
export function resolveStyle(style) {
    if (typeof style === 'string') {
        return style in OPENFREEMAP_STYLES ? OPENFREEMAP_STYLES[style] : style;
    }
    return style;
}
