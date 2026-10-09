/** Small deterministic PRNG, so a given seed always draws the same sky. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
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
export function starFieldDataUri(options = {}) {
    const { count = 90, tile = 420, color = '#ffffff', maxRadius = 1.1, maxOpacity = 0.85, seed = 1 } = options;
    const random = mulberry32(seed);
    const circles = [];
    for (let i = 0; i < count; i++) {
        const cx = round(random() * tile);
        const cy = round(random() * tile);
        // Bias towards faint, small stars: a uniform field reads as noise.
        const weight = random() ** 2.2;
        const r = round(0.25 + weight * (maxRadius - 0.25));
        const opacity = round(0.12 + weight * (maxOpacity - 0.12));
        circles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" opacity="${opacity}"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" ` +
        `viewBox="0 0 ${tile} ${tile}"><g fill="${color}">${circles.join('')}</g></svg>`;
    return `url("data:image/svg+xml,${encodeSvg(svg)}")`;
}
function round(value) {
    return Math.round(value * 100) / 100;
}
/**
 * Percent-encode the characters that break inside a CSS `url("...")`, and
 * leave the rest readable. `encodeURIComponent` would work but makes the
 * value four times longer and impossible to debug by eye.
 */
function encodeSvg(svg) {
    return svg
        .replace(/%/g, '%25')
        .replace(/#/g, '%23')
        .replace(/"/g, "'")
        .replace(/</g, '%3C')
        .replace(/>/g, '%3E')
        .replace(/\s{2,}/g, ' ');
}
