type Props = {
    /** Rim colour. Pass the theme's accent. Default a cool teal. */
    color?: string;
    /** Peak opacity of the rim, 0 to 1. Default 0.55. */
    intensity?: number;
    /** Band width as a fraction of the globe's radius. Default 0.12. */
    thickness?: number;
    /**
     * Stop drawing above this zoom. By then the limb is off-screen and the
     * radius estimate stops being meaningful. Default 5.
     */
    maxZoom?: number;
    /** Extra classes on the canvas. */
    class?: string;
};
declare const GlobeGlow: import("svelte").Component<Props, {}, "">;
type GlobeGlow = ReturnType<typeof GlobeGlow>;
export default GlobeGlow;
