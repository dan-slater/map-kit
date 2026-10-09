/**
 * `GPUTextureUsage.RENDER_ATTACHMENT`, the default canvas usage.
 *
 * Spelled out as a constant so map-kit does not need `@webgpu/types` to name
 * it. Combine with `GPU_COPY_SRC` to read the canvas back.
 */
export const GPU_RENDER_ATTACHMENT = 0x10;
/** `GPUTextureUsage.COPY_SRC`. Add it to `gpuUsage` to allow `copyTextureToBuffer`. */
export const GPU_COPY_SRC = 0x01;
