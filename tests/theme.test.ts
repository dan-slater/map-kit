import { describe, expect, test } from 'bun:test';
import type { StyleSpecification } from 'maplibre-gl';
import { parseColour, themeStyle, tokensFor, type BasemapTheme } from '../src/lib/theme.js';
import { chart, ink, mono, paper, themes } from '../src/lib/themes.js';

/**
 * A theme written by hand rather than taken from the presets, which is the
 * case a consumer is actually in.
 */
const custom: BasemapTheme = {
	water: '#112233',
	land: '#445566',
	landLow: '#556677',
	landHigh: '#667788',
	parks: '#778899',
	roads: '#99aabb',
	buildings: '#aabbcc',
	boundaries: '#bbccdd',
	coastline: '#ff0000',
	labelText: '#eeeeee',
	labelHalo: '#000000',
	labelDensity: 'full',
	hillshadeOpacity: 0.5,
	sky: { space: '#010203', halo: '#040506' },
	tokens: { '--mk-color-pin': '#ff0000', '--mk-map-background': '#010203' }
};

type AnyLayer = Record<string, any>;

/** A miniature OpenMapTiles style, plus layers themeStyle has never heard of. */
function fixtureStyle(): StyleSpecification {
	return {
		version: 8,
		name: 'fixture',
		sources: {
			openmaptiles: { type: 'vector', url: 'https://example.invalid/tiles.json' },
			shaded: { type: 'raster', tiles: ['https://example.invalid/{z}/{x}/{y}.png'] },
			'my-data': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
		},
		layers: [
			{ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
			{ id: 'natural_earth', type: 'raster', source: 'shaded', paint: { 'raster-opacity': 0.6 } },
			{
				id: 'water',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'water',
				paint: { 'fill-color': 'rgb(158,189,255)' }
			},
			{
				id: 'landcover_wood',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'landcover',
				paint: { 'fill-color': 'hsla(98,61%,72%,0.7)', 'fill-opacity': 0.4 }
			},
			{
				id: 'landuse_residential',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'landuse',
				paint: {
					'fill-color': [
						'interpolate',
						['linear'],
						['zoom'],
						9,
						'hsla(0,3%,85%,0.84)',
						12,
						'hsla(35,57%,88%,0.49)'
					]
				}
			},
			{
				id: 'building',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'building',
				paint: { 'fill-color': 'hsl(35,8%,85%)' }
			},
			{
				id: 'highway-primary',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'transportation',
				minzoom: 5,
				paint: { 'line-color': '#fff', 'line-width': 2 }
			},
			{
				id: 'boundary_2',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'boundary',
				paint: { 'line-color': 'hsl(248,1%,41%)' }
			},
			{
				id: 'label_country_1',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'place',
				layout: { 'text-font': ['Noto Sans Bold'], 'text-field': ['get', 'name'] },
				paint: { 'text-color': '#000', 'text-halo-color': '#fff' }
			},
			{
				id: 'label_village',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'place',
				layout: { 'text-font': ['Noto Sans Regular'] },
				paint: { 'text-color': '#000', 'text-halo-color': '#fff' }
			},
			{
				id: 'poi_r20',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'poi',
				paint: { 'text-color': '#666', 'text-halo-color': '#ffffff' }
			},
			{
				id: 'water_name_point_label',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'water_name',
				paint: { 'text-color': '#495e91', 'text-halo-color': 'rgba(255,255,255,0.7)' }
			},
			{
				id: 'landcover_wetland',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'landcover',
				paint: { 'fill-pattern': 'wetland_bg_11', 'fill-opacity': 0.8 }
			},

			// Nothing below here is an OpenMapTiles layer themeStyle knows.
			{
				id: 'my-competitor-pins',
				type: 'circle',
				source: 'my-data',
				paint: { 'circle-color': '#ff00ff', 'circle-radius': 6 }
			},
			{
				id: 'future-openmaptiles-layer',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'something_new',
				paint: { 'fill-color': '#abcdef' }
			},
			{ id: 'bare-layer', type: 'line', source: 'my-data' }
		]
	} as unknown as StyleSpecification;
}

const layerById = (style: StyleSpecification, id: string): AnyLayer | undefined =>
	(style.layers as AnyLayer[]).find((l) => l.id === id);

const ids = (style: StyleSpecification) => (style.layers as AnyLayer[]).map((l) => l.id);

describe('a consumer-supplied theme', () => {
	test('a hand-written theme object works, not just a preset', () => {
		const themed = themeStyle(fixtureStyle(), custom);

		expect(layerById(themed, 'background')!.paint['background-color']).toBe('#445566');
		expect(layerById(themed, 'water')!.paint['fill-color']).toBe('#112233');
		expect(layerById(themed, 'building')!.paint['fill-color']).toBe('#aabbcc');
		expect(layerById(themed, 'boundary_2')!.paint['line-color']).toBe('#bbccdd');
		expect(layerById(themed, 'highway-primary')!.paint['line-color']).toBe('#99aabb');
		expect(layerById(themed, 'natural_earth')!.paint['raster-opacity']).toBe(0.5);
	});

	test('does not modify the style it is given', () => {
		const original = fixtureStyle();
		const snapshot = JSON.stringify(original);
		themeStyle(original, custom);
		expect(JSON.stringify(original)).toBe(snapshot);
	});

	test('sets the sky from the theme', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(themed.sky).toEqual({
			'sky-color': '#010203',
			'horizon-color': '#040506',
			'fog-color': '#040506',
			'sky-horizon-blend': 0.6,
			'horizon-fog-blend': 0.5,
			'atmosphere-blend': 0.8
		});
	});

	test('inserts the coastline hairline right after the water fill', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		const order = ids(themed);
		expect(order.indexOf('mk-coastline')).toBe(order.indexOf('water') + 1);

		const coastline = layerById(themed, 'mk-coastline')!;
		expect(coastline.paint['line-color']).toBe('#ff0000');
		expect(coastline.source).toBe('openmaptiles');
		expect(coastline['source-layer']).toBe('water');
	});

	test('no coastline layer when the theme does not ask for one', () => {
		const themed = themeStyle(fixtureStyle(), { ...custom, coastline: null });
		expect(ids(themed)).not.toContain('mk-coastline');
	});

	test('every preset applies without throwing', () => {
		for (const [name, preset] of Object.entries(themes)) {
			const themed = themeStyle(fixtureStyle(), preset);
			expect(themed.layers.length, name).toBeGreaterThan(0);
			expect(themed.sky, name).toBeTruthy();
		}
	});
});

