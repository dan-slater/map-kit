/** Which OpenMapTiles group a layer belongs to. */
function groupOf(layer) {
    if (layer.type === 'background')
        return 'background';
    if (layer.type === 'raster')
        return 'hillshade';
    switch (layer['source-layer']) {
        case 'water':
            return 'water';
        case 'waterway':
            return layer.type === 'symbol' ? 'labelWater' : 'waterway';
        case 'water_name':
            return 'labelWater';
        case 'landcover':
            return 'landcover';
        case 'landuse':
            return 'landuse';
        case 'park':
            return 'park';
        case 'building':
            return 'building';
        case 'boundary':
            return 'boundary';
        case 'transportation':
        case 'aeroway':
            return 'road';
        case 'transportation_name':
            return 'labelRoad';
        case 'place':
            return 'labelPlace';
        case 'poi':
        case 'aerodrome_label':
            return 'labelPoi';
        default:
            return 'other';
    }
}
/** Place labels a sparse theme keeps: countries, states and real cities. */
const SPARSE_PLACE_LAYERS = /^(label_country|label_state|label_city|label_town)/;
/**
 * Apply a theme to a fetched style.
 *
 * Returns a new style; the input is not modified. Hand it to `<Map theme>`
 * rather than calling it yourself unless you are doing something unusual.
 */
export function themeStyle(style, theme) {
    const next = structuredClone(style);
    const waterSource = firstVectorSource(next);
    const out = [];
    // A style with no layers is unusual but not an error: it still gets a sky.
    const layers = Array.isArray(next.layers) ? next.layers : [];
    for (const original of layers) {
        const layer = themeLayer(original, theme);
        if (layer)
            out.push(layer);
        // The coastline hairline goes straight on top of the water fill, under
        // everything else, so land and labels still cover it where they should.
        if (theme.coastline &&
            waterSource &&
            original['source-layer'] === 'water' &&
            original.type === 'fill') {
            out.push(coastlineLayer(theme, waterSource));
        }
    }
    next.layers = out;
    next.sky = {
        'sky-color': theme.sky.space,
        'horizon-color': theme.sky.halo,
        'fog-color': theme.sky.halo,
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.5,
        'atmosphere-blend': theme.sky.blend ?? 0.8
    };
    return next;
}
function firstVectorSource(style) {
    for (const [id, source] of Object.entries(style.sources ?? {})) {
        if (source?.type === 'vector')
            return id;
    }
    return null;
}
function coastlineLayer(theme, source) {
    const width = theme.coastlineWidth ?? 1;
    return {
        id: 'mk-coastline',
        type: 'line',
        source,
        'source-layer': 'water',
        layout: { 'line-join': 'round' },
        paint: {
            'line-color': theme.coastline,
            'line-blur': theme.coastlineBlur ?? 0,
            'line-width': [
                'interpolate',
                ['exponential', 1.3],
                ['zoom'],
                2,
                width * 0.4,
                10,
                width,
                16,
                width * 2.2
            ]
        }
    };
}
/** Returns the themed layer, or null to drop it from the style. */
function themeLayer(layer, theme) {
    const group = groupOf(layer);
    // A layer this function does not recognise is passed through untouched,
    // including its own paint and layout objects. Themes only ever change the
    // OpenMapTiles groups they know about, so a consumer's own layers, a
    // custom source, or a future OpenMapTiles layer all survive a theme
    // unchanged rather than being recoloured by guesswork or dropped.
    if (group === 'other')
        return layer;
    const paint = { ...(layer.paint ?? {}) };
    const layout = { ...(layout_(layer) ?? {}) };
    const next = { ...layer, paint, layout };
    // Stock sprite textures never match a theme, so a patterned fill is always
    // worse than the flat colour underneath it.
    if ('fill-pattern' in paint || 'line-pattern' in paint)
        return null;
    switch (group) {
        case 'background':
            paint['background-color'] = theme.land;
            return next;
        case 'hillshade':
            if (theme.hillshadeOpacity <= 0)
                return null;
            paint['raster-opacity'] = theme.hillshadeOpacity;
            return next;
        case 'water':
            paint['fill-color'] = theme.waterInland
                ? ['match', ['get', 'class'], 'ocean', theme.water, theme.waterInland]
                : theme.water;
            return next;
        case 'waterway': {
            const colour = theme.waterway ?? theme.water;
            if (colour === null)
                return null;
            recolourKeys(paint, ['line-color'], colour);
            return next;
        }
        case 'landcover':
            recolourKeys(paint, ['fill-color', 'fill-outline-color'], theme.landLow);
            return next;
        case 'landuse':
            recolourKeys(paint, ['fill-color', 'fill-outline-color'], theme.landHigh);
            return next;
        case 'park':
            if (theme.parks === null)
                return null;
            recolourKeys(paint, ['fill-color', 'fill-outline-color', 'line-color'], theme.parks);
            return next;
        case 'building':
            if (theme.buildings === null)
                return null;
            recolourKeys(paint, ['fill-color', 'fill-outline-color', 'fill-extrusion-color'], theme.buildings);
            return next;
        case 'boundary':
            if (theme.boundaries === null)
                return null;
            recolourKeys(paint, ['line-color'], theme.boundaries);
            if (theme.boundaryDash === null)
                delete paint['line-dasharray'];
            else if (theme.boundaryDash)
                paint['line-dasharray'] = theme.boundaryDash;
            return next;
        case 'road': {
            if (theme.roads === null)
                return null;
            const isCasing = /casing|outline/.test(layer.id);
            const colour = (isCasing ? (theme.roadCasing ?? theme.roads) : theme.roads);
            recolourKeys(paint, ['line-color', 'fill-color', 'fill-outline-color'], colour);
            if (theme.roadMinZoom !== undefined) {
                next.minzoom = Math.max(layer.minzoom ?? 0, theme.roadMinZoom);
            }
            return next;
        }
        case 'labelPlace':
            if (theme.labelDensity === 'none')
                return null;
            if (theme.labelDensity === 'sparse' && !SPARSE_PLACE_LAYERS.test(layer.id))
                return null;
            return themeLabel(next, paint, layout, theme, theme.labelText);
        case 'labelWater':
            if (theme.labelDensity === 'none')
                return null;
            return themeLabel(next, paint, layout, theme, theme.labelWater ?? theme.labelText);
        case 'labelRoad':
        case 'labelPoi':
            if (theme.labelDensity !== 'full')
                return null;
            return themeLabel(next, paint, layout, theme, theme.labelText);
        default:
            // Unreachable: 'other' returned early. Kept so adding a group to the
            // union is a type error here rather than a silent pass-through.
            return next;
    }
}
/** `layout` is absent on some layer types in the spec's union. */
function layout_(layer) {
    return layer.layout;
}
function themeLabel(next, paint, layout, theme, colour) {
    recolourKeys(paint, ['text-color', 'icon-color'], colour);
    recolourKeys(paint, ['text-halo-color', 'icon-halo-color'], theme.labelHalo);
    if (theme.fontStack && layout['text-font'])
        layout['text-font'] = [...theme.fontStack];
    if (theme.labelUppercase)
        layout['text-transform'] = 'uppercase';
    if (theme.labelLetterSpacing !== undefined) {
        layout['text-letter-spacing'] = theme.labelLetterSpacing;
    }
    return next;
}
function recolourKeys(paint, keys, colour) {
    for (const key of keys) {
        if (!(key in paint))
            continue;
        paint[key] = recolour(paint[key], colour);
    }
}
/**
 * Swap every colour inside a paint value for `colour`, keeping the shape of
 * whatever expression it sits in and the alpha it already had.
 */
