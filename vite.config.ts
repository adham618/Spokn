import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  root: '.',
  plugins: [
    svelte(),

    // Copy only the JSEP WASM files that kokoro-js's bundled ORT (1.22.0-dev) uses.
    // Must match the ORT version bundled inside kokoro-js's transformers@3.8.1.
    // The outer @huggingface/transformers is imported only for its env; no model
    // loads through it, so its ORT never fetches WASM — no need to copy its files.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/kokoro-js/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
          dest: 'ort',
        },
        {
          src: 'node_modules/kokoro-js/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
          dest: 'ort',
        },
      ],
    }),

    webExtension({
      manifest: () => ({
        manifest_version: 3,
        name: 'Spokn — Offline Text to Speech',
        version: process.env.npm_package_version,
        description: "Read any webpage aloud with word-by-word highlighting. 100% offline, no accounts, no API keys. Uses your device's built-in voices.",
        icons: {
          '16': 'icons/icon16.png',
          '32': 'icons/icon32.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
        action: {
          default_icon: {
            '16': 'icons/icon16.png',
            '32': 'icons/icon32.png',
            '48': 'icons/icon48.png',
            '128': 'icons/icon128.png',
          },
        },
        background: {
          service_worker: 'src/background/background.ts',
          type: 'module',
        },
        content_scripts: [
          {
            matches: ['<all_urls>', 'file:///*'],
            js: ['src/content/content.ts'],
            css: ['src/content/content.css'],
            run_at: 'document_idle',
            all_frames: true,
          },
        ],
        permissions: ['storage', 'unlimitedStorage', 'activeTab', 'contextMenus', 'offscreen'],
        host_permissions: ['<all_urls>', 'file:///*'],
        // wasm-unsafe-eval is required by ONNX Runtime Web (runs WASM JIT in offscreen)
        content_security_policy: {
          extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
        },
        web_accessible_resources: [
          {
            resources: [
              'kofi.png',
              'src/reader/reader.html',
              'src/offscreen/offscreen.html',
              'ort/*.wasm',
              'ort/*.mjs',
            ],
            matches: ['<all_urls>'],
          },
        ],
        commands: {
          'toggle-play': {
            suggested_key: { default: 'Alt+Shift+K', mac: 'Command+Shift+K' },
            description: 'Play / Pause',
          },
          stop: {
            suggested_key: { default: 'Alt+Shift+0', mac: 'Command+Shift+0' },
            description: 'Stop',
          },
          'read-selection': {
            suggested_key: { default: 'Alt+Shift+8', mac: 'Command+Shift+8' },
            description: 'Read selected text',
          },
          'open-reader': {
            suggested_key: { default: 'Alt+Shift+U', mac: 'Command+Shift+U' },
            description: 'Open Spokn Reader',
          },
        },
      }),
      disableAutoLaunch: true,
      printSummary: true,
      skipManifestValidation: true,
      additionalInputs: [
        'src/reader/reader.html',
        'src/offscreen/offscreen.html',
        'src/popup/refresh.html',
        'src/popup/refresh.js',
      ],
      htmlViteConfig: {
        base: './',
      },
    }),
  ],
  resolve: {
    alias: {
      // Stub out Node built-ins so Vite doesn't generate __vite-browser-external.js
      // (Chrome blocks files starting with _). kokoro-js uses these only in its
      // Node.js path which it guards with `if (fs && Object.hasOwn(fs, 'readFile'))`.
      'path':        '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'fs/promises': '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'fs':          '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'url':         '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'stream':      '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'util':        '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'buffer':      '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'crypto':      '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'os':          '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'events':      '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'assert':      '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'http':        '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'https':       '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
      'zlib':        '/Users/adhamtarek/Downloads/Spokn/src/stubs/node-empty.ts',
    },
  },
  assetsInclude: [],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      plugins: [
        {
          name: 'node-builtins-stub',
          resolveId(id: string) {
            if (['path', 'fs/promises', 'fs', 'url', 'stream', 'util',
                 'buffer', 'crypto', 'os', 'events', 'assert',
                 'http', 'https', 'zlib'].includes(id)) {
              return { id: 'virtual:node-stub/' + id, moduleSideEffects: false };
            }
            return null;
          },
          load(id: string) {
            if (id.startsWith('virtual:node-stub/')) {
              return 'export default {}; export const readFile = undefined;';
            }
            return null;
          },
        },
        {
          // Prevent WASM files from being emitted as assets at root —
          // they're already in dist/ort/ via viteStaticCopy.
          name: 'suppress-wasm-assets',
          generateBundle(_opts: unknown, bundle: Record<string, { type: string; fileName: string }>) {
            for (const key of Object.keys(bundle)) {
              if (bundle[key]?.type === 'asset' && key.endsWith('.wasm')) {
                delete bundle[key];
              }
            }
          },
        },
      ],
    },
  },
});
