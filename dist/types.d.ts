/** A point on the map. `props` is yours: the components never read it. */
export type Pin<P = Record<string, unknown>> = {
    id: string | number;
    lat: number;
    lon: number;
    props?: P;
};
/** Which part of a pin's markup sits on its coordinate. */
export type PinAnchor = 'center' | 'bottom' | 'top' | 'left' | 'right';
/** Payload of `<Map onclick>` and the pin callbacks. */
export type MapPointerEvent = {
    /** Longitude under the pointer, degrees. */
    lon: number;
    /** Latitude under the pointer, degrees. */
    lat: number;
    /** Pixel position inside the map container. */
    point: {
        x: number;
        y: number;
    };
    /** The DOM event that caused this, when there was one. */
    originalEvent?: MouseEvent;
};
/** Camera state reported by `<Map onmove>`. */
export type MapCamera = {
    center: [lon: number, lat: number];
    zoom: number;
    bearing: number;
    pitch: number;
};
