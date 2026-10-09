/**
 * @dan-slater/map-kit
 *
 * Svelte 5 components over MapLibre GL JS and OpenFreeMap vector tiles.
 * Domain-agnostic: the components know about coordinates, not about what you
 * are mapping.
 */

// Components
export { default as Map } from './Map.svelte';
export { default as Pins } from './Pins.svelte';
export { default as Panel } from './Panel.svelte';
export { default as Layer } from './Layer.svelte';
export { default as Overlay } from './Overlay.svelte';

// Camera
export { flyTo } from './flyTo.js';
export type { FlyToOptions } from './flyTo.js';

// Geometry
export {
	enuFrame,
	wrapLongitude,
	distanceMeters,
	polylineLength,
	simplifyPolyline
} from './geo.js';
export type { EnuFrame, Meters, LonLat } from './geo.js';

// Tile queries
export { coastlineNear, vectorSourceIds } from './coastline.js';
export type {
	CoastlineNearOptions,
	CoastlinePolyline,
	CoastlineResult,
	CoastlineStats
} from './coastline.js';

// Map helpers
export { metersPerPixel, isLocationOccluded, waitForIdle } from './mapUtils.js';

// GeoJSON helpers
export { circle, points, linesFromMeters, cssToken } from './shapes.js';
export type { FeatureCollection } from './shapes.js';

// Styles
export { OPENFREEMAP_STYLES, resolveStyle } from './styles.js';
export type { MapStyleName, MapStyleInput } from './styles.js';

// Context, for building your own map-aware components
export { useMap, useMapOptional } from './context.js';
export type { MapContext } from './context.js';

// Types
export type { Pin, PinAnchor, MapPointerEvent, MapCamera } from './types.js';
export type { LayerDef } from './layerDef.js';
export type { OverlayFrame, OverlayGpu, OverlayMode, OverlayDrawReason } from './overlay.js';
