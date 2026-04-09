// Disable SSR for the entire app — required for Tauri (static/SPA mode)
// Tauri serves static files via WebView, no Node.js server at runtime
export const ssr = false;
export const prerender = false;
