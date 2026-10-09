import { type Snippet } from 'svelte';
import './tokens.css';
import type { Pin, PinAnchor } from './types.js';
declare function $$render<P = Record<string, unknown>>(): {
    props: {
        /** The pins to draw. `props` is passed through untouched. */
        pins: Pin<P>[];
        /** Id of the selected pin, or `null`. Two-way. */
        selected?: (string | number) | null;
        /** The selected pin itself, kept in sync with `selected`. Read it, do not set it. */
        selectedPin?: Pin<P> | null;
        /** Id of the hovered pin, or `null`. Two-way. */
        hovered?: (string | number) | null;
        /** Which part of the pin sits on its coordinate. Default `'bottom'`. */
        anchor?: PinAnchor;
        /** Clicking the selected pin clears the selection. Default `true`. */
        toggle?: boolean;
        /** Fade pins that are behind the planet under globe projection. Default `true`. */
        hideOccluded?: boolean;
        /** Extra classes on the wrapper. */
        class?: string;
        /** Accessible label for a pin. Defaults to `props.name`, then the id. */
        label?: (pin: Pin<P>) => string;
        onselect?: (pin: Pin<P> | null) => void;
        onpinclick?: (pin: Pin<P>, event: MouseEvent) => void;
        onpinenter?: (pin: Pin<P>) => void;
        onpinleave?: (pin: Pin<P>) => void;
        /** Replace the default marker. Receives the pin and its current state. */
        pin?: Snippet<[Pin<P>, {
            selected: boolean;
            hovered: boolean;
            index: number;
        }]>;
    };
    exports: {};
    bindings: "selected" | "selectedPin" | "hovered";
    slots: {};
    events: {};
};
declare class __sveltets_Render<P = Record<string, unknown>> {
    props(): ReturnType<typeof $$render<P>>['props'];
    events(): ReturnType<typeof $$render<P>>['events'];
    slots(): ReturnType<typeof $$render<P>>['slots'];
    bindings(): "selected" | "selectedPin" | "hovered";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <P = Record<string, unknown>>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<P>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<P>['props']>, ReturnType<__sveltets_Render<P>['events']>, ReturnType<__sveltets_Render<P>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<P>['bindings']>;
    } & ReturnType<__sveltets_Render<P>['exports']>;
    <P = Record<string, unknown>>(internal: unknown, props: ReturnType<__sveltets_Render<P>['props']> & {}): ReturnType<__sveltets_Render<P>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Pins: $$IsomorphicComponent;
type Pins<P = Record<string, unknown>> = InstanceType<typeof Pins<P>>;
export default Pins;
