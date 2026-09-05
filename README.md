# Portfolio Site

A single-page CV/portfolio site, built with [Next.js](https://nextjs.org)
(App Router), with a live admin panel (Puck, at `/admin`) as the primary way
to edit content.

## How it works

```
Netlify Blobs (or .local-blobs/ in dev)   ← live content — current.json + history snapshots
        │           ▲
        │           │  saved from
        │      app/admin/  (Puck editor, Google-OAuth gated)
        ▼
app/page.tsx                 ← loads content via src/lib/portfolioContent.ts
src/components/*.tsx          ← Hero, TabbedContent, BlockRenderer, Container, ...
        │
        ▼
   rendered per-request (Next.js server rendering on Netlify)

content/portfolio.json    ← seed value only, read the first time nothing has been saved yet
```

- Page content is a `PortfolioData` document — an ordered array of tabs,
  each holding a tree of generic blocks (`container`, `heading`, `text`,
  `dates`, `bullets`, `badge`, `image`, `video`), where `container` nests
  other blocks and carries its own layout options — see `src/types.ts`. A
  stored document written before this model existed is upgraded on read by
  `src/lib/contentMigration.ts`. It lives in a Netlify Blobs
  store (`src/lib/blobStore.ts` / `src/lib/portfolioContent.ts`), not in a
  git-tracked file. `content/portfolio.json` only seeds that store the first
  time it's ever read with nothing saved yet.
- `app/page.tsx` loads the current content via `getPortfolioContent()` on
  every request (`export const dynamic = 'force-dynamic'` — this page is
  never statically prerendered, so saved admin edits show up immediately)
  and renders it by composing `src/components/*.tsx`, dispatching each
  block through `BlockRenderer`.
- `src/styles/global.css` is still the site's one stylesheet — imported once by
  `app/layout.tsx`, not scoped per component.
- `.next/` is Next.js's build output (gitignored). Don't hand-edit anything
  in it.

## Editing content

**`/admin` is the primary way to edit content now.** Sign in with an
allow-listed Google account (see "Admin panel" below) and use the Puck
drag-and-drop editor — changes save straight to the live content store and
appear on the public page immediately.

`content/portfolio.json` still exists, but only matters before the site's
very first save: it's the seed value `getPortfolioContent()` falls back to
when nothing has been saved yet (a from-scratch deploy), or if a content-store
read fails outright. Once anything has been saved through `/admin`, editing
this file has no effect on the deployed site.

```sh
npm run dev                    # live-reloading dev server (uses .local-blobs/ locally)
npm run build && npm start     # production build + server, for a closer check before deploying
```

## Admin panel

`/admin` is a live, drag-and-drop content editor built on
[Puck](https://puckeditor.com), plus an optional AI chat panel (Puck AI) for
scaffolding new content blocks. See
`docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md` for
the full design rationale.

**Access:** gated by Google OAuth (Auth.js v5 / `next-auth`, configured in
`auth.ts`) plus an explicit email allow-list — only accounts listed in
`ALLOWED_EMAILS` can sign in and reach `/admin` or save changes.

**Env vars required** (set these in Netlify's site settings, and in a local
`.env`/`.env.local` for `npm run dev`):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client credentials. Redirect URI is `<site-url>/api/auth/callback/google`. |
| `ALLOWED_EMAILS` | Comma-separated list of Google account emails allowed to sign in and edit. |
| `AUTH_SECRET` | Random secret Auth.js uses to sign sessions (`openssl rand -base64 32` or equivalent). `NEXTAUTH_SECRET` also works as a legacy-compatible alias. |
| `PUCK_API_KEY` | From a [Puck Cloud](https://cloud.puckeditor.com/api-keys) account. Only needed for the Puck AI chat panel — drag-and-drop editing and saving work without it. |

`auth.ts` hardcodes `trustHost: true` (Netlify isn't on Auth.js's short list
of platforms it auto-trusts the `Host` header for by default, so without
this Auth.js would reject every request as an untrusted host in
production) — no separate `AUTH_TRUST_HOST` env var is needed for that,
though setting `AUTH_TRUST_HOST=true` instead is an equivalent alternative
if you'd rather configure it via the environment.

Every save writes a `current.json` key plus a timestamped
`history/<ISO-timestamp>.json` snapshot to the content store — a manual
recovery net if an edit needs to be rolled back (nothing currently
lists/restores old snapshots automatically, but they're there).

Puck AI runs on Puck's own default (OpenAI-backed) model — Claude/Anthropic
BYOK isn't supported at the platform level. A content-fidelity guardrail
(system prompt + per-field instructions in `puck.config.tsx`) restricts it
to scaffolding and rearranging content, never rewriting existing real text;
this was live-tested against the real Puck Cloud API and holds, but it's a
prompt-level guardrail, not a hard technical block — the real backstop is
the history snapshots plus owner-only access.

## Deploying

Push to GitHub, then connect the repo to [Netlify](https://netlify.com).
`netlify.toml` sets:

```toml
[build]
  command = "npm run build"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

This is server rendering, not a static export — there's no `publish` dir;
`@netlify/plugin-nextjs` handles Next.js's build output, API routes,
middleware, and per-request rendering on Netlify automatically. Remember to
also set the "Admin panel" env vars above in Netlify's site settings before
the admin panel will work on a deployed site.

## TypeScript, testing, and Biome

```sh
npm run check   # tsc --noEmit
npm run test    # vitest run
```

`src/types.ts` defines `PortfolioData`/`Block`, matching the shape of
content read from the Blob store (and the `content/portfolio.json` seed) —
keep it in sync when the schema changes, along with `app/admin/actions.ts`'s
runtime validation and the `puck.config.tsx`/`src/lib/puckAdapter.ts` mapping
that the admin panel relies on. See `CLAUDE.md` for the full picture.

```sh
npm run lint        # report issues, no changes
npm run lint:fix     # apply safe fixes + formatting
```

## Project structure

```
.
├── content/
│   └── portfolio.json       Seed content only — see "Editing content" above
├── app/
│   ├── layout.tsx             Root layout — imports global.css, fonts
│   ├── page.tsx                Public page — loads content, composes the page (force-dynamic)
│   ├── admin/
│   │   ├── page.tsx              /admin — auth-gated, renders the Puck editor
│   │   └── actions.ts             saveTabBlocksAction — validates + persists a tab's blocks
│   └── api/
│       └── puck/[...all]/route.ts   Puck AI's backend route (also auth-gated)
├── auth.ts                  Auth.js (Google OAuth) config
├── middleware.ts             Redirects unauthenticated /admin, /api/puck requests
├── puck.config.tsx           Maps this app's components to Puck-editable fields
├── src/
│   ├── components/            Hero, TabbedContent, BlockRenderer, Container, PuckAdmin, ...
│   ├── lib/
│   │   ├── blobStore.ts          Netlify Blobs / local-file store abstraction
│   │   ├── portfolioContent.ts    getPortfolioContent() / savePortfolioContent()
│   │   ├── contentMigration.ts    Upgrades a stored pre-generic document, on every read
│   │   ├── sanitizeBlocks.ts      Strips rich-text HTML to an allow-list at save time
│   │   ├── layoutOptions.ts       The allowed container layout values — one source of truth
│   │   ├── tabSlugs.ts            Derives readable DOM ids from tab labels
│   │   ├── allowedEmails.ts       Email allow-list check (ALLOWED_EMAILS)
│   │   └── puckAdapter.ts         Block[] <-> Puck data format conversion
│   ├── styles/
│   │   └── global.css            The site's one stylesheet
│   └── types.ts                  PortfolioData/Block — see CLAUDE.md for what must stay in sync
├── next.config.js           No output: 'export' — server rendering
├── tsconfig.json
├── biome.json
├── netlify.toml              Build command (npm run build) + @netlify/plugin-nextjs
└── package.json
```
