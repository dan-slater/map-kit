/// <reference types="@webgpu/types" />
// The WebGPU types are for the demo app only. src/lib never names them, so the
// published package does not make consumers install @webgpu/types.

// See https://svelte.dev/docs/kit/types#app
declare global {
	namespace App {}
}

export {};
