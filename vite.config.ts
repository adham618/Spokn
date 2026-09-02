import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  root: '.',
  plugins: [
    svelte(),
    webExtension({
      manifest: () => ({
        manifest_version: 3,
        name: 'Spokn — Offline Text to Speech',
        version: '1.0.3',
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
          // No default_popup — clicking the icon fires action.onClicked in background
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
        permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
        host_permissions: ['<all_urls>', 'file:///*'],
        web_accessible_resources: [
          {
            resources: ['kofi.png'],
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
        },
      }),
      disableAutoLaunch: true,
      printSummary: true,
      skipManifestValidation: true,
      // Use relative base for popup HTML so asset paths resolve in extension context
      htmlViteConfig: {
        base: './',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: false,
  },
});
