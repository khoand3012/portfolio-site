# Portfolio Site

A single-page CV/portfolio site, built as plain static HTML with a small
JSON-driven build step and a no-code admin panel for editing content.

## How it works

```
content/portfolio.json   ← all editable text (source of truth)
        │
        │  node build.js
        ▼
    index.html            ← generated static page (safe to open directly, good for SEO)
```

- `content/portfolio.json` holds every piece of text on the page: hero info,
  the six tabs (Teaching, International Education, Testing, Publications,
  Talks, Photos & Videos), job entries, education, certificates, gallery
  items.
- `src/head.html` is the static `<head>` (fonts + all CSS). It never changes
  based on content.
- `build.js` is a dependency-free Node script that reads the JSON, escapes
  it, and writes a plain `index.html`. No client-side fetch, no framework —
  the deployed page is real static HTML.
- `index.html` is a **generated file**. Don't hand-edit it — edit
  `content/portfolio.json` and rebuild instead.

## Editing content

**Option A — edit the JSON directly**

Edit `content/portfolio.json`, then run:

```sh
node build.js
```

and open `index.html` in a browser to check it.

**Option B — use the admin panel (for non-technical editors)**

`admin/` wires up [Sveltia CMS](https://sveltiacms.app), a form-based
no-code editor that reads `admin/config.yml` and writes back to
`content/portfolio.json`.

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
`admin/config.yml` points the CMS at a custom OAuth broker
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
  command = "node build.js"
  publish = "."
```

Netlify runs the build on every push (including CMS commits), regenerating
`index.html` automatically.

**Why not Git Gateway?** The classic Netlify CMS/Decap CMS setup used
Netlify Identity + Git Gateway to authenticate editors. Git Gateway is
deprecated (Netlify still supports Identity, but no longer recommends new
Git Gateway setups). Instead, this repo uses `backend: github` directly,
which Netlify can authenticate for free out of the box on sites it hosts —
no Identity, no Git Gateway, no self-hosted OAuth proxy required.

## Updating the CMS script version

`admin/index.html` loads Sveltia CMS from a CDN, pinned to an exact version
with a Subresource Integrity (SRI) hash for security. To bump it:

```sh
NEW_VERSION=x.y.z
curl -sL "https://unpkg.com/@sveltia/cms@$NEW_VERSION/dist/sveltia-cms.js" -o /tmp/sveltia.js
openssl dgst -sha384 -binary /tmp/sveltia.js | openssl base64 -A
```

Update both the version number and the `integrity="sha384-..."` value in
`admin/index.html` together — they must match the exact same file.

## Project structure

```
.
├── admin/
│   ├── config.yml     Sveltia CMS field definitions (must match portfolio.json's shape)
│   └── index.html     CMS loader page
├── content/
│   └── portfolio.json Editable content — the source of truth
├── netlify/
│   ├── functions/
│   │   ├── auth.mjs      OAuth step 1 — redirects to Google
│   │   └── callback.mjs  OAuth step 2 — verifies email, returns GitHub token
│   └── lib/
│       └── oauth-shared.mjs  Shared helpers for the two functions above
├── src/
│   └── head.html      Static <head> (fonts + CSS), unchanged by content
├── build.js            Generates index.html from portfolio.json
├── index.html          Generated — do not hand-edit
├── netlify.toml         Netlify build config
├── .env.example         Copy to .env for local testing (never commit .env)
└── package.json
```
