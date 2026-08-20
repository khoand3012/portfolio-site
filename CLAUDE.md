# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing
overview; this file is about conventions and invariants to preserve.

## What this is

A real person's CV/portfolio site (Truong Nam Nguyen). Content accuracy
matters — names, dates, job titles, and bullet points are factual claims
about someone's career, not filler copy.

## The one invariant: `dist/` is generated, and gitignored

This is an [Astro](https://astro.build) site, `output: 'static'`, no
adapter (see `astro.config.mjs` — do not add `@astrojs/netlify`; that
switches to SSR and would collide with `netlify/functions/`, which is meant
to stay separate and independently deployed). `npm run build` (`astro
build`) reads `content/portfolio.json` (imported directly by
`src/pages/index.astro`) and the components in `src/components/`, and
writes `dist/`. **Never hand-edit anything in `dist/`** — it's gitignored
and regenerated on every Netlify deploy per `netlify.toml`.

- To change page **content**: edit `content/portfolio.json`.
- To change **layout/markup**: edit `src/pages/index.astro` or the relevant
  component in `src/components/`.
- To change **styling**: edit `src/styles/global.css` — one global
  stylesheet, not per-component scoped `<style>` blocks. Keep it that way;
  splitting styles across components is where visual regressions creep in
  for a page this size.

After any change, run `npm run build` and `npm run preview` to check it
before committing — but don't commit `dist/` itself.

## Content fidelity

When editing `content/portfolio.json` text on the user's behalf (as opposed
to the user editing it themselves), do not paraphrase, summarize, or
invent — copy exactly what you're given. This has bitten us before: an
earlier pass generated a design mockup via an AI tool (Stitch) that
silently reworded bullet points and invented a placeholder company name.
If you're ever tempted to have a generative tool (Stitch, an LLM prompt,
etc.) produce new copy for this page, treat its output as a *design*
reference only and reconcile the actual text by hand — see the git history
around the initial redesign for the reasoning.

## Keeping `public/admin/config.yml` and `content/portfolio.json` in sync

The Sveltia CMS config in `public/admin/config.yml` defines form fields by
`name:`, and those names must match `content/portfolio.json`'s keys exactly
(same nesting, same field names) or the CMS will silently fail to show/save
data correctly. If you add/rename/remove a field in the JSON schema, update
`public/admin/config.yml` to match in the same change, and update the
corresponding component in `src/components/` (or `src/pages/index.astro`
for top-level tab structure).

