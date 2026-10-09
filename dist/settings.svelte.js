import { tokensFor } from './theme.js';
import { themeByName, themeNameOf } from './themes.js';
const NO_EFFECTS = {
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
export function mapSettings(initial = {}) {
    // $state.raw, not $state: a theme is a value object that gets replaced
    // wholesale, never edited in place. Deep state would hand out a proxy, and
    // a proxy is not identical to the preset it wraps, so `themeName` and
    // anything else comparing by identity would quietly stop matching.
    let theme = $state.raw(resolve(initial.theme));
    let projection = $state(initial.projection ?? 'globe');
    // Deep state here on purpose: `settings.effects.glow = true` has to work.
    const effects = $state({ ...NO_EFFECTS, ...initial.effects });
    return {
        get theme() {
            return theme;
        },
        set theme(next) {
            theme = next ?? null;
        },
        get themeName() {
            return themeNameOf(theme);
        },
        set themeName(next) {
            theme = themeByName(next);
        },
        get projection() {
            return projection;
        },
        set projection(next) {
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
function resolve(value) {
    if (!value)
        return null;
    return typeof value === 'string' ? themeByName(value) : value;
}
