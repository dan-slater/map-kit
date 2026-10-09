import { tokensFor, type BasemapTheme } from './theme.js';
import { themeByName, themeNameOf, type ThemeName } from './themes.js';

/**
 * Which globe effects are on. Every one is off by default, matching the
 * components themselves.
 */
export type GlobeEffects = {
	glow: boolean;
	stars: boolean;
	graticule: boolean;
	autoRotate: boolean;
	sweep: boolean;
};

export type MapProjectionName = 'globe' | 'mercator';

export type MapSettingsInit = {
	/** A preset name, a theme of your own, or `null` for the stock style. */
	theme?: BasemapTheme | ThemeName | null;
	projection?: MapProjectionName;
	effects?: Partial<GlobeEffects>;
};

export type MapSettings = {
	/** The live theme object. Assign a preset name through `themeName`. */
	theme: BasemapTheme | null;
	/** The preset name, or `null` for no theme or a theme of your own. */
	themeName: ThemeName | null;
	projection: MapProjectionName;
	/** Mutate these directly: `settings.effects.glow = true`. */
	readonly effects: GlobeEffects;
	/** The theme's `--mk-` overrides, ready for a `style` attribute. */
	readonly tokens: string;
};

const NO_EFFECTS: GlobeEffects = {
	glow: false,
	stars: false,
	graticule: false,
	autoRotate: false,
	sweep: false
};

/**
 * A headless store for the handful of things a map settings UI changes.
 *
 * map-kit ships no settings UI of its own, because every app wants its
 * controls to look like the rest of the app. What it ships is this: somewhere
 * to keep the state, with the derived bits worked out for you. Wire it to your
 * own controls, or to the optional `<Controls>` component.
 *
 * ```svelte
 * <script lang="ts">
 *   import { Map, mapSettings, themes } from '@dan-slater/map-kit';
 *   const settings = mapSettings({ theme: 'ink' });
 * </script>
 *
 * <div style={settings.tokens}>
 *   <Map bind:theme={settings.theme} bind:projection={settings.projection}>
 *     {#snippet children()}
 *       {#if settings.effects.glow}<GlobeGlow />{/if}
 *     {/snippet}
 *   </Map>
 * </div>
 *
 * <button onclick={() => (settings.themeName = 'paper')}>Paper</button>
 * ```
 *
 * Nothing here touches the DOM, the URL or storage. Persisting the settings,
 * or putting them in a query string, is the app's business and is a handful of
 * lines either way.
 */
export function mapSettings(initial: MapSettingsInit = {}): MapSettings {
	// $state.raw, not $state: a theme is a value object that gets replaced
	// wholesale, never edited in place. Deep state would hand out a proxy, and
	// a proxy is not identical to the preset it wraps, so `themeName` and
	// anything else comparing by identity would quietly stop matching.
	let theme = $state.raw<BasemapTheme | null>(resolve(initial.theme));
	let projection = $state<MapProjectionName>(initial.projection ?? 'globe');
	// Deep state here on purpose: `settings.effects.glow = true` has to work.
	const effects = $state<GlobeEffects>({ ...NO_EFFECTS, ...initial.effects });

	return {
		get theme() {
			return theme;
		},
		set theme(next: BasemapTheme | null) {
			theme = next ?? null;
		},
		get themeName() {
			return themeNameOf(theme);
		},
		set themeName(next: ThemeName | null) {
			theme = themeByName(next);
		},
		get projection() {
			return projection;
		},
		set projection(next: MapProjectionName) {
			projection = next;
		},
		get effects() {
			return effects;
		},
		get tokens() {
			return theme ? tokensFor(theme) : '';
		}
	};
}

function resolve(value: BasemapTheme | ThemeName | null | undefined): BasemapTheme | null {
	if (!value) return null;
	return typeof value === 'string' ? themeByName(value) : value;
}
