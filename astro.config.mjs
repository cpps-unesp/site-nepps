import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import pagefind from 'astro-pagefind';
import rehypeBaseUrl from './src/plugins/rehype-base-url.mjs';

const base = '/site-nepps';

export default defineConfig({
  site: 'https://cpps-unesp.github.io',
  base,
  trailingSlash: 'always',
  output: 'static',
  build: { format: 'directory' },
  markdown: {
    rehypePlugins: [[rehypeBaseUrl, { base }]],
  },
  integrations: [mdx(), pagefind()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    responsiveStyles: true,
  },
});
