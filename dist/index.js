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
// Settings. map-kit ships no settings UI by default: this is the state, plus
// one optional stock panel for consumers who do not want to write their own.
export { default as Controls } from './Controls.svelte';
export { mapSettings } from './settings.svelte.js';
// Camera
export { flyTo, sweepTo } from './flyTo.js';
// Geometry
export { enuFrame, destination, wrapLongitude, distanceMeters, polylineLength, simplifyPolyline } from './geo.js';
// Tile queries
export { coastlineNear, vectorSourceIds } from './coastline.js';
// Map helpers
export { metersPerPixel, isLocationOccluded, waitForIdle } from './mapUtils.js';
// GeoJSON helpers
export { graticuleGeoJSON } from './graticule.js';
export { starFieldDataUri } from './starfield.js';
export { circle, points, linesFromMeters, cssToken } from './shapes.js';
// Styles
export { OPENFREEMAP_STYLES, resolveStyle } from './styles.js';
// Basemap theming
export { themeStyle, tokensFor, parseColour } from './theme.js';
export { themes, ink, paper, chart, mono, THEME_NAMES, themeByName, themeNameOf } from './themes.js';
// Context, for building your own map-aware components
export { useMap, useMapOptional } from './context.js';
export { GPU_RENDER_ATTACHMENT, GPU_COPY_SRC } from './overlay.js';