describe('layers the theme does not know', () => {
	test('a consumer layer on a consumer source is untouched', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		const mine = layerById(themed, 'my-competitor-pins')!;
		expect(mine.paint['circle-color']).toBe('#ff00ff');
		expect(mine.paint['circle-radius']).toBe(6);
	});

	test('an unrecognised OpenMapTiles source-layer is untouched', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(layerById(themed, 'future-openmaptiles-layer')!.paint['fill-color']).toBe('#abcdef');
	});

	test('a layer with no paint or layout survives and gains nothing', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		const bare = layerById(themed, 'bare-layer')!;
		expect(bare).toBeDefined();
		expect(bare.paint).toBeUndefined();
		expect(bare.layout).toBeUndefined();
	});

	test('unknown layers survive every preset, including the ones that hide most things', () => {
		for (const [name, preset] of Object.entries(themes)) {
			const themed = themeStyle(fixtureStyle(), preset);
			expect(ids(themed), name).toContain('my-competitor-pins');
			expect(ids(themed), name).toContain('future-openmaptiles-layer');
			expect(ids(themed), name).toContain('bare-layer');
			expect(layerById(themed, 'my-competitor-pins')!.paint['circle-color'], name).toBe('#ff00ff');
		}
	});

	test('a style with no layers is themed without throwing', () => {
		const empty = { version: 8, sources: {}, layers: [] } as unknown as StyleSpecification;
		const themed = themeStyle(empty, custom);
		expect(themed.layers).toEqual([]);
		expect(themed.sky).toBeTruthy();
	});

	test('a style with no vector source gets no coastline but still themes', () => {
		const noVector = {
			version: 8,
			sources: { 'my-data': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
			layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }]
		} as unknown as StyleSpecification;
		const themed = themeStyle(noVector, custom);
		expect(ids(themed)).toEqual(['background']);
		expect(layerById(themed, 'background')!.paint['background-color']).toBe('#445566');
	});
});

describe('recolouring', () => {
	test('keeps the shape of a zoom-interpolated colour and replaces the stops', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		const value = layerById(themed, 'landuse_residential')!.paint['fill-color'];

		expect(Array.isArray(value)).toBe(true);
		expect(value[0]).toBe('interpolate');
		expect(value[1]).toEqual(['linear']);
		expect(value[2]).toEqual(['zoom']);
		expect(value[3]).toBe(9);
		expect(value[5]).toBe(12);
		// Both stops are now the theme colour, carrying their original alpha.
		expect(value[4]).toBe('rgba(102, 119, 136, 0.84)');
		expect(value[6]).toBe('rgba(102, 119, 136, 0.49)');
	});

	test('carries the original alpha onto the new colour', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		// hsla(...,0.7) becomes the landLow colour at the same alpha.
		expect(layerById(themed, 'landcover_wood')!.paint['fill-color']).toBe(
			'rgba(85, 102, 119, 0.7)'
		);
	});

	test('an opaque source colour stays opaque and is used verbatim', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(layerById(themed, 'building')!.paint['fill-color']).toBe('#aabbcc');
	});

	test('non-colour paint values are left alone', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(layerById(themed, 'highway-primary')!.paint['line-width']).toBe(2);
		expect(layerById(themed, 'landcover_wood')!.paint['fill-opacity']).toBe(0.4);
	});

	test('patterned fills are dropped rather than left with a stock sprite', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(ids(themed)).not.toContain('landcover_wetland');
	});
});

