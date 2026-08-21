# Portfolio Site

A single-page CV/portfolio site, built with [Next.js](https://nextjs.org)
(App Router), driven by one JSON content file — with a live admin panel
(Puck) landing in a later phase of this repo's migration.

## How it works

```
content/portfolio.json      ← all editable text (source of truth for now)
        │
        │  npm run build  (next build)
        ▼
app/page.tsx                 ← loads content via src/lib/portfolioContent.ts
src/components/*.tsx          ← Hero, TabbedContent, BlockRenderer, JobCard, ...
        │
        ▼
    out/index.html            ← generated static page — do not hand-edit, do not commit
```

- `content/portfolio.json` holds every piece of text on the page, restructured
  into per-tab arrays of typed blocks (`job`, `placeholder`, `education`,
  `certificate-group`, `gallery-item`, `note`) — see `src/types.ts`.
- `app/page.tsx` loads that data via `getPortfolioContent()` and renders it by
  composing `src/components/*.tsx`, dispatching each block through
  `BlockRenderer`.
- `src/styles/global.css` is still the site's one stylesheet — imported once by
  `app/layout.tsx`, not scoped per component.
- `out/` is Next.js's static export output (gitignored). Don't hand-edit
  anything in it.

## Editing content

Edit `content/portfolio.json`, then run:

```sh
npm run build          # writes out/index.html
npx serve out           # serve out/ locally to check it
```

or `npm run dev` for a live-reloading dev server while iterating on components.

## Deploying

Push to GitHub, then connect the repo to [Netlify](https://netlify.com).
`netlify.toml` sets:

```toml
[build]
  command = "npm run build"
  publish = "out"
```

This is currently a plain static export — no adapter, no server rendering.
(A later phase of this migration adds a live admin panel, which will require
switching this to server rendering via `@netlify/plugin-nextjs` — see
`docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md`.)

## TypeScript, testing, and Biome

```sh
npm run check   # tsc --noEmit
npm run test    # vitest run
```

`src/types.ts` defines `PortfolioData`/`Block`, matching `content/portfolio.json`'s
shape — keep it in sync when the schema changes.

```sh
npm run lint        # report issues, no changes
npm run lint:fix     # apply safe fixes + formatting
```

## Project structure

```
.
├── content/
│   └── portfolio.json     Editable content — the source of truth (for now)
├── app/
│   ├── layout.tsx           Root layout — imports global.css, fonts
│   └── page.tsx              Loads portfolio content, composes the page
├── src/
│   ├── components/           Hero, TabbedContent, BlockRenderer, JobCard, ...
│   ├── lib/
│   │   └── portfolioContent.ts   getPortfolioContent()
│   ├── styles/
│   │   └── global.css         The site's one stylesheet
│   └── types.ts                PortfolioData/Block — matches content/portfolio.json
├── next.config.js         output: 'export' (static, for now)
├── tsconfig.json
├── biome.json
├── netlify.toml            Build command (npm run build) + publish dir (out)
└── package.json
```