A quick way to sanity-check they still agree: parse both with a script that
walks the YAML `fields` tree and the JSON object tree and diffs the field
names structurally (this was done a few times by hand when the schema
changed — there's no committed script for it, so recreate the check if
you're unsure). Separately, `src/types.ts`'s `PortfolioData` interface is a
second, TypeScript-checked copy of this same shape — update all three
(JSON, config.yml, types.ts) together.

## CDN scripts need pinned versions + SRI

`public/admin/index.html` loads Sveltia CMS from unpkg. It's pinned to an
exact version with a `integrity="sha384-..."` hash — never switch to a
floating range like `@^1.0.0` for a script tag; SRI can't verify a moving
target. When bumping the version, recompute the hash for that exact file
(see README's "Updating the CMS script version" section) and update both
values together.

## Media uploads: `public/uploads`, not `content/uploads`

`public/admin/config.yml`'s `media_folder`/`public_folder` point at
`public/uploads` / `/uploads`. This has to stay under `public/` — anything
outside it (e.g. the old `content/uploads`, used before the Astro
migration) won't get copied into `dist/` at build time, so every uploaded
image would silently 404 on the live site.

## Backend choice: `github`, not `git-gateway`

`public/admin/config.yml` uses `backend: name: github`. Do not switch this
to `git-gateway` — Netlify has deprecated Git Gateway for new setups
(Identity itself is still supported, but Git Gateway is not recommended
going forward).

## Editor auth: Google + allowlist, not GitHub

The content editor has no GitHub account, so `public/admin/config.yml` does
**not** use Netlify's default built-in OAuth for the `github` backend. Instead
`backend.base_url`/`auth_endpoint` point at a custom broker in
`netlify/functions/auth.ts` + `callback.ts`, which gates login behind
Google sign-in and an `ALLOWED_EMAILS` allowlist, then hands back a
pre-provisioned `GITHUB_TOKEN` (env var) that the editor never sees. See
README.md's "Editor access (Google sign-in)" for the full explanation and
required env vars.

Implications for future changes:
- If `public/admin/config.yml`'s `base_url` ever needs to change (e.g. the
  site moves to a different Netlify subdomain or a custom domain), update it
  there **and** the `TRUSTED_ORIGINS` constant in
  `netlify/lib/oauth-shared.ts` **and** the two "Authorized redirect URIs"
  in the Google Cloud OAuth Client — all three must agree exactly, on both
  the production URL and the `localhost:8888` one used for `netlify dev`.
- Don't remove the CSRF cookie check or the `aud`/`email_verified` checks in
  `callback.ts` as a "simplification" — they're what stop a forged request
  from getting a valid GitHub write token.
- To change who can edit, only `ALLOWED_EMAILS` needs to change (in
  Netlify's env var settings) — no code change.

## TypeScript checking needs two commands, not one

`astro check` only walks files reachable from `.astro` pages — it does
**not** type-check `netlify/functions/` or `netlify/lib/` on its own, since
those aren't imported by anything in `src/`. Always run both (`npm run
check` does this):

```sh
npx astro check && npx tsc --noEmit
```

## Biome: `.astro` files are excluded, and why

`biome.json`'s `files.includes` excludes `**/*.astro`. Biome's Astro support
(added v2.3, still experimental as of v2.5) doesn't see that a variable
destructured in a component's frontmatter (`const { job } = Astro.props`) is
used by the template markup below it — it reports nearly every props
destructure as `lint/correctness/noUnusedVariables`/`noUnusedImports`. This
was verified directly: running `biome check --write .` without the
exclusion deleted the actual `Astro.props` destructures and imports from
every component. **Do not remove this exclusion** without first running
`biome check --write` on a throwaway copy and diffing the result — if it's
still deleting used code, keep the exclusion. `public/admin/index.html`
(third-party CMS loader) and `package-lock.json` (machine-generated,
formatting it produces tens of thousands of diagnostics) are excluded for
unrelated reasons — see the comments in `biome.json`'s sibling doc in
README.md.

Also: `biome.json` must be **strict JSON, no `//` comments** — Biome's
config parser rejects them outright, and does so by silently falling back
to full defaults (checking `node_modules`, every `.astro` file, tabs
instead of the configured spaces) rather than erroring loudly on
`biome check .` — only `biome check --config-path` on a single file
surfaces the actual parse error. If `biome check .` ever reports tens of
thousands of diagnostics again, check for a syntax error in `biome.json`
first.

## Local dev: `netlify dev` needs `--framework "#static"`

Astro 7's `astro dev` runs as a background daemon (`astro dev status` /
`astro dev stop` manage it), not a foreground process. Netlify Dev's
framework auto-detection expects the dev command to block in the
foreground; when it returns immediately (because the real server
daemonized), Netlify Dev concludes the process exited and shuts down. Build
first (`npm run build`) and run `netlify dev --framework "#static"` instead
— it serves `dist/` directly alongside `netlify/functions/`, which is what
you want for testing the OAuth broker anyway.

## Design tokens are fixed

The color palette (navy blue / graphite grey / mint green / white, defined
as CSS custom properties in `src/styles/global.css`) was an explicit, deliberate
choice by the site owner. Don't change the hex values as a side effect of
an unrelated change — if a task calls for new UI, reuse the existing
`--navy-*`, `--graphite-*`, `--mint-*` tokens rather than introducing new
colors.
