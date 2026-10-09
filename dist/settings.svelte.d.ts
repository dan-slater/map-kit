import { type BasemapTheme } from './theme.js';
import { type ThemeName } from './themes.js';
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
export declare function mapSettings(initial?: MapSettingsInit): MapSettings;
