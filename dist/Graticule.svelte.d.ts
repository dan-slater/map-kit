type Props = {
    /** Source and layer id. Change it only if it clashes with your style. */
    id?: string;
    /** Spacing between lines, degrees. Default 10. */
    step?: number;
    /** Line colour. Default a dim slate. */
    color?: string;
    /** Line width in pixels. Default 0.5. */
    width?: number;
    /** Opacity at full strength, 0 to 1. Default 0.35. */
    opacity?: number;
    /** Fully visible at or below this zoom. Default 3. */
    fadeFromZoom?: number;
    /** Gone at or above this zoom. Default 6. */
    fadeToZoom?: number;
    /** Two-way visibility toggle. */
    visible?: boolean;
    /** Insert below this existing layer id, when it exists. */
    before?: string;
};
declare const Graticule: import("svelte").Component<Props, {}, "visible">;
type Graticule = ReturnType<typeof Graticule>;
export default Graticule;
