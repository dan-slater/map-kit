import type { StyleSpecification } from 'maplibre-gl';
/**
 * Recolour an OpenMapTiles basemap from a small set of tokens.
 *
 * The stock OpenFreeMap styles are general-purpose cartography: lots of hues,
 * tuned for finding a street. A product map usually wants the opposite, a
 * quiet ground that its own data sits on top of. `themeStyle` rewrites the
 * paint of the layer groups OpenMapTiles defines and hides the ones a theme
 * sets to `null`.
 *
 * It rewrites colours in place inside whatever expression the style already
 * uses. A zoom-interpolated colour keeps its stops and its interpolation; only
 * the colour at each stop changes. Alpha is carried over too, so layers the
 * style deliberately made faint stay faint.
 */
/** How much of the label set to keep. */
export type LabelDensity = 'full' | 'sparse' | 'none';
export type BasemapTheme = {
    /** Oceans, lakes and rivers. */
    water: string;
    /**
     * Lakes, ponds and reservoirs, when you want them distinct from the sea.
     * Tints anything whose `class` is not `ocean`.
     *
     * This is a split by feature class, nothing more. OpenMapTiles carries no
     * depth at all, so do not use it to suggest shallows or bathymetry: a
     * viewer reading a lighter band as shallow water would be reading
     * something that is not in the data.
     */
    waterInland?: string | null;
    /** Rivers and streams drawn as lines. Defaults to `water`. */
    waterway?: string | null;
    /** The ground, and the colour behind everything. */
    land: string;
    /** Natural cover: wood, grass, sand, ice. */
    landLow: string;
    /** Human land use: residential, school, cemetery, pitch. */
    landHigh: string;
    /** Parks. `null` hides them. */
    parks: string | null;
    /** The road network, flattened to one colour. `null` hides it. */
    roads: string | null;
    /** Road casings, if you want them distinct. Defaults to `roads`. */
    roadCasing?: string | null;
    /** Hide roads below this zoom. */
    roadMinZoom?: number;
    /** Building footprints and extrusions. `null` hides them. */
    buildings: string | null;
    /** Administrative boundaries. `null` hides them. */
    boundaries: string | null;
    /** Dash pattern for boundaries, in line widths. */
    boundaryDash?: number[] | null;
    /**
     * Draws a hairline along the water edge, which the stock styles do not
     * have. This is what makes a coast read as a drawn line rather than a
     * colour change. `null` for none.
     */
    coastline?: string | null;
    /** Width of the coastline hairline at zoom 10. Default 1. */
    coastlineWidth?: number;
    /** Blur on the coastline, for a glow. Default 0. */
    coastlineBlur?: number;
    /** Place and road label text. */
    labelText: string;
    /** Label halo. Use a colour close to `land` to keep labels legible. */
    labelHalo: string;
    /** Water label text. Defaults to `labelText`. */
    labelWater?: string;
    labelDensity: LabelDensity;
    /** Upper-case the labels. */
    labelUppercase?: boolean;
    /** Letter spacing, in ems. */
    labelLetterSpacing?: number;
    /**
     * Font stack for every label.
     *
     * OpenFreeMap only serves `Noto Sans Regular`, `Noto Sans Italic` and
     * `Noto Sans Bold`. Naming anything else gives you blank labels, so a
     * serif or monospace feel has to come from case and letter spacing
     * instead, unless you host your own glyph PBFs.
     */
    fontStack?: string[];
    /** Opacity of the Natural Earth shaded relief, 0 to 1. 0 removes it. */
    hillshadeOpacity: number;
    /** The globe's atmosphere. */
    sky: {
        /** The void behind the planet. */
        space: string;
        /** The halo at the limb. */
        halo: string;
        /** How strongly the atmosphere shows, 0 to 1. Default 0.8. */
        blend?: number;
    };
    /** `--mk-` overrides so the pins and panel match. See {@link tokensFor}. */
    tokens?: Record<string, string>;
};
/**
 * Apply a theme to a fetched style.
 *
 * Returns a new style; the input is not modified. Hand it to `<Map theme>`
 * rather than calling it yourself unless you are doing something unusual.
 */
export declare function themeStyle(style: StyleSpecification, theme: BasemapTheme): StyleSpecification;
type Rgba = {
    r: number;
    g: number;
    b: number;
    a: number;
};
export declare function parseColour(input: string): Rgba | null;
/**
 * A theme's `--mk-` overrides as a CSS declaration string, so the pins and
 * panel match the basemap.
 *
 * It is a declaration list, not a rule, so it drops straight into a `style`
 * attribute:
 *
 * ```svelte
 * <div style={tokensFor(themes.ink)}>
 *   <Map theme={themes.ink}>...</Map>
 * </div>
 * ```
 */
export declare function tokensFor(theme: BasemapTheme): string;
export {};
