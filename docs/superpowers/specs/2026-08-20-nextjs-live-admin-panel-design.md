# Design: Migrate to Next.js, add a live Puck + Puck AI admin panel

Status: draft, awaiting review
Date: 2026-08-20

Supersedes `2026-08-20-vite-migration-puck-editor-design.md` (that spec
scoped a Vite + React SPA with a local-only editor; the site owner has
since decided to go with a live, hosted admin panel instead, which changes
the framework choice too).

## Why

The site owner wants to edit portfolio content through a live Puck editor
(including Puck AI) reachable on the deployed site itself, not just locally.
That requires an actual backend: authentication to restrict who can edit,
and a persistence layer a running server can write to. Next.js is the
natural fit — Puck's own examples assume a React app with native
server/API routes, and Netlify has first-class Next.js support via
`@netlify/plugin-nextjs`, so the site keeps deploying to the same host.

This is a deliberate reopening of the "no admin panel" decision documented
in `CLAUDE.md` — not a side effect of an unrelated change. See conversation
history for the scoping questions that led here: Next.js over a plain SPA,
Google OAuth restricted to an allow-list, Netlify Blobs (with timestamped
snapshots) over a full database, and this spec replacing the prior one
entirely rather than keeping a local editing path alongside it.

## Scope

In scope:
- Replace Astro with Next.js (App Router) for the whole site.
- Convert `src/components/*.astro` to Next.js React components, preserving
  markup/class names so `src/styles/global.css` and the fixed
  navy/graphite/mint tokens apply unchanged.
- Move content from a git-tracked JSON file to Netlify Blobs, redesigned
  into the same block-based model discussed previously (`job`,
  `placeholder`, `education`, `certificate`, `gallery-item`, `note`), with
  timestamped history snapshots on every save.
- Add Google OAuth (NextAuth.js) gating an `/admin` route, restricted to an
  explicit allowed-email list.
- Mount Puck (including Puck AI, scaffolding-only) at `/admin`, wired to
  read/write the Blob store via server actions.
- Update `netlify.toml` to use `@netlify/plugin-nextjs`; update
  `CLAUDE.md` and `README.md` to describe the new architecture, including
  rewriting `CLAUDE.md`'s "No admin panel" section to document *why this
  admin panel exists and how it's guarded*, so it isn't mistaken for
  leftover cruft later.

