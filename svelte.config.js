import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
const config = {
  // vitePreprocess handles <script lang="ts"> in .svelte files
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
};

export default config;