describe('hiding and thinning', () => {
	test('null groups are removed', () => {
		const stripped = themeStyle(fixtureStyle(), {
			...custom,
			roads: null,
			buildings: null,
			boundaries: null,
			parks: null,
			hillshadeOpacity: 0
		});
		const remaining = ids(stripped);
		expect(remaining).not.toContain('highway-primary');
		expect(remaining).not.toContain('building');
		expect(remaining).not.toContain('boundary_2');
		expect(remaining).not.toContain('natural_earth');
		expect(remaining).toContain('water');
	});

	test('roadMinZoom raises the layer minzoom without lowering it', () => {
		const late = themeStyle(fixtureStyle(), { ...custom, roadMinZoom: 11 });
		expect(layerById(late, 'highway-primary')!.minzoom).toBe(11);

		const early = themeStyle(fixtureStyle(), { ...custom, roadMinZoom: 2 });
		expect(layerById(early, 'highway-primary')!.minzoom).toBe(5);
	});

	test('labelDensity sparse keeps the big places and drops the rest', () => {
		const sparse = themeStyle(fixtureStyle(), { ...custom, labelDensity: 'sparse' });
		const remaining = ids(sparse);
		expect(remaining).toContain('label_country_1');
		expect(remaining).toContain('water_name_point_label');
		expect(remaining).not.toContain('label_village');
		expect(remaining).not.toContain('poi_r20');
	});

	test('labelDensity none drops every label', () => {
		const silent = themeStyle(fixtureStyle(), { ...custom, labelDensity: 'none' });
		const remaining = ids(silent);
		for (const id of ['label_country_1', 'label_village', 'poi_r20', 'water_name_point_label']) {
			expect(remaining).not.toContain(id);
		}
		expect(remaining).toContain('water');
	});

	test('fontStack, case and tracking reach the labels', () => {
		const themed = themeStyle(fixtureStyle(), {
			...custom,
			fontStack: ['Noto Sans Italic'],
			labelUppercase: true,
			labelLetterSpacing: 0.2
		});
		const label = layerById(themed, 'label_country_1')!;
		expect(label.layout['text-font']).toEqual(['Noto Sans Italic']);
		expect(label.layout['text-transform']).toBe('uppercase');
		expect(label.layout['text-letter-spacing']).toBe(0.2);
		// A layer with no text-font of its own does not gain one.
		expect(layerById(themed, 'poi_r20')!.layout['text-font']).toBeUndefined();
	});

	test('boundaryDash sets and clears the dash', () => {
		expect(
			layerById(themeStyle(fixtureStyle(), { ...custom, boundaryDash: [2, 3] }), 'boundary_2')!
				.paint['line-dasharray']
		).toEqual([2, 3]);
		expect(
			layerById(themeStyle(fixtureStyle(), { ...custom, boundaryDash: null }), 'boundary_2')!
				.paint['line-dasharray']
		).toBeUndefined();
	});
});

describe('inland water', () => {
	test('one colour for all water by default', () => {
		const themed = themeStyle(fixtureStyle(), custom);
		expect(layerById(themed, 'water')!.paint['fill-color']).toBe('#112233');
	});

	test('waterInland splits by feature class when a theme asks for it', () => {
		const themed = themeStyle(fixtureStyle(), { ...custom, waterInland: '#99ccdd' });
		expect(layerById(themed, 'water')!.paint['fill-color']).toEqual([
			'match',
			['get', 'class'],
			'ocean',
			'#112233',
			'#99ccdd'
		]);
	});

	test('no preset splits water: a lighter band would imply depth the data lacks', () => {
		for (const [name, preset] of Object.entries(themes)) {
			expect(preset.waterInland ?? null, name).toBeNull();
			const themed = themeStyle(fixtureStyle(), preset);
			expect(typeof layerById(themed, 'water')!.paint['fill-color'], name).toBe('string');
		}
	});
});

describe('tokensFor', () => {
	test('renders a declaration list for a style attribute', () => {
		expect(tokensFor(custom)).toBe('--mk-color-pin: #ff0000; --mk-map-background: #010203;');
	});

	test('a theme with no tokens gives an empty string', () => {
		expect(tokensFor({ ...custom, tokens: undefined })).toBe('');
	});

	test('every preset supplies a map background matching its sky', () => {
		for (const preset of [ink, paper, chart, mono]) {
			expect(preset.tokens?.['--mk-map-background']).toBe(preset.sky.space);
		}
	});
});

describe('parseColour', () => {
	test('hex, short hex and hex with alpha', () => {
		expect(parseColour('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(parseColour('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(parseColour('#ff000080')?.a).toBeCloseTo(0.502, 2);
	});

	test('rgb, rgba, hsl and hsla', () => {
		expect(parseColour('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
		expect(parseColour('rgba(10,20,30,0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
		expect(parseColour('hsl(0,100%,50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(parseColour('hsla(120,100%,50%,0.5)')).toEqual({ r: 0, g: 255, b: 0, a: 0.5 });
	});

	test('nonsense returns null rather than throwing', () => {
		expect(parseColour('not-a-colour')).toBeNull();
		expect(parseColour('#12345')).toBeNull();
		expect(parseColour('')).toBeNull();
	});
});
