import { describe, expect, test } from 'bun:test';
import { tokensFor, type BasemapTheme } from '../src/lib/theme.js';
import { chart, ink, mono, paper, themeByName, themeNameOf, themes } from '../src/lib/themes.js';

/*
 * `mapSettings()` itself lives in a .svelte.ts file and needs the Svelte
 * compiler for its runes, so it is exercised in the browser by
 * scripts/verify.mjs through the demo's <Controls>. What is tested here is
 * everything the store is built out of, which is where the logic actually is.
 */

describe('themeNameOf', () => {
	test('names each preset', () => {
		expect(themeNameOf(ink)).toBe('ink');
		expect(themeNameOf(paper)).toBe('paper');
		expect(themeNameOf(chart)).toBe('chart');
		expect(themeNameOf(mono)).toBe('mono');
	});

	test('null and undefined have no name', () => {
		expect(themeNameOf(null)).toBeNull();
		expect(themeNameOf(undefined)).toBeNull();
	});

	test('a theme of your own has no name, even a copy of a preset', () => {
		const mine: BasemapTheme = { ...ink, water: '#000000' };
		expect(themeNameOf(mine)).toBeNull();

		// A structural clone is still not the preset: identity is the test, so
		// a settings UI shows "custom" rather than claiming to be ink.
		const clone: BasemapTheme = { ...ink };
		expect(themeNameOf(clone)).toBeNull();
	});

	test('round-trips through themeByName for every preset', () => {
		for (const name of Object.keys(themes) as (keyof typeof themes)[]) {
			const theme = themeByName(name)!;
			expect(themeNameOf(theme)).toBe(name);
		}
	});
});

describe('themeByName', () => {
	test('returns the preset object itself, not a copy', () => {
		expect(themeByName('ink')).toBe(ink);
	});

	test('an unknown or empty name gives null rather than throwing', () => {
		expect(themeByName('nope')).toBeNull();
		expect(themeByName('')).toBeNull();
		expect(themeByName(null)).toBeNull();
		expect(themeByName(undefined)).toBeNull();
	});
});

describe('tokensFor, as the settings store exposes it', () => {
	test('a theme gives a declaration list a style attribute can take', () => {
		const tokens = tokensFor(ink);
		expect(tokens).toContain('--mk-color-pin:');
		expect(tokens).toContain('--mk-map-background:');
		// No braces or selector: it is declarations, not a rule.
		expect(tokens).not.toContain('{');
		expect(tokens).not.toContain('}');
		expect(tokens.trim().endsWith(';')).toBe(true);
	});

	test('every preset produces usable tokens', () => {
		for (const [name, preset] of Object.entries(themes)) {
			const tokens = tokensFor(preset);
			expect(tokens.length, name).toBeGreaterThan(0);
			for (const declaration of tokens.split(';').filter((d) => d.trim())) {
				expect(declaration, name).toMatch(/^\s*--mk-[a-z0-9-]+:\s*.+$/);
			}
		}
	});
});
