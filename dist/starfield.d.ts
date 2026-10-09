export type StarFieldOptions = {
    /** Stars per tile. Default 90. */
    count?: number;
    /** Tile size in CSS pixels. The pattern repeats at this interval. Default 420. */
    tile?: number;
    /** Star colour. Default `#ffffff`. */
    color?: string;
    /** Largest star radius in pixels. Default 1.1. */
    maxRadius?: number;
    /** Brightest star opacity, 0 to 1. Default 0.85. */
    maxOpacity?: number;
    /** Changes the arrangement. Same seed, same sky. Default 1. */
    seed?: number;
};
/**
 * A tiling star field as an SVG data URI, for use as a CSS `background-image`.
 *
 * No tiles, no canvas and no per-frame work: it is one repeating image behind
 * the map canvas, which is why it costs nothing while the globe spins. Because
 * it tiles, keep `tile` large enough that the repeat is not obvious.
 *
 * Deterministic for a given set of options, so it can be recomputed on every
 * render without the sky twinkling.
 */
export declare function starFieldDataUri(options?: StarFieldOptions): string;
