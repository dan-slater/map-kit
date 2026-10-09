/**
 * Four complete basemap themes. Each one is a plain object, so copy one and
 * change three colours rather than starting from scratch.
 *
 * OpenFreeMap serves only `Noto Sans Regular`, `Noto Sans Italic` and
 * `Noto Sans Bold`, so none of these can reach for a real serif or monospace
 * face. Where a preset wants that feel it uses case and letter spacing, which
 * carries more of the impression than the letterforms do at label sizes.
 */
/** Deep navy ocean, near-black land, a teal coast and coral pins. */
export const ink = {
    water: '#0b1d2e',
    waterway: '#13304a',
    land: '#0a1119',
    landLow: '#0e1822',
    landHigh: '#111b26',
    parks: '#0f1f22',
    roads: '#1b2838',
    roadMinZoom: 9,
    buildings: '#131e2a',
    boundaries: '#24394d',
    coastline: '#2f8f8f',
    coastlineWidth: 1.1,
    coastlineBlur: 1.4,
    labelText: '#8fa3b5',
    labelHalo: 'rgba(8, 15, 22, 0.9)',
    labelWater: '#4f9c9c',
    labelDensity: 'sparse',
    labelLetterSpacing: 0.06,
    hillshadeOpacity: 0,
    sky: { space: '#03070c', halo: '#1d6b7a', blend: 0.75 },
    tokens: {
        '--mk-map-background': '#03070c',
        '--mk-color-surface': '#101b26',
        '--mk-color-surface-muted': '#17242f',
        '--mk-color-text': '#e4edf4',
        '--mk-color-text-muted': '#8fa3b5',
        '--mk-color-border': '#22323f',
        '--mk-color-accent': '#2f8f8f',
        '--mk-color-accent-contrast': '#04121a',
        '--mk-color-focus': '#39a8a8',
        '--mk-color-pin': '#ff7a59',
        '--mk-color-pin-stroke': '#0a1119',
        '--mk-color-pin-hover': '#ff9476',
        '--mk-color-pin-selected': '#36c9c9',
        '--mk-color-pin-label': '#e4edf4',
        '--mk-shadow-1': '0 1px 2px rgb(0 0 0 / 0.5)',
        '--mk-shadow-2': '0 10px 30px rgb(0 0 0 / 0.55)'
    }
};
/** Warm off-white land, pale blue-grey water, hairline ink coasts. */
export const paper = {
    water: '#ccd8e0',
    waterway: '#b7c7d2',
    land: '#f6f1e7',
    landLow: '#eee7d9',
    landHigh: '#f1ebdf',
    parks: '#e6e6d2',
    roads: '#ddd5c6',
    roadMinZoom: 10,
    buildings: '#e8e0d2',
    boundaries: '#8c8577',
    boundaryDash: [3, 2],
    coastline: '#3c4650',
    coastlineWidth: 0.7,
    labelText: '#3c4650',
    labelHalo: 'rgba(246, 241, 231, 0.92)',
    labelWater: '#6b7a87',
    labelDensity: 'sparse',
    labelLetterSpacing: 0.04,
    // Italic is the closest thing to an editorial face OpenFreeMap serves.
    fontStack: ['Noto Sans Italic'],
    hillshadeOpacity: 0.12,
    sky: { space: '#dfe7ee', halo: '#f6f1e7', blend: 0.55 },
    tokens: {
        '--mk-map-background': '#dfe7ee',
        '--mk-color-surface': '#fdfaf4',
        '--mk-color-surface-muted': '#efe9dd',
        '--mk-color-text': '#2b333b',
        '--mk-color-text-muted': '#6b7a87',
        '--mk-color-border': '#ddd4c4',
        '--mk-color-accent': '#9c5b3c',
        '--mk-color-accent-contrast': '#fdfaf4',
        '--mk-color-focus': '#9c5b3c',
        '--mk-color-pin': '#3c4650',
        '--mk-color-pin-stroke': '#fdfaf4',
        '--mk-color-pin-hover': '#5a6773',
        '--mk-color-pin-selected': '#9c5b3c',
        '--mk-color-pin-label': '#2b333b'
    }
};
/**
 * Nautical chart: cream land, pale cyan water, dark navy coast, spaced caps.
 *
 * All water is one colour on purpose. An earlier version tinted inland water
 * lighter, which read as shallows, and OpenMapTiles has no depth data behind
 * that. The chart feel comes from the coast line, the dashed boundaries and
 * the lettering instead.
 */
