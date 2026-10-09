import type { BasemapTheme } from './theme.js';
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
export declare const ink: BasemapTheme;
/** Warm off-white land, pale blue-grey water, hairline ink coasts. */
export declare const paper: BasemapTheme;
/**
 * Nautical chart: cream land, pale cyan water, dark navy coast, spaced caps.
 *
 * All water is one colour on purpose. An earlier version tinted inland water
 * lighter, which read as shallows, and OpenMapTiles has no depth data behind
 * that. The chart feel comes from the coast line, the dashed boundaries and
 * the lettering instead.
 */
export declare const chart: BasemapTheme;
/** One dark, one light, nothing else. Reads as a graphic rather than a map. */
export declare const mono: BasemapTheme;
/** Every preset, by name. */
export declare const themes: {
    readonly ink: BasemapTheme;
    readonly paper: BasemapTheme;
    readonly chart: BasemapTheme;
    readonly mono: BasemapTheme;
};
/** Name of a built-in basemap theme. */
export type ThemeName = keyof typeof themes;
/** The preset names, in the order they are meant to be shown. */
export declare const THEME_NAMES: ThemeName[];
/** Look up a preset by name, falling back to `null` for an unknown one. */
export declare function themeByName(name: string | null | undefined): BasemapTheme | null;
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
export declare function themeNameOf(theme: BasemapTheme | null | undefined): ThemeName | null;
