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

// Globe effects. Each is opt-in: nothing happens until you mount it.
export { default as GlobeGlow } from './GlobeGlow.svelte';
export { default as Graticule } from './Graticule.svelte';
export { default as AutoRotate } from './AutoRotate.svelte';
export { default as StarField } from './StarField.svelte';

// Camera
export { flyTo, sweepTo } from './flyTo.js';
export type { FlyToOptions, SweepToOptions } from './flyTo.js';

// Geometry
export {
	enuFrame,
	destination,
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
	CoastlineStats,
	WaterSide
} from './coastline.js';

// Map helpers
export { metersPerPixel, isLocationOccluded, waitForIdle } from './mapUtils.js';

// GeoJSON helpers
export { graticuleGeoJSON } from './graticule.js';
export type { GraticuleOptions } from './graticule.js';
export { starFieldDataUri } from './starfield.js';
export type { StarFieldOptions } from './starfield.js';
export { circle, points, linesFromMeters, cssToken } from './shapes.js';
export type { FeatureCollection } from './shapes.js';

// Styles
export { OPENFREEMAP_STYLES, resolveStyle } from './styles.js';
export type { MapStyleName, MapStyleInput } from './styles.js';

// Basemap theming
export { themeStyle, tokensFor, parseColour } from './theme.js';
export type { BasemapTheme, LabelDensity } from './theme.js';
export { themes, ink, paper, chart, mono, THEME_NAMES, themeByName } from './themes.js';
export type { ThemeName } from './themes.js';

// Context, for building your own map-aware components
export { useMap, useMapOptional } from './context.js';
export type { MapContext } from './context.js';

// Types
export type { Pin, PinAnchor, MapPointerEvent, MapCamera } from './types.js';
export type { LayerDef } from './layerDef.js';
export { GPU_RENDER_ATTACHMENT, GPU_COPY_SRC } from './overlay.js';
export type { OverlayFrame, OverlayGpu, OverlayMode, OverlayDrawReason } from './overlay.js';
