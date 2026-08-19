import { defineConfig } from 'astro/config';

// Plain static output — no SSR adapter. This must stay a fully static build:
// Netlify Functions (netlify/functions/) are deployed independently of this
// build and would need @astrojs/netlify + output: 'server' to interoperate,
// which is unnecessary complexity we don't need here.
export default defineConfig({
  output: 'static',
});
