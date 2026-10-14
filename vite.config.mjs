import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Strict CSP for the packaged app. Dev skips it because React refresh needs an inline script.
const csp = {
  name: 'hexrona-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https: hexrona-media:; style-src 'self' 'unsafe-inline'; script-src 'self'" />`,
    ),
};

export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react(), csp],
  server: {
    port: 5173,
    strictPort: true,
    // Logo and background live in the project root, outside the renderer folder.
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