export const chart = {
    water: '#cfe9ef',
    waterway: '#9fd0dd',
    land: '#f7f0dc',
    landLow: '#f2ead3',
    landHigh: '#f4edd8',
    parks: '#e9e6c8',
    roads: '#e2d9bd',
    roadMinZoom: 11,
    buildings: null,
    boundaries: '#1d3a5c',
    boundaryDash: [2, 3],
    coastline: '#1d3a5c',
    coastlineWidth: 1.2,
    labelText: '#1d3a5c',
    labelHalo: 'rgba(247, 240, 220, 0.9)',
    labelWater: '#2f6f85',
    labelDensity: 'sparse',
    labelUppercase: true,
    labelLetterSpacing: 0.16,
    hillshadeOpacity: 0,
    sky: { space: '#b7d8e2', halo: '#f7f0dc', blend: 0.6 },
    tokens: {
        '--mk-map-background': '#b7d8e2',
        '--mk-color-surface': '#fdf8e9',
        '--mk-color-surface-muted': '#f0e8cf',
        '--mk-color-text': '#1d3a5c',
        '--mk-color-text-muted': '#56708a',
        '--mk-color-border': '#cfc3a0',
        '--mk-color-accent': '#1d3a5c',
        '--mk-color-accent-contrast': '#fdf8e9',
        '--mk-color-focus': '#1d3a5c',
        '--mk-color-pin': '#c2452d',
        '--mk-color-pin-stroke': '#fdf8e9',
        '--mk-color-pin-hover': '#d85f46',
        '--mk-color-pin-selected': '#1d3a5c',
        '--mk-color-pin-label': '#1d3a5c',
        '--mk-font-family-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace'
    }
};
/** One dark, one light, nothing else. Reads as a graphic rather than a map. */
export const mono = {
    water: '#1c1c1c',
    land: '#ebebeb',
    landLow: '#ebebeb',
    landHigh: '#ebebeb',
    parks: null,
    roads: null,
    buildings: null,
    boundaries: null,
    coastline: null,
    labelText: '#1c1c1c',
    labelHalo: 'rgba(235, 235, 235, 0)',
    labelDensity: 'none',
    hillshadeOpacity: 0,
    // No atmosphere at all: the shading MapLibre adds at the limb reads as a
    // smudge against flat white, and this theme is meant to be flat.
    sky: { space: '#ffffff', halo: '#ffffff', blend: 0 },
    tokens: {
        '--mk-map-background': '#ffffff',
        '--mk-color-surface': '#ffffff',
        '--mk-color-surface-muted': '#ebebeb',
        '--mk-color-text': '#1c1c1c',
        '--mk-color-text-muted': '#6b6b6b',
        '--mk-color-border': '#1c1c1c',
        '--mk-color-accent': '#1c1c1c',
        '--mk-color-accent-contrast': '#ffffff',
        '--mk-color-focus': '#1c1c1c',
        '--mk-color-pin': '#1c1c1c',
        '--mk-color-pin-stroke': '#ebebeb',
        '--mk-color-pin-hover': '#4a4a4a',
        '--mk-color-pin-selected': '#c2452d',
        '--mk-color-pin-label': '#1c1c1c',
        '--mk-radius-lg': '2px',
        '--mk-radius-md': '2px',
        '--mk-radius-sm': '0px'
    }
};
/** Every preset, by name. */
export const themes = { ink, paper, chart, mono };
/** The preset names, in the order they are meant to be shown. */
export const THEME_NAMES = Object.keys(themes);
/** Look up a preset by name, falling back to `null` for an unknown one. */
export function themeByName(name) {
    if (!name)
        return null;
    return themes[name] ?? null;
}
/**
 * The name of a preset, or `null` for `null` and for a theme of your own.
 *
 * Compares by identity, so it answers for the exported preset objects and for
 * anything derived from one only if you kept the same object. A copy with a
 * colour changed is a theme of your own, and gets `null`.
 *
 * One trap worth knowing: putting a theme in a deep `$state` wraps it in a
 * proxy, and a proxy is not identical to the preset it wraps, so this returns
 * `null` for it. Hold themes in `$state.raw`, which is what `mapSettings()`
 * does. They are value objects and are never edited in place, so raw is the
 * right kind of state for them anyway.
 */
export function themeNameOf(theme) {
    if (!theme)
        return null;
    for (const [name, preset] of Object.entries(themes)) {
        if (preset === theme)
            return name;
    }
    return null;
}
