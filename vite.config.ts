import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// SvelteKit 3 removed svelte.config.js: the configuration that used to live
// there is passed to the sveltekit() plugin instead, and without the old `kit`
// namespace around it.
export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			// src/routes is the demo app only. It is never shipped in the package.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		host: '127.0.0.1',
		port: 5180
	}
});
