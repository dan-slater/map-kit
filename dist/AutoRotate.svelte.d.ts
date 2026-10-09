type Props = {
    /** Turn the rotation on. Default `true`: mount the component to opt in. */
    enabled?: boolean;
    /** Degrees of longitude per second. Negative spins the other way. Default 2. */
    degreesPerSecond?: number;
    /** How long the map must be still before rotation resumes. Default 4000 ms. */
    idleMs?: number;
    /** Stop rotating above this zoom, where a spin is disorienting. Default 4. */
    maxZoom?: number;
    /** Called when the rotation starts or stops, for a UI indicator. */
    onchange?: (spinning: boolean) => void;
};
declare const AutoRotate: import("svelte").Component<Props, {}, "">;
type AutoRotate = ReturnType<typeof AutoRotate>;
export default AutoRotate;
