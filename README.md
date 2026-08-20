# Portfolio Site

A single-page CV/portfolio site, built with [Astro](https://astro.build) as
plain static HTML (no client-side framework shipped), driven by one JSON
content file.

## How it works

```
content/portfolio.json      ← all editable text (source of truth)
        │
        │  npm run build  (astro build)
        ▼
src/pages/index.astro       ← imports the JSON, composes components
src/components/*.astro      ← Hero, TabNav, JobCard, EducationCard, GalleryTile, ...
        │
        ▼
    dist/index.html         ← generated static page — do not hand-edit, do not commit
```

- `content/portfolio.json` holds every piece of text on the page: hero info,
  the seven tabs (Teaching, International Education, Testing, Academic
  Background, Publications, Talks, Photos & Videos), job entries, education,
  certificates, gallery items.
- `src/pages/index.astro` imports that JSON directly and renders the page by
  composing small components in `src/components/`. Astro auto-escapes
  `{expression}` interpolations (like JSX), so there's no manual HTML-escaping
  code to maintain.
- `src/styles/global.css` is the site's one stylesheet (colors, typography,
  layout) — imported once by `index.astro`, not scoped per component.
- `dist/` is Astro's **generated build output** (gitignored). Don't hand-edit
  anything in it — edit `content/portfolio.json` or the components instead,
  then rebuild.

## Editing content

Edit `content/portfolio.json`, then run:

```sh
npm run build      # writes dist/index.html
npm run preview    # serves dist/ locally to check it
```

or `npm run dev` for a live-reloading dev server while iterating on the
`.astro` components themselves.

(This repo previously wired up Sveltia CMS with a Google-sign-in-gated admin
panel for non-technical editing. It was removed — see git history around
"Remove Sveltia CMS" if picking that back up, or a similar approach, is ever
wanted again.)

## Deploying

Push to GitHub, then connect the repo to [Netlify](https://netlify.com) as a
new site. `netlify.toml` already sets:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify runs `npm install && npm run build` on every push, regenerating
`dist/` automatically. This is a plain static build — no adapter, no server
rendering.

## TypeScript & Biome

The whole project (Astro components, `src/types.ts`) is TypeScript, checked
with `astro check` (Astro files) and `tsc --noEmit` — run both together
with:

```sh
npm run check
```

`src/types.ts` defines `PortfolioData`, matching `content/portfolio.json`'s
shape; `src/pages/index.astro` casts the JSON import to it. Keep this type
in sync with the JSON when the schema changes.

Linting and formatting use [Biome](https://biomejs.dev):

```sh
npm run lint        # report issues, no changes
npm run lint:fix     # apply safe fixes + formatting
```

**`.astro` files are excluded from Biome** (see `biome.json`). Biome's Astro
support is still experimental and doesn't yet see that variables
destructured in a component's frontmatter are used by the template markup
below it — it flags nearly every props destructure as "unused", and
`--write` would delete real, working code. Re-evaluate this exclusion once
Biome's Astro support matures. `package-lock.json` (machine-generated) is
excluded too.

## Project structure

```
.
├── content/
│   └── portfolio.json     Editable content — the source of truth
├── src/
│   ├── pages/
│   │   └── index.astro     Imports portfolio.json, composes the page
│   ├── components/
│   │   ├── Hero.astro, MetaItem.astro, TabNav.astro,
│   │   └── JobCard.astro, PlaceholderCard.astro, EducationCard.astro, GalleryTile.astro
│   ├── styles/
│   │   └── global.css      The site's one stylesheet
│   └── types.ts             PortfolioData — matches content/portfolio.json's shape
├── astro.config.mjs      output: 'static', no adapter
├── tsconfig.json          extends astro/tsconfigs/strict
├── biome.json             Lint/format config — see "TypeScript & Biome"
├── netlify.toml          Build command (npm run build) + publish dir (dist)
└── package.json
```

`dist/` (Astro's build output) is gitignored — Netlify generates it fresh on
every deploy via `netlify.toml`'s build command.
