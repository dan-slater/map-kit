# The `<Overlay>` contract

`<Overlay>` mounts a `<canvas>` over a `<Map>`, keeps it the same size as the
map container at device pixel ratio, and hands your code a stable object for
converting between geography and canvas pixels. It is the surface a simulation
draws into. Everything below is the contract: if a future version breaks any of
it, that is a breaking change.

```svelte
<Map bind:map>
  {#snippet children()}
    <Overlay ondraw={draw} />
  {/snippet}
</Map>

<script lang="ts">
  import { Map, Overlay, type OverlayFrame } from '@dan-slater/map-kit';

  function draw(frame: OverlayFrame) {
    const ctx = frame.ctx!;
    const { x, y } = frame.project(24.9338, -34.0308);
    ctx.fillStyle = '#e3663e';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
</script>
```

## Geometry

The canvas is a sibling of the MapLibre canvas inside the same map container,
positioned `absolute; inset: 0`. That gives one coordinate system and no
offsets to chase:

- **CSS pixel `(0, 0)` is the top-left of the map container**, which is also the
  top-left of the MapLibre canvas and the origin MapLibre's own `project`
  returns.
- `frame.width` and `frame.height` are the canvas size in **CSS pixels**.
- `frame.pixelRatio` is device pixels per CSS pixel. The backing store is
  `canvas.width === Math.round(frame.width * frame.pixelRatio)`, same for
  height.
- For `mode="2d"` the context transform is pre-set to
  `setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)`, so **you draw in CSS
  pixels** and get crisp output on a retina screen for free. If you call
  `ctx.resetTransform()` you are on your own; re-apply the scale yourself.
- For `mode="webgpu"` the swap chain is the raw backing store, so your shaders
  work in **device pixels**. Multiply by `frame.pixelRatio` when you take a
  position from `project`.

## The frame object

The same object instance is handed to `onready`, to `ondraw`, and to the child
snippet. Its fields are live getters, so holding onto it is fine and reading it
later gives current values.

| Member | Meaning |
| --- | --- |
| `canvas` | The `HTMLCanvasElement`. |
| `map` | The MapLibre map this overlay is registered to. |
| `ctx` | `CanvasRenderingContext2D` when `mode="2d"`, else `null`. |
| `gpu` | `{ adapter, device, context, format }` when `mode="webgpu"` and the device is ready, else `null`. |
| `width`, `height` | Canvas size in CSS pixels. |
| `pixelRatio` | Device pixels per CSS pixel. |
| `frame` | Redraw counter. The first draw is `1`. |
| `reason` | Why this redraw happened: `'init'`, `'move'`, `'moveend'`, `'resize'`, `'style'` or `'manual'`. |
| `project(lon, lat)` | Geographic to CSS pixels on this canvas. |
| `unproject(x, y)` | CSS pixels to geographic. Inverse of `project`. |
| `metersPerPixel(lat, lon?)` | Ground metres per CSS pixel, measured from the live camera. |
| `isOccluded(lon, lat)` | `true` when the point is behind the planet under globe projection. |
| `clear()` | Clear the whole canvas. 2d only. |
| `requestRedraw(reason?)` | Ask for a draw on the next animation frame. |

### `project` and `unproject`

These delegate to MapLibre, so they are correct under mercator, under globe,
and under pitch. Two things to know:

- Under globe projection a point on the far side of the planet still projects
  to a finite coordinate. Call `isOccluded` before drawing anything that should
  disappear round the back.
- `unproject` at an extreme pitch can land beyond the horizon, where MapLibre
  returns a point far outside the visible world. Treat results near the top of
  a pitched viewport with suspicion.

### `metersPerPixel`

Measured, not assumed: the overlay projects two points 100 m apart at the
latitude you ask for and divides. This stays right under globe projection and
under pitch, where the Web Mercator formula `156543.03 * cos(lat) / 2^zoom` is
wrong. It is a local linearisation, so sample it at the latitude you care about
rather than once per frame for the whole screen.

## Redraw lifecycle

1. `<Overlay>` waits for the map's `load`.
2. It creates the context (`2d` synchronously, `webgpu` after awaiting an
   adapter and a device), sizes the canvas, and calls `onready(frame)`.
3. It calls `ondraw(frame)` with `reason: 'init'`.
4. After that it calls `ondraw` once per animation frame in which any of these
   happened: the map fired `move`, `moveend`, `resize` or `styledata`, the
   container changed size (watched with a `ResizeObserver`), or something
   called `frame.requestRedraw()`.

Multiple triggers inside one animation frame coalesce into one `ondraw`. The
`reason` reported is the last trigger seen. The counter in `frame.frame`
increments once per actual draw.

With `continuous` set, `ondraw` runs every animation frame whether or not
anything moved. That is what a simulation that advances on its own clock wants;
leave it off for overlays that only react to the camera.

`autoClear` (default `true`, 2d only) clears the canvas before each `ondraw`.
Turn it off to accumulate between frames.

Size changes are applied immediately before `ondraw`, so `frame.width` and
`frame.height` are always current inside your draw function. Note that
resizing a canvas backing store clears it, which is another reason to treat
every `ondraw` as a full repaint.

## Pointer events

The canvas is `pointer-events: none` by default, so the map keeps its own pan,
zoom and rotate gestures. Set `pointerEvents` to let the canvas receive events,
and be aware that you have then taken the map's gestures away in that area.

## WebGPU

```svelte
<Overlay mode="webgpu" onready={setup} ondraw={render} onerror={console.error} />
```

- The device is requested asynchronously. `frame.gpu` is `null` until it
  arrives, and `onready` only fires once it has. If there is no `navigator.gpu`
  or no adapter, `onerror` fires and `frame.gpu` stays `null`.
- The canvas context is configured with the preferred canvas format and
  `alphaMode: 'premultiplied'` so the map shows through. Pass
  `gpuAlphaMode="opaque"` for a fully covering render.
- `frame.gpu.format` is the format already applied by `configure`. Use it for
  your render pipeline's colour target.
- The handles are typed as `unknown` so map-kit does not force `@webgpu/types`
  onto consumers who only draw in 2d. Install `@webgpu/types` in your app and
  cast:

  ```ts
  const device = frame.gpu!.device as GPUDevice;
  const context = frame.gpu!.context as GPUCanvasContext;
  ```

- WebGPU needs a secure context. `http://localhost` and `http://127.0.0.1`
  count; `file://` does not.
- Resizing is handled by assigning `canvas.width` and `canvas.height`. The
  configured context follows the canvas, so you do not re-`configure`, but you
  do need to recreate any size-dependent textures. Check
  `frame.reason === 'resize'`, or just compare against the size you last used.

## Working in metres

A simulation usually wants a fixed grid in metres, not in pixels. Pair the
overlay with `enuFrame`:

```ts
import { enuFrame } from '@dan-slater/map-kit';

const origin = { lon: 24.9338, lat: -34.0308 };
const frameENU = enuFrame(origin.lat, origin.lon);

function draw(f: OverlayFrame) {
  const ctx = f.ctx!;
  ctx.beginPath();
  for (const [xm, ym] of gridInMetres) {
    const [lon, lat] = frameENU.toLonLat(xm, ym);
    const p = f.project(lon, lat);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}
```

Projecting every vertex each frame is the correct thing to do and costs about a
microsecond per thousand points. If you have far more than that, project the
four corners of your grid instead and derive an affine transform, accepting
that it stops being exact under globe curvature.
