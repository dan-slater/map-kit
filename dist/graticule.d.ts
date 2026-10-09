import type { FeatureCollection } from 'geojson';
export type GraticuleOptions = {
    /** Spacing between lines, degrees. Default 10. */
    step?: number;
    /**
     * Stop meridians this far from the equator. Default 85, just short of the
     * Web Mercator limit, so the lines do not shoot off to infinity.
     */
    latLimit?: number;
    /**
     * Distance between vertices along each line, degrees. Default 5. A
     * graticule drawn with two points per line would cut straight across the
     * globe instead of following its curve, so the lines are densified.
     */
    densifyDegrees?: number;
};
/**
 * Meridians and parallels as GeoJSON, for `<Graticule>`.
 *
 * Pure and deterministic, so it can be built once and handed to a `<Layer>`.
 * Each feature carries `kind` (`'meridian'` or `'parallel'`) and `degrees`, so
 * a style can pick out the equator or the prime meridian with a filter.
 */
export declare function graticuleGeoJSON(options?: GraticuleOptions): FeatureCollection;
