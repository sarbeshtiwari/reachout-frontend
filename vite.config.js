import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Default: built into ../web/dist and served by Flask at /app, /login and /signup.
// `npm run build:netlify`: a standalone site (base "/", output netlify-dist) for Netlify, which forwards
// /api and the public-site paths to the backend (see netlify.toml).
// `npm run dev` proxies the API to the Python server on :5050.
const STANDALONE = process.env.BUILD_TARGET === "netlify";
const API = "http://127.0.0.1:5050";
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Dev server and Netlify build live at the site root; the Flask build is served under /dist/.
  base: command === "serve" || STANDALONE ? "/" : "/dist/",
  build: { outDir: STANDALONE ? "netlify-dist" : "../web/dist", emptyOutDir: true, assetsDir: "static", sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    // Everything the backend serves (the app pages themselves come from Vite: /app, /login, /signup).
    proxy: Object.fromEntries(["/api", "/p/", "/site-preview", "/o/"].map(p => [p, API])),
  },
}));
