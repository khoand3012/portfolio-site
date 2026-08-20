# Design: Migrate off Astro to Vite + React, add a local-only Puck editor

Status: draft, awaiting review
Date: 2026-08-20

## Why

The site owner wants a visual editor (Puck, including its opt-in "Puck AI"
scaffolding feature) for editing portfolio content locally. Puck's own
integration guides assume a React app with a native editor route; wedging
that into Astro's `output: 'static'` build (no adapter, per `astro.config.mjs`)
would have required an awkward, fully separate standalone tool with its own
duplicated component set. Removing Astro and rebuilding the site as a plain
Vite + React SPA lets the editor and the rendered site share one component
set and one content model, while keeping the deployed site exactly as static
as it is today.

This is a full framework migration of a live, deployed personal portfolio
site, decided deliberately (not a side effect of the editor request) — see
conversation history for the scoping questions and answers that led here:
Vite + React (not Next.js), exact visual parity with the current design, and
a full block-based content model redesign (not a partial/one-section slice).

## Scope

In scope:
- Replace Astro with Vite + React for the main site build.
- Convert all `src/components/*.astro` to `.tsx`, preserving markup/class
  names so `src/styles/global.css` and the fixed navy/graphite/mint design
  tokens apply unchanged.
- Redesign `content/portfolio.json` (and `src/types.ts`) from today's fixed
  per-tab fields into an ordered array of typed blocks per tab.
- Add a local-only Puck editor (separate Vite entry, never built into
  `dist/`) that edits `content/portfolio.json` directly, including
  scaffolding-only Puck AI wired to a user-supplied `PUCK_API_KEY`.
- Update `netlify.toml` build command if needed, `CLAUDE.md`, `README.md`,
  and `biome.json` to match the new stack.

Out of scope:
- Any live/production editor surface or new auth (explicitly ruled out —
  editor stays local-only, per prior scoping decision).
- Redesigning the visual look (exact parity was chosen over a redesign).
- Automated tests (none exist today; verification stays manual, as before).
- Puck Cloud account creation / obtaining `PUCK_API_KEY` — the site owner
  provides this; it is not something this work can provision.

## Architecture

### Main site (production, deployed to Netlify)

- `index.html` → `src/main.tsx` → `App.tsx`, replacing `src/pages/index.astro`.
  `App.tsx` owns the same tab-switching behavior `index.astro` + `TabNav.astro`
  provide today.
- Every existing `.astro` component becomes a `.tsx` function component with
  the same markup and class names:
  `Hero`, `JobCard`, `EducationCard`, `PlaceholderCard`, `GalleryTile`,
  `MetaItem`, `TabNav`, plus new block-rendering components introduced by the
  content model change below (e.g. a `CertificateItem`, a `Note`/`EmptyNote`
  component, since those are currently inline rather than componentized).
- `content/portfolio.json` is imported directly by `App.tsx` (Vite supports
  JSON imports natively, same ergonomics as the current Astro import).
- Build: `vite build` outputs static assets to `dist/`. `netlify.toml` keeps
  `publish = "dist"`; `command` stays `npm run build`, now running
  `vite build` under the hood. No Netlify adapter, no server runtime — the
  deployed site remains fully static, same hosting model as today.

### Content model

Each tab's content becomes an ordered array of typed blocks instead of fixed
named fields, so Puck can add/reorder/remove entries generically. Proposed
block types, one per existing rendering unit:

- `job` — company, dates, role, bullets (today's `Job`)
- `placeholder` — company, note (today's `PlaceholderEntry`)
- `education` — school, dates, degree, bullets, dissertation
- `certificate` — text, accent
- `gallery-item` — type (photo/video), image, videoUrl
- `note` — a single text block, replacing today's ad hoc `emptyNote` string
  fields (used by `testing`, `publications`, `talks`)

Each tab in `content/portfolio.json` becomes `{ label: string, blocks: Block[] }`
where `Block` is a discriminated union tagged by `type`, matching the list
above. `hero` and `footer` stay as-is (they're not per-tab repeatable lists,
so there's nothing for Puck to reorder there — they don't need to become
blocks).

`src/types.ts` is rewritten to this discriminated-union shape, replacing the
current per-tab interfaces (`TeachingTab`, `TestingTab`, etc.) with the
shared `Tab { label: string; blocks: Block[] }` and a `Block` union. Every
component that currently destructures a tab's named fields
(`jobs`/`placeholders`/`certificates`/`education`/`items`/`emptyNote`) is
updated to instead map over `blocks` and switch on `block.type`.

### Local-only Puck editor

- Lives in this repo under `tools/editor/`, as a second, separate Vite app:
  its own `index.html`/entry and `vite.config.ts`, reusing the same block
  components and types from `src/` for live preview inside the editor.
- Run via `npm run editor` (a new `package.json` script, e.g.
  `vite --config tools/editor/vite.config.ts`). This is never part of
  `npm run build` and never produces output under `dist/` — it has no path
  to the production Netlify deploy.
- Persistence: a small Vite dev-server middleware (via a plugin's
  `configureServer` hook) exposes a save endpoint that exists only while
  `vite dev` is running the editor config locally; it reads/writes
  `content/portfolio.json` on disk directly. There is no equivalent in the
  production build — no adapter, no server, no new attack surface.
- Puck AI: enabled via `PUCK_API_KEY`, read from the already-gitignored
  `.env` (the site owner supplies the key/account; not part of this work).
  Its use is scoped strictly to **scaffolding new blocks or layout**
  (e.g. "add a new job block") — it is never given an affordance to
  generate or rewrite existing prose/bullet text, per this repo's standing
  content-fidelity rule (see `CLAUDE.md`'s "Content fidelity" section and
  the incident it documents). Any block content the editor produces via
  Puck AI is a structural scaffold only; the actual words are still typed
  by a human.
- Safety net: `content/portfolio.json` is a tracked file — a bad edit from
  the editor is recoverable via `git diff` / `git checkout` before it's ever
  committed.

### Docs and tooling updates

- `CLAUDE.md`: rewrite "The one invariant" section for Vite instead of
  Astro (new build command, new file locations for pages/components,
  `dist/` semantics stay the same — still generated, still gitignored).
  Remove or rewrite the Biome `.astro` exclusion section, since there are
  no more `.astro` files; verify plain `biome check --write .` behaves
  correctly on the new `.tsx` components before relying on it (same
  "diff before trusting" rigor the existing doc already calls for).
- `README.md`: update build/dev instructions (`astro dev`/`astro build`/
  `astro check` → `vite`/`vite build`/`tsc --noEmit`).
- `package.json`: remove `astro`, `@astrojs/check`; add `vite`, `react`,
  `react-dom`, `@vitejs/plugin-react`, and the Puck package (verify exact
  current package name/version at implementation time — Puck has renamed
  its core package before, e.g. from `@measured/puck`).
- `astro.config.mjs` is deleted; a `vite.config.ts` is added for the main
  site.

## Error handling

- No new error paths on the deployed site beyond what exists today (static
  assets, no server code to fail at runtime).
- Editor save failures (e.g. disk write error) surface in the editor's own
  UI/console — this only ever runs on a developer's machine, so a console
  error is sufficient; no user-facing error handling needed for a local
  tool.

## Testing / verification plan

No automated tests exist today and none are being added, consistent with
the current repo. Verification is manual, matching the existing
`npm run build && npm run preview` habit:

1. `vite build && vite preview` — visually compare every tab against the
   current deployed site to confirm exact visual parity after the
   component/content-model conversion.
2. Run `npm run editor` locally, confirm it loads the real
   `content/portfolio.json`, that block add/reorder/remove works, and that
   a save round-trips correctly (edit → save → `vite build` reflects the
   change).
3. Confirm Puck AI (once `PUCK_API_KEY` is supplied) only offers
   scaffolding actions, not content rewriting.
4. `biome check .` and `tsc --noEmit` both run clean on the new codebase.

## Open questions for implementation planning (not blocking this spec)

- Exact current Puck package name/version and its precise React API surface
  (confirm at plan/implementation time, since package naming has changed
  before).
- Whether `note` blocks should support the accent-style variation
  `certificate` has, or stay plain text (minor, decide during
  implementation).
