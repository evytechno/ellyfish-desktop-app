import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: 'index.html'  // SPA mode — Tauri handles routing client-side
		})
	},
	preprocess: vitePreprocess()
};

export default config;
