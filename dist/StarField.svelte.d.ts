type Props = {
    /** Stars per tile. Default 90. */
    count?: number;
    /** Tile size in CSS pixels. Default 420. */
    tile?: number;
    /** Star colour. Default white. */
    color?: string;
    /** Largest star radius in pixels. Default 1.1. */
    maxRadius?: number;
    /** Brightest star opacity, 0 to 1. Default 0.85. */
    maxOpacity?: number;
    /** Same seed, same sky. Default 1. */
    seed?: number;
};
declare const StarField: import("svelte").Component<Props, {}, "">;
type StarField = ReturnType<typeof StarField>;
export default StarField;