Out of scope:
- Any additional editors/roles beyond the single allow-listed owner.
- A full database or CMS backend (Netlify Blobs was chosen over that).
- Redesigning the visual look (exact parity, as before).
- Automated tests (none exist today; verification stays manual).
- Creating the Google OAuth app or Puck Cloud account — the site owner
  provisions `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`PUCK_API_KEY`
  themselves; this plan wires them in, not obtains them.

## Architecture

### Site (Next.js on Netlify)

- App Router (`app/`) replaces `src/pages/index.astro` + Astro's file
  routing. The public page (`app/page.tsx`) renders the same tab UI
  `index.astro`/`TabNav.astro` do today, reading current content from
  Netlify Blobs server-side on each request (no ISR/caching layer needed
  at this traffic scale — simplicity over premature optimization).
- Existing `.astro` components (`Hero`, `JobCard`, `EducationCard`,
  `PlaceholderCard`, `GalleryTile`, `MetaItem`, `TabNav`) become React
  Server/Client components with the same markup and class names, plus new
  small components for block types that are currently inline (`certificate`,
  `note`).
- `netlify.toml` switches from `publish = "dist"` to the
  `@netlify/plugin-nextjs` plugin, which handles Next.js's build output,
  API routes, middleware, and server rendering on Netlify automatically.

### Content model (Netlify Blobs)

Same block taxonomy as the superseded spec — each tab becomes
`{ label: string; blocks: Block[] }`, `Block` a discriminated union over
`job` / `placeholder` / `education` / `certificate` / `gallery-item` /
`note`. `src/types.ts` is rewritten to this shape.

Storage:
- `portfolio/current.json` in Netlify Blobs is the live source of truth,
  read by the public page and by the admin editor.
- `content/portfolio.json` stays in the repo only as the seed value used
  to initialize the Blob store on first deploy (a small server-side
  bootstrap: if `portfolio/current.json` doesn't exist yet, seed it from
  this file).
- Every save from the admin panel writes the new value to
  `portfolio/current.json` **and** to `portfolio/history/{timestamp}.json`
  — a lightweight, append-only history. This replaces the "git diff before
  commit" safety net that a git-tracked file gave for free, which is lost
  once content lives outside git. No pruning logic for now (JSON snapshots
  are small; revisit only if this becomes a real cost/size problem).

### Auth (NextAuth.js + Google OAuth)

- `/admin` (and any admin API routes/server actions) sit behind Next.js
  middleware that requires a valid session.
- NextAuth.js Google provider; on sign-in, the session callback checks the
  authenticated email against `ALLOWED_EMAILS` (a comma-separated env var)
  and rejects anyone not on it.
- New env vars (Netlify): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `ALLOWED_EMAILS`, `NEXTAUTH_SECRET`.

### Editor (Puck + Puck AI)

- Puck's config maps one-to-one onto the block components above, so the
  admin page and the public page share the same rendering components —
  no duplicated component set.
- Save action: validates the session server-side, writes to Blobs (current
  + history snapshot) as above.
- Puck AI: enabled via `PUCK_API_KEY` (site owner supplies this). Scoped
  strictly to **scaffolding new blocks/layout** — it must not be given an
  affordance to generate or rewrite existing prose/bullet text, per this
  repo's standing content-fidelity rule (`CLAUDE.md`, "Content fidelity",
  and the incident it documents).

### Docs and tooling updates

- `CLAUDE.md`: rewrite "The one invariant" for Next.js/Netlify-plugin
  instead of Astro/static output. Rewrite "No admin panel" into a section
  documenting this admin panel's existence, its auth model, and the
  content-fidelity guardrail on Puck AI — so it reads as "here's how the
  admin panel is safely scoped," not stale removal history. Update or
  remove the Biome `.astro` exclusion (no more `.astro` files).
- `README.md`: update build/dev/deploy instructions for Next.js.
- `package.json`: remove `astro`, `@astrojs/check`; add `next`, `react`,
  `react-dom`, `next-auth`, `@netlify/blobs`, `@netlify/plugin-nextjs`, and
  the Puck package (verify current package name/version at implementation
  time).
- `astro.config.mjs` deleted; standard `next.config.js` added.

## Error handling

- Unauthenticated/non-allow-listed access to `/admin` or its server
  actions is rejected server-side (middleware + session check), not just
  hidden in the UI.
- A failed Blob write on save surfaces as an explicit error in the admin
  UI (toast/inline message) rather than silently discarding the edit — the
  editor should not report success unless the write actually succeeded.
- Public page rendering: if the Blob read fails (should be rare), fall
  back to the seed `content/portfolio.json` bundled in the deploy rather
  than showing a broken page.

## Testing / verification plan

No automated tests exist today and none are being added, consistent with
the current repo. Manual verification:

1. `next build` succeeds; `next start` (or Netlify's own preview) matches
   the current deployed look for every tab — visual parity check.
2. Sign in with an allow-listed Google account, confirm `/admin` loads;
   confirm a non-allow-listed account is rejected.
3. Edit content in Puck, save, confirm the public page reflects the change
   and a new `portfolio/history/{timestamp}.json` snapshot was written.
4. Confirm Puck AI only offers scaffolding actions, never content
   rewriting.
5. `biome check .` and `tsc --noEmit`/`next lint` run clean.

## Open questions for implementation planning (not blocking this spec)

- Exact current Puck package name/version and API surface (verify at
  implementation time).
- Whether `note` blocks need the accent-style variation `certificate` has.
- Netlify Blobs read consistency/latency characteristics under concurrent
  admin edits (unlikely to matter with a single editor, but worth a quick
  check during implementation).
