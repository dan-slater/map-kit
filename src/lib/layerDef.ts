import type { LayerSpecification } from 'maplibre-gl';

/** `Omit` over a union keeps only the shared keys, so distribute it first. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * A MapLibre layer specification without `id` and `source`: `<Layer>` supplies
 * both. Everything else, `type`, `paint`, `layout`, `filter`, `minzoom`, is the
 * ordinary MapLibre style spec.
 */
export type LayerDef = DistributiveOmit<LayerSpecification, 'id' | 'source'> & {
	/** Override the generated layer id. */
	id?: string;
};
