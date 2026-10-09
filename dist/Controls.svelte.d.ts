import type { Snippet } from 'svelte';
import './tokens.css';
import type { BasemapTheme } from './theme.js';
type Props = {
    /** Two-way. Bind to `settings.theme` or straight to `<Map bind:theme>`. */
    theme?: BasemapTheme | null;
    /** Two-way. */
    projection?: 'globe' | 'mercator';
    /** Themes to offer. Defaults to the four built in. */
    themes?: Record<string, BasemapTheme>;
    /** Offer a "none" option that drops the theme. Default `true`. */
    allowNoTheme?: boolean;
    /** Heading. Omit for no heading. */
    title?: string;
    /** Which corner to sit in when placed inside `<Map>`. Default `'top-left'`. */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** Hide the theme picker. */
    showTheme?: boolean;
    /** Hide the projection toggle. */
    showProjection?: boolean;
    /** Extra classes. */
    class?: string;
    /** Your own controls, below the built-in ones. */
    children?: Snippet;
};
declare const Controls: import("svelte").Component<Props, {}, "theme" | "projection">;
type Controls = ReturnType<typeof Controls>;
export default Controls;
