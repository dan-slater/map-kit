import type { Snippet } from 'svelte';
import './tokens.css';
declare function $$render<T = unknown>(): {
    props: {
        /** The thing the panel is about, usually the selected pin. */
        item?: T | null;
        /** Two-way open state. */
        open?: boolean;
        /** Which edge the panel sits on. Below 640px it becomes a bottom sheet either way. */
        position?: "left" | "right";
        /** Heading text. Ignored when you supply a `header` snippet. */
        title?: string;
        /** Show the close button. Default `true`. */
        closable?: boolean;
        /** Extra classes on the panel element. */
        class?: string;
        /** Accessible label when there is no visible title. */
        label?: string;
        onclose?: () => void;
        /** Replaces the whole header, title and close button included. */
        header?: Snippet<[T | null]>;
        /** The body, given the non-null item. */
        children?: Snippet<[T]>;
        /** Shown instead of `children` when `item` is null or undefined. */
        empty?: Snippet;
        /** Pinned below the body. */
        footer?: Snippet<[T | null]>;
    };
    exports: {};
    bindings: "open";
    slots: {};
    events: {};
};
declare class __sveltets_Render<T = unknown> {
    props(): ReturnType<typeof $$render<T>>['props'];
    events(): ReturnType<typeof $$render<T>>['events'];
    slots(): ReturnType<typeof $$render<T>>['slots'];
    bindings(): "open";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <T = unknown>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<T>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<T>['props']>, ReturnType<__sveltets_Render<T>['events']>, ReturnType<__sveltets_Render<T>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<T>['bindings']>;
    } & ReturnType<__sveltets_Render<T>['exports']>;
    <T = unknown>(internal: unknown, props: ReturnType<__sveltets_Render<T>['props']> & {}): ReturnType<__sveltets_Render<T>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Panel: $$IsomorphicComponent;
type Panel<T = unknown> = InstanceType<typeof Panel<T>>;
export default Panel;
