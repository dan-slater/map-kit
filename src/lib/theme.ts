import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

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
	 * Inland water, when you want it distinct from the ocean. Tints anything
	 * whose `class` is not `ocean`, which is what gives a chart its pale
	 * shallows. OpenMapTiles carries no depth, so this is a class split rather
	 * than real bathymetry.
	 */
	waterShallow?: string | null;
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

type AnyLayer = LayerSpecification & {
	'source-layer'?: string;
	paint?: Record<string, unknown>;
	layout?: Record<string, unknown>;
	minzoom?: number;
};

type Group =
	| 'background'
	| 'hillshade'
	| 'water'
	| 'waterway'
	| 'landcover'
	| 'landuse'
	| 'park'
	| 'building'
	| 'boundary'
	| 'road'
	| 'labelPlace'
	| 'labelRoad'
	| 'labelPoi'
	| 'labelWater'
	| 'other';

/** Which OpenMapTiles group a layer belongs to. */
function groupOf(layer: AnyLayer): Group {
	if (layer.type === 'background') return 'background';
	if (layer.type === 'raster') return 'hillshade';

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
export function themeStyle(style: StyleSpecification, theme: BasemapTheme): StyleSpecification {
	const next: StyleSpecification = structuredClone(style);
	const waterSource = firstVectorSource(next);
	const out: AnyLayer[] = [];

	for (const original of next.layers as AnyLayer[]) {
		const layer = themeLayer(original, theme);
		if (layer) out.push(layer);

		// The coastline hairline goes straight on top of the water fill, under
		// everything else, so land and labels still cover it where they should.
		if (
			theme.coastline &&
			waterSource &&
			original['source-layer'] === 'water' &&
			original.type === 'fill'
		) {
			out.push(coastlineLayer(theme, waterSource));
		}
	}

	next.layers = out as LayerSpecification[];
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

function firstVectorSource(style: StyleSpecification): string | null {
	for (const [id, source] of Object.entries(style.sources ?? {})) {
		if (source?.type === 'vector') return id;
	}
	return null;
}

function coastlineLayer(theme: BasemapTheme, source: string): AnyLayer {
	const width = theme.coastlineWidth ?? 1;
	return {
		id: 'mk-coastline',
		type: 'line',
		source,
		'source-layer': 'water',
		layout: { 'line-join': 'round' },
		paint: {
			'line-color': theme.coastline as string,
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
	} as AnyLayer;
}

/** Returns the themed layer, or null to drop it from the style. */
function themeLayer(layer: AnyLayer, theme: BasemapTheme): AnyLayer | null {
	const group = groupOf(layer);
	const paint = { ...(layer.paint ?? {}) };
	const layout = { ...(layout_(layer) ?? {}) };
	const next: AnyLayer = { ...layer, paint, layout };

	// Stock sprite textures never match a theme, so a patterned fill is always
	// worse than the flat colour underneath it.
	if ('fill-pattern' in paint || 'line-pattern' in paint) return null;

	switch (group) {
		case 'background':
			paint['background-color'] = theme.land;
			return next;

		case 'hillshade':
			if (theme.hillshadeOpacity <= 0) return null;
			paint['raster-opacity'] = theme.hillshadeOpacity;
			return next;

		case 'water':
			paint['fill-color'] = theme.waterShallow
				? ['match', ['get', 'class'], 'ocean', theme.water, theme.waterShallow]
				: theme.water;
			return next;

		case 'waterway': {
			const colour = theme.waterway ?? theme.water;
			if (colour === null) return null;
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
			if (theme.parks === null) return null;
			recolourKeys(paint, ['fill-color', 'fill-outline-color', 'line-color'], theme.parks);
			return next;

		case 'building':
			if (theme.buildings === null) return null;
			recolourKeys(
				paint,
				['fill-color', 'fill-outline-color', 'fill-extrusion-color'],
				theme.buildings
			);
			return next;

		case 'boundary':
			if (theme.boundaries === null) return null;
			recolourKeys(paint, ['line-color'], theme.boundaries);
			if (theme.boundaryDash === null) delete paint['line-dasharray'];
			else if (theme.boundaryDash) paint['line-dasharray'] = theme.boundaryDash;
			return next;

		case 'road': {
			if (theme.roads === null) return null;
			const isCasing = /casing|outline/.test(layer.id);
			const colour = (isCasing ? (theme.roadCasing ?? theme.roads) : theme.roads) as string;
			recolourKeys(paint, ['line-color', 'fill-color', 'fill-outline-color'], colour);
			if (theme.roadMinZoom !== undefined) {
				next.minzoom = Math.max(layer.minzoom ?? 0, theme.roadMinZoom);
			}
			return next;
		}

		case 'labelPlace':
			if (theme.labelDensity === 'none') return null;
			if (theme.labelDensity === 'sparse' && !SPARSE_PLACE_LAYERS.test(layer.id)) return null;
			return themeLabel(next, paint, layout, theme, theme.labelText);

		case 'labelWater':
			if (theme.labelDensity === 'none') return null;
			return themeLabel(next, paint, layout, theme, theme.labelWater ?? theme.labelText);

		case 'labelRoad':
		case 'labelPoi':
			if (theme.labelDensity !== 'full') return null;
			return themeLabel(next, paint, layout, theme, theme.labelText);

		default:
			return next;
	}
}

/** `layout` is absent on some layer types in the spec's union. */
function layout_(layer: AnyLayer): Record<string, unknown> | undefined {
	return layer.layout as Record<string, unknown> | undefined;
}

function themeLabel(
	next: AnyLayer,
	paint: Record<string, unknown>,
	layout: Record<string, unknown>,
	theme: BasemapTheme,
	colour: string
): AnyLayer {
	recolourKeys(paint, ['text-color', 'icon-color'], colour);
	recolourKeys(paint, ['text-halo-color', 'icon-halo-color'], theme.labelHalo);
	if (theme.fontStack && layout['text-font']) layout['text-font'] = [...theme.fontStack];
	if (theme.labelUppercase) layout['text-transform'] = 'uppercase';
	if (theme.labelLetterSpacing !== undefined) {
		layout['text-letter-spacing'] = theme.labelLetterSpacing;
	}
	return next;
}

function recolourKeys(
	paint: Record<string, unknown>,
	keys: string[],
	colour: string
): void {
	for (const key of keys) {
		if (!(key in paint)) continue;
		paint[key] = recolour(paint[key], colour);
	}
}

/**
 * Swap every colour inside a paint value for `colour`, keeping the shape of
 * whatever expression it sits in and the alpha it already had.
 */
function recolour(value: unknown, colour: string): unknown {
	if (typeof value === 'string') return isColour(value) ? withAlphaOf(value, colour) : value;
	if (Array.isArray(value)) return value.map((item) => recolour(item, colour));
	return value;
}

const COLOUR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;

function isColour(value: string): boolean {
	return COLOUR_PATTERN.test(value.trim());
}

/** Apply the alpha of `original` to `colour`. */
function withAlphaOf(original: string, colour: string): string {
	const from = parseColour(original);
	if (!from || from.a >= 0.999) return colour;
	const to = parseColour(colour);
	if (!to) return colour;
	const alpha = Math.round(from.a * to.a * 1000) / 1000;
	return `rgba(${to.r}, ${to.g}, ${to.b}, ${alpha})`;
}

type Rgba = { r: number; g: number; b: number; a: number };

export function parseColour(input: string): Rgba | null {
	const value = input.trim().toLowerCase();

	if (value.startsWith('#')) {
		const hex = value.slice(1);
		const expand = (c: string) => parseInt(c.length === 1 ? c + c : c, 16);
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
	if (!parts) return null;
	const numbers = parts[2]
		.split(/[\s,/]+/)
		.filter(Boolean)
		.map((n) => (n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n)));
	if (numbers.length < 3 || numbers.some(Number.isNaN)) return null;

	const alpha = numbers.length > 3 ? numbers[3] : 1;
	if (parts[1].startsWith('rgb')) {
		return { r: numbers[0], g: numbers[1], b: numbers[2], a: alpha };
	}
	// The matcher divided the percentages already; hue stays in degrees.
	return { ...hslToRgb(numbers[0], numbers[1], numbers[2]), a: alpha };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	const hue = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] =
		hue < 60
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
export function tokensFor(theme: BasemapTheme): string {
	return Object.entries(theme.tokens ?? {})
		.map(([name, value]) => `${name}: ${value};`)
		.join(' ');
}
