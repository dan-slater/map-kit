import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// src/routes is the demo app only. It is never shipped in the package.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