function recolour(value, colour) {
    if (typeof value === 'string')
        return isColour(value) ? withAlphaOf(value, colour) : value;
    if (Array.isArray(value))
        return value.map((item) => recolour(item, colour));
    return value;
}
const COLOUR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
function isColour(value) {
    return COLOUR_PATTERN.test(value.trim());
}
/** Apply the alpha of `original` to `colour`. */
function withAlphaOf(original, colour) {
    const from = parseColour(original);
    if (!from || from.a >= 0.999)
        return colour;
    const to = parseColour(colour);
    if (!to)
        return colour;
    const alpha = Math.round(from.a * to.a * 1000) / 1000;
    return `rgba(${to.r}, ${to.g}, ${to.b}, ${alpha})`;
}
export function parseColour(input) {
    const value = input.trim().toLowerCase();
    if (value.startsWith('#')) {
        const hex = value.slice(1);
        const expand = (c) => parseInt(c.length === 1 ? c + c : c, 16);
        if (hex.length === 3 || hex.length === 4) {
            return {
                r: expand(hex[0]),
                g: expand(hex[1]),
                b: expand(hex[2]),
                a: hex.length === 4 ? expand(hex[3]) / 255 : 1
            };
        }
        if (hex.length === 6 || hex.length === 8) {
            return {
                r: expand(hex.slice(0, 2)),
                g: expand(hex.slice(2, 4)),
                b: expand(hex.slice(4, 6)),
                a: hex.length === 8 ? expand(hex.slice(6, 8)) / 255 : 1
            };
        }
        return null;
    }
    const parts = value.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
    if (!parts)
        return null;
    const numbers = parts[2]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map((n) => (n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n)));
    if (numbers.length < 3 || numbers.some(Number.isNaN))
        return null;
    const alpha = numbers.length > 3 ? numbers[3] : 1;
    if (parts[1].startsWith('rgb')) {
        return { r: numbers[0], g: numbers[1], b: numbers[2], a: alpha };
    }
    // The matcher divided the percentages already; hue stays in degrees.
    return { ...hslToRgb(numbers[0], numbers[1], numbers[2]), a: alpha };
}
function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = hue < 60
        ? [c, x, 0]
        : hue < 120
            ? [x, c, 0]
            : hue < 180
                ? [0, c, x]
                : hue < 240
                    ? [0, x, c]
                    : hue < 300
                        ? [x, 0, c]
                        : [c, 0, x];
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}
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
export function tokensFor(theme) {
    return Object.entries(theme.tokens ?? {})
        .map(([name, value]) => `${name}: ${value};`)
        .join(' ');
}
