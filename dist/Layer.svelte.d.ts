import type { GeoJSONSourceSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { LayerDef } from './layerDef.js';
type Props = {
    /** Id for the source, and the basis for the layer ids. Must be unique in the style. */
    id: string;
    /** GeoJSON object, or a URL to one. */
    data: GeoJSONSourceSpecification['data'];
    /** A single layer drawn from the source. */
    layer?: LayerDef;
    /** Several layers drawn from the same source, for example a fill plus an outline. */
    layers?: LayerDef[];
    /** Two-way visibility toggle. */
    visible?: boolean;
    /** Insert below this existing layer id, when it exists. */
    before?: string;
    /** Extra GeoJSON source options, for example `cluster: true`. */
    source?: Partial<Omit<GeoJSONSourceSpecification, 'type' | 'data'>>;
    /** Called with the layer ids once they are on the map. */
    onadd?: (layerIds: string[], map: MapLibreMap) => void;
};
declare const Layer: import("svelte").Component<Props, {}, "visible">;
type Layer = ReturnType<typeof Layer>;
export default Layer;
