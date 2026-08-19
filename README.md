# Portfolio Site

A single-page CV/portfolio site, built with [Astro](https://astro.build) as
plain static HTML (no client-side framework shipped), driven by one JSON
content file, with a no-code admin panel for editing that content.

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

**Option A — edit the JSON directly**

Edit `content/portfolio.json`, then run:

```sh
npm run build      # writes dist/index.html
npm run preview    # serves dist/ locally to check it
```

or `npm run dev` for a live-reloading dev server while iterating on the
`.astro` components themselves.

**Option B — use the admin panel (for non-technical editors)**

`public/admin/` wires up [Sveltia CMS](https://sveltiacms.app), a form-based
no-code editor that reads `public/admin/config.yml` and writes back to
`content/portfolio.json`. (It lives under `public/` so Astro copies it into
`dist/admin/` untouched, as plain static files — Sveltia isn't part of the
Astro build itself.)

- **Locally, with no GitHub login:** serve the folder (e.g. `npx serve` or
  `python3 -m http.server`), open `/admin/` in Chrome or Edge, and click
  "Work with Local Repository" to point it at this folder. It edits the
  files on disk directly via the File System Access API — no proxy server,
  no auth.
- **On the deployed site:** login goes through Google sign-in, gated to a
  specific list of email addresses — see "Editor access (Google sign-in)"
  below. The editor never needs a GitHub account.
- After a CMS save, the site needs to be rebuilt. On Netlify this happens
  automatically (see `netlify.toml`).

## Editor access (Google sign-in)

The person editing content doesn't have (or need) a GitHub account. Instead,
`public/admin/config.yml` points the CMS at a custom OAuth broker
(`netlify/functions/auth.mjs` + `callback.mjs`) that:

1. Sends the editor to Google's sign-in screen instead of GitHub's.
2. Verifies their Google identity (via Google's tokeninfo endpoint) and
   checks the email against `ALLOWED_EMAILS`.
3. If it matches, hands the CMS a GitHub token that can write to this one
   repo — the editor never sees or needs it.

Protocol reference:
[sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth), the
project's own reference OAuth broker (the same popup/`postMessage` handshake,
with Google + an email allowlist substituted for GitHub's own OAuth).

**Required environment variables** (set in Netlify → Site settings →
Environment variables, and in a local `.env` for testing — see
`.env.example`):

| Variable | What it is |
|---|---|
| `GOOGLE_CLIENT_ID` | From a Google Cloud OAuth Client (Web application) |
| `GOOGLE_CLIENT_SECRET` | From the same OAuth Client |
| `GITHUB_TOKEN` | A fine-grained GitHub PAT scoped to **only** this repo, Contents: read/write |
| `ALLOWED_EMAILS` | Comma-separated list of emails allowed to edit, e.g. `a@gmail.com,b@gmail.com` |

The Google OAuth Client's **Authorized redirect URIs** must include, exactly:

```
https://namtruong0307.netlify.app/api/callback
http://localhost:8888/api/callback     # for local `netlify dev` testing
```

**Testing locally:** copy `.env.example` to `.env`, fill in real values, then
run `netlify dev` and open `http://localhost:8888/admin/`.

To change who can edit, just update `ALLOWED_EMAILS` in Netlify's dashboard
— no code change or redeploy of the function needed (env var changes do
require a redeploy to take effect, which Netlify does automatically when you
save them).

## Deploying

Push to GitHub (already done — this repo), then connect it to
[Netlify](https://netlify.com) as a new site. `netlify.toml` already sets:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify runs `npm install && npm run build` on every push (including CMS
commits), regenerating `dist/` automatically. This is a plain static build —
no `@astrojs/netlify` adapter, no server rendering — so it stays independent
of `netlify/functions/`, which Netlify deploys separately regardless of what
`publish` points to.

**Why not Git Gateway?** The classic Netlify CMS/Decap CMS setup used
Netlify Identity + Git Gateway to authenticate editors. Git Gateway is
deprecated (Netlify still supports Identity, but no longer recommends new
Git Gateway setups). Instead, this repo uses `backend: github` directly,
which Netlify can authenticate for free out of the box on sites it hosts —
no Identity, no Git Gateway, no self-hosted OAuth proxy required.

## Updating the CMS script version

`public/admin/index.html` loads Sveltia CMS from a CDN, pinned to an exact
version with a Subresource Integrity (SRI) hash for security. To bump it:

```sh
NEW_VERSION=x.y.z
curl -sL "https://unpkg.com/@sveltia/cms@$NEW_VERSION/dist/sveltia-cms.js" -o /tmp/sveltia.js
openssl dgst -sha384 -binary /tmp/sveltia.js | openssl base64 -A
```

Update both the version number and the `integrity="sha384-..."` value in
`public/admin/index.html` together — they must match the exact same file.

## Project structure

```
.
├── public/
│   ├── admin/
│   │   ├── config.yml     Sveltia CMS field definitions (must match portfolio.json's shape)
│   │   └── index.html     CMS loader page
│   └── uploads/            Images the CMS uploads land here (media_folder), copied as-is to dist/
├── content/
│   └── portfolio.json     Editable content — the source of truth
├── src/
│   ├── pages/
│   │   └── index.astro     Imports portfolio.json, composes the page
│   ├── components/
│   │   ├── Hero.astro, MetaItem.astro, TabNav.astro, SectionHeader.astro,
│   │   └── JobCard.astro, PlaceholderCard.astro, EducationCard.astro, GalleryTile.astro
│   └── styles/
│       └── global.css      The site's one stylesheet
├── netlify/
│   ├── functions/
│   │   ├── auth.mjs      OAuth step 1 — redirects to Google
│   │   └── callback.mjs  OAuth step 2 — verifies email, returns GitHub token
│   └── lib/
│       └── oauth-shared.mjs  Shared helpers for the two functions above
├── astro.config.mjs      output: 'static', no adapter
├── netlify.toml          Build command (npm run build) + publish dir (dist)
├── .env.example          Copy to .env for local testing (never commit .env)
└── package.json
```

`dist/` (Astro's build output) is gitignored — Netlify generates it fresh on
every deploy via `netlify.toml`'s build command.
