import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// Tauri needs a fixed port to connect to during dev
	server: {
		port: 5173,
		strictPort: true,
		host: true, // listen on 0.0.0.0 so WebView2 can reach it on Windows
	},

	// Tauri environment variables prefix
	envPrefix: ['VITE_', 'TAURI_'],

	build: {
		// Tauri uses Chromium on Windows — target modern browsers
		target: ['es2021', 'chrome100'],
		// Disable minification in debug, enable in release
		minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
		sourcemap: !!process.env.TAURI_DEBUG,
	},
});
